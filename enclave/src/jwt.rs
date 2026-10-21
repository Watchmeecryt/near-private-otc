//! Privy sign-in check. The user's Privy access token is verified here (ES256 against the app's
//! JWKS, issuer privy.io, audience = the Private OTC app id compiled in, not expired). The enclave
//! then asks Privy itself, over TLS from inside the TEE, which NEAR accounts are linked to that user.
//! Privy only links its embedded NEAR wallet to the user who created it.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};

pub const ISSUER: &str = "privy.io";
pub const APP_ID: &str = env!("PRIVY_APP_ID");
/// Privy's client API requires an allowed Origin; this is the app's own origin.
pub const APP_ORIGIN: &str = match option_env!("APP_ORIGIN") { Some(o) => o, None => "https://near-private-otc-productio999n.up.railway.app" };

pub fn near_wallets(token: &str) -> Result<Vec<String>, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 { return Err("id token shape".into()); }
    let header: serde_json::Value = serde_json::from_slice(&B64.decode(parts[0]).map_err(|_| "jwt b64")?).map_err(|_| "jwt header")?;
    if header["alg"] != "ES256" { return Err("jwt alg".into()); }
    let jwks: serde_json::Value = serde_json::from_slice(&crate::net::get(&format!("https://auth.privy.io/api/v1/apps/{APP_ID}/jwks.json"))?).map_err(|_| "jwks json")?;
    let keys = jwks["keys"].as_array().ok_or("jwks")?;
    let jwk = match header["kid"].as_str() { Some(k) => keys.iter().find(|j| j["kid"] == k), None => keys.first() }.ok_or("jwt kid unknown")?;
    let x = B64.decode(jwk["x"].as_str().ok_or("x")?).map_err(|_| "x b64")?;
    let y = B64.decode(jwk["y"].as_str().ok_or("y")?).map_err(|_| "y b64")?;
    let mut sec1 = vec![4u8]; sec1.extend_from_slice(&x); sec1.extend_from_slice(&y);
    let key = VerifyingKey::from_sec1_bytes(&sec1).map_err(|_| "ec key")?;
    let sig = Signature::from_slice(&B64.decode(parts[2]).map_err(|_| "sig b64")?).map_err(|_| "sig")?;
    key.verify(format!("{}.{}", parts[0], parts[1]).as_bytes(), &sig).map_err(|_| "id token signature invalid")?;
    let c: serde_json::Value = serde_json::from_slice(&B64.decode(parts[1]).map_err(|_| "claims b64")?).map_err(|_| "claims")?;
    if c["iss"] != ISSUER { return Err("jwt issuer".into()); }
    let aud_ok = c["aud"] == APP_ID || c["aud"].as_array().map(|a| a.iter().any(|x| x == APP_ID)).unwrap_or(false);
    if !aud_ok { return Err("jwt audience".into()); }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    if c["exp"].as_u64().unwrap_or(0) < now { return Err("sign-in expired, sign in again".into()); }
    let sub = c["sub"].as_str().ok_or("no subject")?;
    let me: serde_json::Value = serde_json::from_slice(&crate::net::get_with("https://auth.privy.io/api/v1/users/me",
        &[("Authorization", &format!("Bearer {token}")), ("privy-app-id", APP_ID), ("Origin", APP_ORIGIN)])?).map_err(|_| "user json")?;
    let u = if me["user"].is_object() { &me["user"] } else { &me };
    if u["id"] != sub { return Err("sign-in user mismatch".into()); }
    let w = near_wallets_of(u);
    if w.is_empty() { return Err("no NEAR account linked to this sign-in".into()); }
    Ok(w)
}

/// NEAR implicit accounts (Privy embedded ed25519 wallets) linked to this user.
fn near_wallets_of(u: &serde_json::Value) -> Vec<String> {
    u["linked_accounts"].as_array().map(|a| a.iter().filter(|x| x["type"] == "wallet" && (x["chain_type"] == "near" || x["chainType"] == "near"))
        .filter_map(|x| x["address"].as_str().map(|s| s.to_lowercase())).collect()).unwrap_or_default()
}
