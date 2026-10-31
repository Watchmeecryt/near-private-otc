// External NEAR wallets via HOT Labs' NEAR Connect (@hot-labs/near-connect): wallet code runs in sandboxed iframes
// loaded from a shared manifest, and the connector shows its own wallet picker. Wallet users sign NEP-413 messages
// (sign-in, intents, approvals) with signMessage, and send their own transactions (deposits, add_public_key on the verifier).
import { NearConnector } from "@hot-labs/near-connect";
import { VERIFIER, base58, b64, randomBytes } from "@shared/otc.mjs";
import { viewCall, notifyAuthChange } from "./privy";

/** Wallets whose signMessage we can't use here. NEAR Connect is asked only for wallets that can sign messages and
 *  send transactions, so this stays empty; kept so callers can still gate on it. */
export const NO_SIGN = new Set<string>();
export const APP_RECIPIENT = "near-private-otc";
const LS = "otc-wallet";
type Sess = { account: string; walletId: string; token?: string; proof?: any; exp?: number };
export const walletSession = (): Sess | null => { try { const s = JSON.parse(localStorage.getItem(LS) || "null"); return s && (!s.exp || s.exp > Date.now()) ? s : null; } catch { return null; } };
const saveSess = (s: Sess | null) => { s ? localStorage.setItem(LS, JSON.stringify(s)) : localStorage.removeItem(LS); };
export const walletCanSign = () => { const s = walletSession(); return !!s && !NO_SIGN.has(s.walletId); };

let connector: NearConnector | null = null;
function getConnector(): NearConnector {
  if (!connector) {
    connector = new NearConnector({ network: "testnet", features: { signMessage: true, signAndSendTransaction: true } });
    // Signing out inside the wallet (or another tab) drops our session too.
    connector.on("wallet:signOut", () => { if (walletSession()) { saveSess(null); notifyAuthChange(); } });
  }
  return connector;
}
// Demo/test builds only (VITE_DEMO_WALLET=1, never set in production): a scripted key wallet injected by the
// test harness as window.__demoNear, so recordings and e2e runs can sign NEP-413 messages headlessly.
const demo = (): any => (import.meta.env.VITE_DEMO_WALLET === "1" ? (window as any).__demoNear : null);
async function activeWallet(): Promise<any> {
  const d = demo();
  if (d) return { signMessage: async (p: any) => d.signMessage({ message: p.message, recipient: p.recipient, nonce: Array.from(p.nonce) }), signAndSendTransaction: async () => { throw new Error("The demo wallet does not send NEAR transactions."); } };
  try { return (await getConnector().getConnectedWallet()).wallet; } catch { throw new Error("Your NEAR wallet is no longer connected. Sign in again."); }
}

/** Open NEAR Connect's wallet picker; resolves with the connected account (or rejects if closed). */
export async function connectWallet(): Promise<Sess> {
  const d = demo();
  if (d) { saveSess({ account: await d.account(), walletId: "demo-key" }); await walletApiLogin(); return walletSession()!; }
  const wallet = await getConnector().connect();
  const accounts = await wallet.getAccounts();
  if (!accounts[0]) throw new Error("The wallet did not share an account");
  saveSess({ account: accounts[0].accountId, walletId: wallet.manifest.id });
  if (!NO_SIGN.has(wallet.manifest.id)) await walletApiLogin();
  return walletSession()!;
}
/** NEP-413 sign-in for the keeper API (and the enclave, which re-checks the same proof). */
export async function walletApiLogin() {
  const s = walletSession(); if (!s) throw new Error("Connect a wallet first");
  const proof = await signNep413Wallet(JSON.stringify({ otc_login: s.account, ts: Date.now() }), APP_RECIPIENT, randomBytes(32));
  const r = await fetch("/api/auth/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signed: proof }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || "Wallet sign-in failed");
  saveSess({ ...s, token: j.token, proof, exp: Date.now() + 23 * 3600e3 });
}
export async function disconnectWallet() { saveSess(null); if (demo()) return; try { await getConnector().disconnect(); } catch {} }

const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** signMessage -> MultiPayload-shaped NEP-413 object {standard, payload, public_key, signature}. */
export async function signNep413Wallet(message: string, recipient: string, nonce: Uint8Array) {
  const s = walletSession(); if (!s) throw new Error("Connect a wallet first");
  if (NO_SIGN.has(s.walletId)) throw new Error("This wallet can't sign messages here. Pick another wallet.");
  const w: any = await activeWallet();
  if (!w.signMessage) throw new Error("This wallet doesn't support message signing.");
  const r = await w.signMessage({ message, recipient, nonce });
  if (!r?.signature) throw new Error("The wallet didn't return a signature.");
  if (r.accountId && r.accountId !== s.account) throw new Error("Signed with a different account.");
  const sig = /^[A-Za-z0-9+/=]+$/.test(r.signature) && r.signature.length % 4 === 0 ? unb64(r.signature) : null;
  return { standard: "nep413", payload: { message, nonce: b64(nonce), recipient }, public_key: r.publicKey.startsWith("ed25519:") ? r.publicKey : "ed25519:" + r.publicKey, signature: "ed25519:" + (sig ? base58(sig) : r.signature.replace(/^ed25519:/, "")) };
}

export type FnCall = { method: string; args: object; tgas?: number; deposit?: string };
export async function walletTx(receiverId: string, calls: FnCall[]) {
  const w: any = await activeWallet();
  const actions = calls.map((c) => ({ type: "FunctionCall", params: { methodName: c.method, args: c.args, gas: (BigInt(c.tgas ?? 50) * 10n ** 12n).toString(), deposit: c.deposit ?? "0" } }));
  const out = await w.signAndSendTransaction({ receiverId, actions });
  return out?.transaction?.hash as string | undefined;
}
/** Named accounts must register their signing key on the verifier once (implicit accounts don't). */
export async function ensureVerifierKey(account: string, publicKey: string) {
  if (/^[0-9a-f]{64}$/.test(account)) return;
  const has = await viewCall<boolean>(VERIFIER, "has_public_key", { account_id: account, public_key: publicKey }).catch(() => false);
  if (!has) await walletTx(VERIFIER, [{ method: "add_public_key", args: { public_key: publicKey }, tgas: 30, deposit: "1" }]);
}
export const nonce32 = () => randomBytes(32);
