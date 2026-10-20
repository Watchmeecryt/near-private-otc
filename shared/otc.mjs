// Shared constants and crypto for the browser, the keeper and scripts. No secrets here.
import { encrypt as eciesEncrypt, decrypt as eciesDecrypt, PrivateKey } from "eciesjs";

export const NETWORK = "testnet";
export const VERIFIER = "otcdesk-intents.testnet";
export const KEEPER = "otcdesk.testnet";
export const OUTLAYER_PROJECT = "otcdesk-enclave.testnet/private-otc";
export const ENCLAVE_PUBKEY = "03312dd677a5864ffc8cff352b7419b90896c9aee20e4f79308c1106517a4947e8";
export const EXPLORER = "https://testnet.nearblocks.io";
export const TOKENS = [
  { id: "nep141:otcdesk-usdc.testnet", contract: "otcdesk-usdc.testnet", symbol: "tUSDC", decimals: 6, faucet: "1000" },
  { id: "nep141:wrap.testnet", contract: "wrap.testnet", symbol: "wNEAR", decimals: 24, faucet: "0.2" },
  { id: "nep141:otcdesk-eth.testnet", contract: "otcdesk-eth.testnet", symbol: "tETH", decimals: 18, faucet: "0.5" },
];
export const tokenById = (id) => TOKENS.find((t) => t.id === id || t.contract === id || t.symbol === id);

const enc = new TextEncoder();
const dec = new TextDecoder();
export const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const fromHex = (h) => { h = h.replace(/^0x/, ""); const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };
export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
export const b64 = (u) => { let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
export async function sha256(bytes) { return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)); }

/** Seal JSON to a secp256k1 public key (the enclave, or a one-time browser key). */
export function seal(pubHex, obj) { return toHex(new Uint8Array(eciesEncrypt(pubHex, enc.encode(JSON.stringify(obj))))); }
export function unseal(skHex, hex) { return JSON.parse(dec.decode(eciesDecrypt(skHex, fromHex(hex)))); }
export function newKeypair() { const k = new PrivateKey(); return { sk: k.toHex(), pub: k.publicKey.toHex(true) }; }

/** Human "12.5" -> base units string. */
export function toUnits(human, decimals) {
  const [w, f = ""] = String(human).trim().split(".");
  if (!/^\d*$/.test(w) || !/^\d*$/.test(f)) throw new Error("Enter a number");
  return (BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
}
export function fromUnits(units, decimals, max = 6) {
  const u = BigInt(units || 0), neg = u < 0n, a = neg ? -u : u, d = 10n ** BigInt(decimals);
  let f = (a % d).toString().padStart(decimals, "0").slice(0, max).replace(/0+$/, "");
  return (neg ? "-" : "") + (a / d).toString() + (f ? "." + f : "");
}

// ---- NEAR Intents (NEP-413) ----
const NEP413_TAG = 2 ** 31 + 413;
function borshString(s) { const b = enc.encode(s); const o = new Uint8Array(4 + b.length); new DataView(o.buffer).setUint32(0, b.length, true); o.set(b, 4); return o; }
/** sha256(borsh(tag) || borsh(Nep413Payload{message, nonce[32], recipient, callback_url: None})) */
export async function nep413Hash({ message, nonce, recipient }) {
  const parts = [new Uint8Array(4), borshString(message), nonce, borshString(recipient), new Uint8Array([0])];
  new DataView(parts[0].buffer).setUint32(0, NEP413_TAG, true);
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { all.set(p, i); i += p.length; }
  return sha256(all);
}
/** Build the unsigned intent payload. `intents` e.g. [{intent:"token_diff", diff:{...}}]. */
export function intentPayload({ signer, intents, deadlineMs, nonce = randomBytes(32) }) {
  const message = JSON.stringify({ signer_id: signer, deadline: new Date(deadlineMs).toISOString(), intents });
  return { message, nonce, recipient: VERIFIER };
}
/** Wrap a signature into the verifier's MultiPayload JSON. sign(hash32) -> 64-byte ed25519 signature. */
export async function signIntent(payload, publicKeyB58, sign) {
  const sig = await sign(await nep413Hash(payload));
  return { standard: "nep413", payload: { message: payload.message, nonce: b64(payload.nonce), recipient: payload.recipient }, public_key: `ed25519:${publicKeyB58}`, signature: `ed25519:${base58(sig)}` };
}
export const tokenDiff = (sellId, sellUnits, buyId, buyUnits) => ({ intent: "token_diff", diff: { [sellId]: `-${sellUnits}`, [buyId]: String(buyUnits) } });

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ""; while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b) break; s = "1" + s; }
  return s;
}
