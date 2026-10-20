// Browser side of a deal: build the NEAR Intents token_diff, sign it (NEP-413), seal it to the enclave.
import { ENCLAVE_PUBKEY, TOKENS, VERIFIER, intentPayload, tokenDiff, seal, unseal, newKeypair, b64, randomBytes, fromUnits, tokenById } from "@shared/otc.mjs";
import { viewCall } from "./privy";
import { signNep, identity, APP_RECIPIENT } from "./signer";
import { api, type Terms, type Revealed } from "./api";

export const sym = (id: string) => tokenById(id)?.symbol || id;
export const fmt = (id: string, units: string) => `${fromUnits(units, tokenById(id)?.decimals ?? 0)} ${sym(id)}`;

export async function signedOffer(o: { account: string; deal: string; to: string; terms: Terms; deadlineMs: number; note?: string }) {
  const nonce = randomBytes(32);
  const p = intentPayload({ signer: o.account, intents: [tokenDiff(o.terms.sell_token, o.terms.sell_amount, o.terms.buy_token, o.terms.buy_amount)], deadlineMs: o.deadlineMs, nonce });
  const intent = await signNep(o.account, p);
  const offer = { v: 1, deal: o.deal, from: o.account, to: o.to, terms: o.terms, note: o.note || "", intent };
  return { offer_ct: seal(ENCLAVE_PUBKEY, offer), nonce: b64(nonce) };
}

/** Ask the enclave to re-seal the terms this account may see to a one-time browser key. */
export async function reveal(account: string, deal: string): Promise<{ offers: Revealed[]; tx: string }> {
  const k = newKeypair();
  const request_ct = seal(ENCLAVE_PUBKEY, { ...(await identity(account)), eph_pub: k.pub, account, deal });
  const r = await api<{ offers_ct: string; tx: string }>(`/api/deals/${deal}/reveal`, { request_ct, account });
  const offers = unseal(k.sk, r.offers_ct) as Revealed[];
  try { sessionStorage.setItem(`otc-rev-${deal}-${account}`, JSON.stringify(offers)); } catch {}
  return { offers, tx: r.tx };
}
export const cachedReveal = (account: string, deal: string): Revealed[] | null => { try { return JSON.parse(sessionStorage.getItem(`otc-rev-${deal}-${account}`) || "null"); } catch { return null; } };

/** Cancel: re-use each live nonce in an empty intent so the verifier burns it. */
export async function cancelPayloads(account: string, nonces: string[]) {
  const out = [];
  for (const n of nonces) {
    const nonce = Uint8Array.from(atob(n), (c) => c.charCodeAt(0));
    const p = intentPayload({ signer: account, intents: [], deadlineMs: Date.now() + 10 * 60000, nonce });
    out.push(await signNep(account, p));
  }
  return out;
}
export async function withdrawPayload(account: string, tokenContract: string, amount: string) {
  const p = intentPayload({ signer: account, intents: [{ intent: "ft_withdraw", token: tokenContract, receiver_id: account, amount }], deadlineMs: Date.now() + 10 * 60000 });
  return signNep(account, p);
}
/** Ask for access: the enclave checks you hold enough of the token the maker wants (yes/no only). */
export async function requestAccess(account: string, deal: string) {
  const request_ct = seal(ENCLAVE_PUBKEY, { ...(await identity(account)), account, deal });
  return api<{ request: { status: string } }>(`/api/deals/${deal}/request`, { request_ct, account });
}
/** Maker approval, NEP-413 signed: {otc_approve: deal, requester} ("*" = anyone with funds). */
export async function signApproval(account: string, deal: string, requester: string) {
  return signNep(account, { message: JSON.stringify({ otc_approve: deal, requester }), nonce: randomBytes(32), recipient: APP_RECIPIENT });
}
export async function balances(account: string): Promise<Record<string, string>> {
  const ids = TOKENS.map((t: any) => t.id);
  const r = await viewCall<string[]>(VERIFIER, "mt_batch_balance_of", { account_id: account, token_ids: ids });
  return Object.fromEntries(ids.map((id: string, i: number) => [id, r[i] || "0"]));
}
export const newDealId = () => { const a = "23456789abcdefghjkmnpqrstuvwxyz"; return Array.from(randomBytes(16), (b: number) => a[b % a.length]).join(""); };
