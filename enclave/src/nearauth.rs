//! NEAR-native checks done inside the TEE: NEP-413 signatures (wallet sign-in, maker approvals),
//! access-key ownership via NEAR RPC, and proof of funds (verifier + wallet token balances).
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const APP_RECIPIENT: &str = "near-private-otc";
const RPCS: &[&str] = &["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];

fn rpc(params: Value) -> Result<Value, String> {
    let body = json!({ "jsonrpc": "2.0", "id": "otc", "method": "query", "params": params }).to_string();
    let mut last = String::from("rpc");
    for u in RPCS {
        match crate::net::post(u, &body).and_then(|b| serde_json::from_slice::<Value>(&b).map_err(|_| "rpc json".to_string())) {
            Ok(v) if v.get("result").is_some() => return Ok(v["result"].clone()),
            Ok(v) => { last = v["error"].to_string(); if last.contains("UNKNOWN_ACCESS_KEY") || last.contains("UNKNOWN_ACCOUNT") { return Err(last); } }
            Err(e) => last = e,
        }
    }
    Err(last)
}

fn view(contract: &str, method: &str, args: Value) -> Result<Value, String> {
    let r = rpc(json!({ "request_type": "call_function", "finality": "final", "account_id": contract, "method_name": method, "args_base64": B64.encode(args.to_string()) }))?;
    let bytes: Vec<u8> = r["result"].as_array().ok_or("view result")?.iter().map(|x| x.as_u64().unwrap_or(0) as u8).collect();
    serde_json::from_slice(&bytes).map_err(|_| "view json".to_string())
}

/// Does `pk` ("ed25519:<b58>") control `account`? Implicit accounts: hex(pk) == account. Named: full-access key on chain.
pub fn key_belongs(account: &str, pk: &str) -> Result<bool, String> {
    let raw = bs58::decode(pk.trim_start_matches("ed25519:")).into_vec().map_err(|_| "public key b58")?;
    if account.len() == 64 && account.chars().all(|c| c.is_ascii_hexdigit()) { return Ok(hex::encode(&raw) == account); }
    match rpc(json!({ "request_type": "view_access_key", "finality": "final", "account_id": account, "public_key": pk })) {
        Ok(r) => Ok(r["permission"] == "FullAccess"),
        Err(_) => Ok(false),
    }
}

/// Verify a NEP-413 signed payload {payload:{message, nonce(b64), recipient}, public_key, signature} -> message.
pub fn verify_nep413(s: &Value, recipient: &str) -> Result<String, String> {
    let p = &s["payload"];
    if p["recipient"] != recipient { return Err("signed for another app".into()); }
    let message = p["message"].as_str().ok_or("message")?;
    let nonce = B64.decode(p["nonce"].as_str().ok_or("nonce")?).map_err(|_| "nonce b64")?;
    if nonce.len() != 32 { return Err("nonce length".into()); }
    let mut buf = Vec::new();
    buf.extend_from_slice(&(2147484061u32).to_le_bytes());
    buf.extend_from_slice(&(message.len() as u32).to_le_bytes()); buf.extend_from_slice(message.as_bytes());
    buf.extend_from_slice(&nonce);
    buf.extend_from_slice(&(recipient.len() as u32).to_le_bytes()); buf.extend_from_slice(recipient.as_bytes());
    buf.push(0);
    let h = Sha256::digest(&buf);
    let pk = bs58::decode(s["public_key"].as_str().ok_or("public_key")?.trim_start_matches("ed25519:")).into_vec().map_err(|_| "pk b58")?;
    let sig = bs58::decode(s["signature"].as_str().ok_or("signature")?.trim_start_matches("ed25519:")).into_vec().map_err(|_| "sig b58")?;
    let vk = VerifyingKey::from_bytes(&pk.try_into().map_err(|_| "pk len")?).map_err(|_| "pk")?;
    let sig = Signature::from_slice(&sig).map_err(|_| "sig len")?;
    vk.verify(&h, &sig).map_err(|_| "signature invalid".to_string())?;
    Ok(message.to_string())
}

fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

/// Wallet sign-in: message {"otc_login": account, "ts": ms}, at most 24 h old, signed by a key of that account.
pub fn wallet_login(s: &Value) -> Result<String, String> {
    let m: Value = serde_json::from_str(&verify_nep413(s, APP_RECIPIENT)?).map_err(|_| "login json")?;
    let acct = m["otc_login"].as_str().ok_or("login account")?.to_string();
    let ts = m["ts"].as_u64().ok_or("login ts")?; let now = now_ms();
    if ts > now + 300_000 || now - ts.min(now) > 86_400_000 { return Err("wallet sign-in expired, sign in again".into()); }
    if !key_belongs(&acct, s["public_key"].as_str().unwrap_or(""))? { return Err("that key does not control the account".into()); }
    Ok(acct)
}

/// Maker approval: message {"otc_approve": deal, "requester": account | "*"} signed by the maker. -> requester.
pub fn approval(s: &Value, deal: &str, maker: &str) -> Result<String, String> {
    let m: Value = serde_json::from_str(&verify_nep413(s, APP_RECIPIENT)?).map_err(|_| "approval json")?;
    if m["otc_approve"] != deal { return Err("approval is for another deal".into()); }
    if !key_belongs(maker, s["public_key"].as_str().unwrap_or(""))? { return Err("approval not signed by the maker".into()); }
    Ok(m["requester"].as_str().ok_or("requester")?.to_string())
}

/// Spendable balance of `token_id` ("nep141:<contract>"): inside the verifier plus in the wallet.
pub fn balance(account: &str, token_id: &str) -> Result<u128, String> {
    let p = |v: Value| v.as_str().and_then(|s| s.parse::<u128>().ok()).unwrap_or(0);
    let inside = p(view(crate::VERIFIER, "mt_balance_of", json!({ "account_id": account, "token_id": token_id }))?);
    let wallet = view(token_id.trim_start_matches("nep141:"), "ft_balance_of", json!({ "account_id": account })).map(p).unwrap_or(0);
    Ok(inside.saturating_add(wallet))
}
