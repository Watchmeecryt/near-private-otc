// NEP-413 wallet sign-in for the keeper API. The browser's wallet signs
// {"otc_login": account, "ts": ms} for recipient "near-private-otc"; we check the ed25519 signature,
// that the key is a full-access key of the account (or the implicit account itself), and freshness.
import nc from "node:crypto";
import { RPC } from "./chain.mjs";
import { nep413Hash, toHex } from "../shared/otc.mjs";

export const APP_RECIPIENT = "near-private-otc";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function unb58(s) { let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("b58"); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const c of s) { if (c !== "1") break; out.unshift(0); } return Uint8Array.from(out); }
const SPKI = Buffer.from("302a300506032b6570032100", "hex");

export async function keyBelongs(account, pk) {
  const raw = unb58(pk.replace(/^ed25519:/, ""));
  if (/^[0-9a-f]{64}$/.test(account)) return toHex(raw) === account;
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key", finality: "final", account_id: account, public_key: pk } }), signal: AbortSignal.timeout(8000) });
  const j = await r.json(); return j.result?.permission === "FullAccess";
}

export async function verifyNep413(s, recipient = APP_RECIPIENT) {
  const p = s?.payload; if (!p || p.recipient !== recipient) throw new Error("Signed for another app.");
  const nonce = Buffer.from(p.nonce, "base64"); if (nonce.length !== 32) throw new Error("bad nonce");
  const h = await nep413Hash({ message: p.message, nonce: new Uint8Array(nonce), recipient });
  const key = nc.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(unb58(s.public_key.replace(/^ed25519:/, "")))]), format: "der", type: "spki" });
  if (!nc.verify(null, Buffer.from(h), key, Buffer.from(unb58(s.signature.replace(/^ed25519:/, ""))))) throw new Error("Signature invalid.");
  return p.message;
}

export async function walletLogin(s) {
  const m = JSON.parse(await verifyNep413(s));
  const acct = String(m.otc_login || ""), ts = Number(m.ts);
  if (!acct || !(ts > Date.now() - 86400000 && ts < Date.now() + 300000)) throw new Error("Wallet sign-in expired. Sign in again.");
  if (!(await keyBelongs(acct, s.public_key))) throw new Error("That key does not control this NEAR account.");
  return acct;
}
