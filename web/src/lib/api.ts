import { accessToken } from "./privy";
export type Coarse = { id: string; pair: string; side: "buy" | "sell"; band: string; deadline: string; status: string; created: number; settle_tx: string | null; check_tx: string };
export type OfferMeta = { id: string; kind: "open" | "counter" | "accept"; from: string; to: string; nonce: string; at: number; status: string; reply_to?: string; commitment: string; tx: string };
export type MyDeal = Coarse & { role: "maker" | "taker"; my_status: string; offers: OfferMeta[]; requesters?: number };
export type Terms = { sell_token: string; sell_amount: string; buy_token: string; buy_amount: string };
export type Revealed = { commitment: string; from: string; to: string; terms: Terms; note: string; deadline: string };

export async function api<T = any>(path: string, body?: object): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const t = await accessToken(); if (t) headers.authorization = `Bearer ${t}`;
  const r = await fetch(path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { tx: j.tx });
  return j as T;
}
