// External NEAR wallets via NEAR Wallet Selector. Wallet users sign NEP-413 messages (sign-in, intents,
// approvals) with signMessage, and send their own transactions (deposits, add_public_key on the verifier).
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { VERIFIER, base58, b64, randomBytes } from "@shared/otc.mjs";
import { viewCall } from "./privy";

/** Wallets whose signMessage we can't use here (hardware). Shown, but signing is disabled. */
export const NO_SIGN = new Set(["ledger"]);
export const WALLETS = [
  { id: "meteor-wallet", name: "Meteor", sign: true }, { id: "hot-wallet", name: "HOT", sign: true },
  { id: "intear-wallet", name: "Intear", sign: true }, { id: "here-wallet", name: "HERE", sign: true },
  { id: "my-near-wallet", name: "MyNearWallet", sign: true }, { id: "ledger", name: "Ledger", sign: false },
];
export const APP_RECIPIENT = "near-private-otc";
const LS = "otc-wallet";
type Sess = { account: string; walletId: string; token?: string; proof?: any; exp?: number };
export const walletSession = (): Sess | null => { try { const s = JSON.parse(localStorage.getItem(LS) || "null"); return s && (!s.exp || s.exp > Date.now()) ? s : null; } catch { return null; } };
const saveSess = (s: Sess | null) => { s ? localStorage.setItem(LS, JSON.stringify(s)) : localStorage.removeItem(LS); };
export const walletCanSign = () => { const s = walletSession(); return !!s && !NO_SIGN.has(s.walletId); };

let sel: Promise<WalletSelector> | null = null; let modal: WalletSelectorModal | null = null;
async function selector() {
  if (!sel) sel = (async () => {
    const [{ setupWalletSelector }, m, h, i, he, mn, l] = await Promise.all([
      import("@near-wallet-selector/core"), import("@near-wallet-selector/meteor-wallet"), import("@near-wallet-selector/hot-wallet"),
      import("@near-wallet-selector/intear-wallet"), import("@near-wallet-selector/here-wallet"), import("@near-wallet-selector/my-near-wallet"), import("@near-wallet-selector/ledger")]);
    return setupWalletSelector({ network: "testnet", modules: [m.setupMeteorWallet(), h.setupHotWallet(), i.setupIntearWallet(), he.setupHereWallet(), mn.setupMyNearWallet(), l.setupLedger()] as any });
  })();
  return sel;
}
async function activeWallet() { const s = await selector(); return s.wallet(); }

/** Open the Wallet Selector modal; resolves with the connected account (or rejects if closed). */
export async function connectWallet(): Promise<Sess> {
  const s = await selector();
  if (!modal) { const { setupModal } = await import("@near-wallet-selector/modal-ui"); await import("@near-wallet-selector/modal-ui/styles.css"); modal = setupModal(s, { contractId: VERIFIER, description: "Connect a NEAR testnet wallet to trade on Private OTC." }); }
  const acct = await new Promise<{ accountId: string; walletId: string }>((res, rej) => {
    const sub = s.on("signedIn", (e: any) => { sub.remove(); res({ accountId: e.accounts[0].accountId, walletId: e.walletId }); });
    const h = modal!.on("onHide", () => setTimeout(() => { if (!s.isSignedIn()) { sub.remove(); h.remove(); rej(new Error("Wallet connection cancelled")); } }, 400));
    modal!.show();
  });
  const sess: Sess = { account: acct.accountId, walletId: acct.walletId };
  saveSess(sess);
  if (!NO_SIGN.has(acct.walletId)) await walletApiLogin();
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
export async function disconnectWallet() { saveSess(null); try { await (await activeWallet()).signOut(); } catch {} }

const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** signMessage -> MultiPayload-shaped NEP-413 object {standard, payload, public_key, signature}. */
export async function signNep413Wallet(message: string, recipient: string, nonce: Uint8Array) {
  const s = walletSession(); if (!s) throw new Error("Connect a wallet first");
  if (NO_SIGN.has(s.walletId)) throw new Error("This wallet can't sign messages here. Use Meteor, HOT, Intear, HERE or MyNearWallet.");
  const w: any = await activeWallet();
  if (!w.signMessage) throw new Error("This wallet doesn't support message signing.");
  const { Buffer } = await import("buffer");
  const r = await w.signMessage({ message, recipient, nonce: Buffer.from(nonce) });
  if (!r?.signature) throw new Error("The wallet didn't return a signature.");
  if (r.accountId && r.accountId !== s.account) throw new Error("Signed with a different account.");
  const sig = /^[A-Za-z0-9+/=]+$/.test(r.signature) && r.signature.length % 4 === 0 ? unb64(r.signature) : null;
  return { standard: "nep413", payload: { message, nonce: b64(nonce), recipient }, public_key: r.publicKey.startsWith("ed25519:") ? r.publicKey : "ed25519:" + r.publicKey, signature: "ed25519:" + (sig ? base58(sig) : r.signature.replace(/^ed25519:/, "")) };
}

export type FnCall = { method: string; args: object; tgas?: number; deposit?: string };
export async function walletTx(receiverId: string, calls: FnCall[]) {
  const w: any = await activeWallet();
  const out = await w.signAndSendTransaction({ receiverId, actions: calls.map((c) => ({ type: "FunctionCall", params: { methodName: c.method, args: c.args, gas: String(BigInt(c.tgas ?? 50) * 10n ** 12n), deposit: c.deposit ?? "0" } })) });
  return out?.transaction?.hash as string | undefined;
}
/** Named accounts must register their signing key on the verifier once (implicit accounts don't). */
export async function ensureVerifierKey(account: string, publicKey: string) {
  if (/^[0-9a-f]{64}$/.test(account)) return;
  const has = await viewCall<boolean>(VERIFIER, "has_public_key", { account_id: account, public_key: publicKey }).catch(() => false);
  if (!has) await walletTx(VERIFIER, [{ method: "add_public_key", args: { public_key: publicKey }, tgas: 30, deposit: "1" }]);
}
export const nonce32 = () => randomBytes(32);
