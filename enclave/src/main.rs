//! Private OTC enclave (OutLayer WASI, runs inside Intel TDX).
//!
//! stdin JSON -> stdout JSON. Actions:
//!   pubkey : the enclave's ECIES public key (secp256k1). Browsers seal deal offers to it.
//!   check  : open one sealed offer, verify its signed NEAR Intents payload matches the sealed terms,
//!            and return ONLY coarse public facts (pair, side, deadline, parties; no size or price).
//!   request: authenticate a requester (Privy or NEP-413 wallet sign-in) for a deal. No amount check.
//!   approval: validate a maker's NEP-413 approval {otc_approve: deal, requester | "*"}.
//!   reveal : a signed-in party proves (via Privy, checked from inside the TEE) that they hold a NEAR
//!            account; the enclave re-seals the exact terms of the offers that account may see to the
//!            caller's one-time browser key. The opening offer is visible to the maker and to requesters the maker approved
//!            (or anyone with funds if the maker signed a "*" approval);
//!            counter-offers and accepts only to the two parties named inside them.
//!   settle : two sealed offers that are exact mirror images (same deal, opposite token legs, equal
//!            amounts, different signers) -> the two signed intents in plaintext, ready for
//!            execute_intents. Anything that is not an exact match is refused, so the operator can't
//!            settle at terms a party did not sign. Settled transfers are public on chain anyway.
//!
//! The private key is HKDF(PROTECTED_OTC_MASTER), generated inside the OutLayer keystore TEE.

mod jwt;
mod net;
mod nearauth;

use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{self, Read, Write};

const KEY_INFO: &[u8] = b"private-otc:ecies:v1";
pub const VERIFIER: &str = "otcdesk-intents.testnet";
/// token id -> (symbol, decimals)
const TOKENS: &[(&str, &str, u32)] = &[
    ("nep141:otcdesk-usdc.testnet", "tUSDC", 6),
    ("nep141:wrap.testnet", "wNEAR", 24),
    ("nep141:otcdesk-eth.testnet", "tETH", 18),
];

#[derive(Deserialize)]
struct Input { action: String, #[serde(default)] offers: Vec<String>, request: Option<String>, approval: Option<Value> }

#[derive(Deserialize, Clone)]
struct Terms { sell_token: String, sell_amount: String, buy_token: String, buy_amount: String }

#[derive(Deserialize, Clone)]
struct Offer {
    v: u32,
    deal: String,
    /// signer of the intent
    from: String,
    /// counterparty, or "*" for the opening offer on the public board
    to: String,
    terms: Terms,
    #[serde(default)]
    note: String,
    intent: Value,
}

#[derive(Deserialize)]
struct RevealReq { #[serde(default)] id_token: Option<String>, #[serde(default)] wallet: Option<Value>, #[serde(default)] eph_pub: String, account: String, deal: String }

/// Who is asking: Privy sign-in (embedded NEAR wallet) or a NEP-413 wallet sign-in.
fn authenticate(req: &RevealReq) -> Result<(), String> {
    if let Some(w) = &req.wallet { if nearauth::wallet_login(w)? == req.account { return Ok(()); } return Err("wallet sign-in is for another account".into()); }
    let wallets = jwt::near_wallets(req.id_token.as_deref().ok_or("sign in first")?)?;
    if wallets.iter().any(|w| *w == req.account) { Ok(()) } else { Err("this sign-in does not hold that NEAR account".into()) }
}


fn main() {
    let mut s = String::new();
    let out = match io::stdin().read_to_string(&mut s) {
        Err(e) => err(format!("stdin: {e}")),
        Ok(_) => match serde_json::from_str::<Input>(&s) {
            Err(e) => err(format!("bad input: {e}")),
            Ok(i) => match run(i) { Ok(v) => json!({"success": true, "result": v}), Err(e) => err(e) },
        },
    };
    let _ = io::stdout().write_all(out.to_string().as_bytes());
    let _ = io::stdout().flush();
}
fn err(e: String) -> Value { json!({"success": false, "result": null, "error": e}) }

fn secret_key() -> Result<[u8; 32], String> {
    let m = std::env::var("PROTECTED_OTC_MASTER").map_err(|_| "missing PROTECTED_OTC_MASTER".to_string())?;
    let m = hex::decode(m.trim()).map_err(|e| format!("master hex: {e}"))?;
    let hk = hkdf::Hkdf::<Sha256>::new(Some(b"private-otc"), &m);
    let mut k = [0u8; 32];
    hk.expand(KEY_INFO, &mut k).map_err(|_| "hkdf".to_string())?;
    libsecp256k1::SecretKey::parse(&k).map_err(|e| format!("sk: {e:?}"))?;
    Ok(k)
}

fn open(hexct: &str) -> Result<(String, Vec<u8>), String> {
    let ct = hex::decode(hexct.trim_start_matches("0x")).map_err(|_| "ct hex".to_string())?;
    let plain = ecies::decrypt(&secret_key()?, &ct).map_err(|_| "decrypt failed".to_string())?;
    Ok((hex::encode(Sha256::digest(&ct)), plain))
}

fn seal_to(pub_hex: &str, plain: &[u8]) -> Result<String, String> {
    let pk = hex::decode(pub_hex.trim_start_matches("0x")).map_err(|_| "pubkey hex".to_string())?;
    ecies::encrypt(&pk, plain).map(hex::encode).map_err(|e| format!("seal: {e:?}"))
}

fn amt(s: &str) -> Result<u128, String> { s.parse::<u128>().map_err(|_| "amount".to_string()).and_then(|a| if a == 0 { Err("zero amount".into()) } else { Ok(a) }) }
fn token(id: &str) -> Result<(&'static str, u32), String> { TOKENS.iter().find(|t| t.0 == id).map(|t| (t.1, t.2)).ok_or_else(|| format!("unknown token {id}")) }

/// Decrypt + validate an offer: the signed intent must be a NEP-413 payload for our verifier, signed
/// by `from`, whose only intent is a token_diff of exactly -sell / +buy.
fn offer(hexct: &str) -> Result<(String, Offer, String), String> {
    let (commit, plain) = open(hexct)?;
    let o: Offer = serde_json::from_slice(&plain).map_err(|e| format!("offer json: {e}"))?;
    if o.v != 1 || o.deal.is_empty() || o.deal.len() > 32 || o.note.len() > 280 { return Err("offer shape".into()); }
    let t = &o.terms;
    if t.sell_token == t.buy_token { return Err("same token".into()); }
    let (sell, buy) = (amt(&t.sell_amount)?, amt(&t.buy_amount)?);
    token(&t.sell_token)?; token(&t.buy_token)?;
    if o.intent["standard"] != "nep413" { return Err("intent must be nep413".into()); }
    let p = &o.intent["payload"];
    if p["recipient"] != VERIFIER { return Err("intent is for another verifier".into()); }
    let m: Value = serde_json::from_str(p["message"].as_str().ok_or("message")?).map_err(|_| "message json".to_string())?;
    if m["signer_id"] != o.from.as_str() { return Err("signer is not the offer's author".into()); }
    let deadline = m["deadline"].as_str().ok_or("deadline")?.to_string();
    let ints = m["intents"].as_array().ok_or("intents")?;
    if ints.len() != 1 || ints[0]["intent"] != "token_diff" { return Err("exactly one token_diff intent".into()); }
    let d = ints[0]["diff"].as_object().ok_or("diff")?;
    if d.len() != 2 { return Err("diff must have two legs".into()); }
    let want_sell = format!("-{sell}");
    if d.get(&t.sell_token).and_then(|v| v.as_str()) != Some(want_sell.as_str()) || d.get(&t.buy_token).and_then(|v| v.as_str()) != Some(buy.to_string().as_str()) {
        return Err("signed intent does not match the sealed terms".into());
    }
    Ok((commit, o, deadline))
}

/// Coarse public facts: pair (base/quote), side and deadline only. No size or price hint of any kind.
fn coarse(o: &Offer, deadline: &str) -> Result<Value, String> {
    let t = &o.terms;
    let rank = |id: &str| TOKENS.iter().position(|x| x.0 == id).unwrap_or(9);
    // quote = the lower-ranked token (tUSDC before wNEAR before tETH)
    let (quote, base, side) = if rank(&t.sell_token) < rank(&t.buy_token) { (&t.sell_token, &t.buy_token, "buy") } else { (&t.buy_token, &t.sell_token, "sell") };
    let (qs, _) = token(quote)?; let (bs, _) = token(base)?;
    Ok(json!({ "deal": o.deal, "from": o.from, "to": o.to, "pair": format!("{bs}/{qs}"), "side": side, "deadline": deadline }))
}

fn run(input: Input) -> Result<Value, String> {
    match input.action.as_str() {
        "pubkey" => {
            let sk = libsecp256k1::SecretKey::parse(&secret_key()?).unwrap();
            let pk = libsecp256k1::PublicKey::from_secret_key(&sk);
            Ok(json!({ "pubkey": hex::encode(pk.serialize_compressed()), "scheme": "ecies-secp256k1-aes256gcm (eciesjs compatible)", "verifier": VERIFIER }))
        }
        "check" => {
            let (commit, o, dl) = offer(input.offers.first().ok_or("offers[0]")?)?;
            let mut c = coarse(&o, &dl)?;
            c["commitment"] = json!(commit);
            Ok(c)
        }
        "reveal" => {
            let (_, rplain) = open(input.request.as_deref().ok_or("request")?)?;
            let req: RevealReq = serde_json::from_slice(&rplain).map_err(|e| format!("request json: {e}"))?;
            authenticate(&req)?;
            // Non-makers need the maker's signed approval (for them, or "*" = anyone with funds).
            let mut opening = None;
            for ct in &input.offers { let (_, o, _) = offer(ct)?; if o.to == "*" { opening = Some(o); break; } }
            let open_o = opening.ok_or("opening offer missing")?;
            if open_o.deal != req.deal { return Err("offer belongs to another deal".into()); }
            if open_o.from != req.account {
                let who = nearauth::approval(input.approval.as_ref().ok_or("the maker has not approved you yet")?, &req.deal, &open_o.from)?;
                if who != "*" && who != req.account { return Err("approval is for someone else".into()); }
            }
            let mut seen = vec![];
            for ct in &input.offers {
                let (commit, o, dl) = offer(ct)?;
                if o.deal != req.deal { return Err("offer belongs to another deal".into()); }
                if o.to == "*" || o.to == req.account || o.from == req.account {
                    seen.push(json!({ "commitment": commit, "from": o.from, "to": o.to, "terms": { "sell_token": o.terms.sell_token, "sell_amount": o.terms.sell_amount, "buy_token": o.terms.buy_token, "buy_amount": o.terms.buy_amount }, "note": o.note, "deadline": dl }));
                }
            }
            Ok(json!({ "deal": req.deal, "viewer": req.account, "offers_ct": seal_to(&req.eph_pub, Value::Array(seen.clone()).to_string().as_bytes())?, "visible": seen.len() }))
        }
        "request" => {
            // Authenticates the requester for this deal. Deliberately NOT compared with the sealed amount
            // (a pass/fail would leak size by probing); the keeper applies a fixed public $ threshold.
            let (_, rplain) = open(input.request.as_deref().ok_or("request")?)?;
            let req: RevealReq = serde_json::from_slice(&rplain).map_err(|e| format!("request json: {e}"))?;
            authenticate(&req)?;
            let (_, o, _) = offer(input.offers.first().ok_or("offers[0]")?)?;
            if o.to != "*" || o.deal != req.deal { return Err("not this deal's opening offer".into()); }
            if o.from == req.account { return Err("this is your own deal".into()); }
            let (want, _) = token(&o.terms.buy_token)?;
            Ok(json!({ "deal": req.deal, "viewer": req.account, "want": want }))
        }
        "approval" => {
            // Validate a maker approval (so the keeper can't store a forged one). Output: requester only.
            let (_, o, _) = offer(input.offers.first().ok_or("offers[0]")?)?;
            if o.to != "*" { return Err("not an opening offer".into()); }
            let who = nearauth::approval(input.approval.as_ref().ok_or("approval")?, &o.deal, &o.from)?;
            Ok(json!({ "deal": o.deal, "maker": o.from, "requester": who }))
        }
        "settle" => {
            if input.offers.len() != 2 { return Err("settle needs two offers".into()); }
            let (ca, a, _) = offer(&input.offers[0])?;
            let (cb, b, _) = offer(&input.offers[1])?;
            if a.deal != b.deal { return Err("different deals".into()); }
            if a.from == b.from { return Err("same signer on both sides".into()); }
            if !(a.to == "*" || a.to == b.from) || b.to != a.from { return Err("offers are not addressed to each other".into()); }
            let (x, y) = (&a.terms, &b.terms);
            if x.sell_token != y.buy_token || x.buy_token != y.sell_token || amt(&x.sell_amount)? != amt(&y.buy_amount)? || amt(&x.buy_amount)? != amt(&y.sell_amount)? {
                return Err("terms do not match exactly".into());
            }
            Ok(json!({ "deal": a.deal, "commitments": [ca, cb], "signed": [a.intent, b.intent] }))
        }
        _ => Err("unknown action".into()),
    }
}
