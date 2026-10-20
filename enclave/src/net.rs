#[cfg(feature = "wasi")]
mod imp {
    use std::time::Duration;
    use wasi_http_client::Client;
    pub fn get(url: &str) -> Result<Vec<u8>, String> {
        let r = Client::new().get(url).header("User-Agent", "private-otc-enclave/0.1").header("Accept-Encoding", "identity")
            .connect_timeout(Duration::from_secs(8)).send().map_err(|e| format!("{url}: {e}"))?;
        if r.status() != 200 { return Err(format!("{url}: {}", r.status())); }
        r.body().map_err(|e| e.to_string())
    }
    pub fn get_with(url: &str, headers: &[(&str, &str)]) -> Result<Vec<u8>, String> {
        let mut c = Client::new().get(url).header("User-Agent", "private-otc-enclave/0.1").header("Accept-Encoding", "identity");
        for (k, v) in headers { c = c.header(*k, *v); }
        let r = c.connect_timeout(Duration::from_secs(8)).send().map_err(|e| format!("{url}: {e}"))?;
        if r.status() != 200 { return Err(format!("sign-in check failed ({})", r.status())); }
        r.body().map_err(|e| e.to_string())
    }
    pub fn post(url: &str, body: &str) -> Result<Vec<u8>, String> {
        let r = Client::new().post(url).header("Content-Type", "application/json").header("Accept-Encoding", "identity")
            .connect_timeout(Duration::from_secs(8)).body(body.as_bytes()).send().map_err(|e| format!("{url}: {e}"))?;
        r.body().map_err(|e| e.to_string())
    }
}
#[cfg(not(feature = "wasi"))]
mod imp {
    pub fn get(_: &str) -> Result<Vec<u8>, String> { Err("no net".into()) }
    pub fn post(_: &str, _: &str) -> Result<Vec<u8>, String> { Err("no net".into()) }
    pub fn get_with(_: &str, _: &[(&str, &str)]) -> Result<Vec<u8>, String> { Err("no net".into()) }
}
pub use imp::*;
