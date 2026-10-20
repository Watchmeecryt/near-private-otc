// One signing surface for both kinds of user: Privy (embedded implicit account, raw-hash signing)
// and external NEAR wallets (Wallet Selector signMessage). Both produce the same NEP-413 object.
import { VERIFIER, signIntent } from "@shared/otc.mjs";
import { walletSession, signNep413Wallet, ensureVerifierKey, APP_RECIPIENT } from "./wallet";
import { publicKeyB58, signHash, accessToken as privyToken } from "./privy";

export const isWallet = (account: string | null) => !!account && walletSession()?.account === account;
export async function signNep(account: string, p: { message: string; nonce: Uint8Array; recipient: string }) {
  if (isWallet(account)) {
    const s = await signNep413Wallet(p.message, p.recipient, p.nonce);
    if (p.recipient === VERIFIER) await ensureVerifierKey(account, s.public_key);
    return s;
  }
  return signIntent(p, publicKeyB58(account), (h: Uint8Array) => signHash(account, h));
}
/** Bearer for the keeper API: wallet session token, else the Privy access token. */
export async function authToken(): Promise<string | null> { const s = walletSession(); return s?.token || privyToken(); }
/** What the enclave needs to know who you are (sealed inside the request). */
export async function identity(account: string) {
  const s = walletSession();
  if (s?.account === account) { if (!s.proof) throw new Error("Sign in with your wallet again."); return { wallet: s.proof }; }
  return { id_token: await privyToken() };
}
export { APP_RECIPIENT };
