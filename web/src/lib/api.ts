import { authToken } from "./signer";
import { walletCanSign, walletApiLogin } from "./wallet";
export type Coarse = { id: string; pair: string; side: "buy" | "sell"; counters: number; requests: number; auto_approve: boolean; visibility: "public" | "private"; deadline: string; status: string; created: number; settle_tx: string | null; check_tx: string; views?: number; viewers?: number; viewer_seeds?: string[] };
export type OfferMeta = { id: string; kind: "open" | "counter" | "accept"; from: string; to: string; nonce: string; at: number; status: string; reply_to?: string; commitment: string; tx: string };
export type MyDeal = Omit<Coarse, never> & { role: "maker" | "taker"; my_status: string; offers: OfferMeta[]; requesters?: number; view_log?: { account: string; at: number }[]; request_list?: Req[]; my_request?: Partial<Req> };
export type Req = { account: string; at: number; status: "pending" | "approved" | "declined"; auto?: boolean; tx?: string };
export type Terms = { sell_token: string; sell_amount: string; buy_token: string; buy_amount: string };
export type Revealed = { commitment: string; from: string; to: string; terms: Terms; note: string; deadline: string };

export async function api<T = any>(path: string, body?: object): Promise<T> {
  const send = async () => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const t = await authToken(); if (t) headers.authorization = `Bearer ${t}`;
    return fetch(path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers, cache: "no-store" });
  };
  let r = await send();
  // Wallet users: the keeper's session store can be reset (restart/redeploy), or the NEP-413 sign-in may
  // never have completed (no token). Re-sign once with the wallet and retry instead of failing with 401.
  if (r.status === 401 && walletCanSign() && path !== "/api/auth/wallet") { await walletApiLogin(); r = await send(); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { tx: j.tx });
  return j as T;
}
