import { useEffect, useState } from "react";
import { tokenById } from "@shared/otc.mjs";
export type Prices = Record<string, number> & { source?: any };
let cache: { at: number; v: Prices | null } = { at: 0, v: null };
export function usePrices() {
  const [p, setP] = useState<Prices | null>(cache.v);
  useEffect(() => {
    let live = true;
    const load = () => { if (cache.v && Date.now() - cache.at < 30000) return setP(cache.v); fetch("/api/prices").then((r) => r.ok ? r.json() : null).then((v) => { if (v && live) { cache = { at: Date.now(), v }; setP(v); } }).catch(() => {}); };
    load(); const t = setInterval(load, 30000); return () => { live = false; clearInterval(t); };
  }, []);
  return p;
}
/** USD price of a token id (nep141:...) or symbol. */
export const usd = (p: Prices | null, id: string) => (p ? p[tokenById(id)?.symbol] ?? null : null);
/** Market amount of `to` for `amt` of `from`. */
export const marketOut = (p: Prices | null, from: string, to: string, amt: number) => { const a = usd(p, from), b = usd(p, to); return a && b ? (amt * a) / b : null; };
/** How a receive amount compares to market: + means the seller asks more than market. */
export const vsMarket = (p: Prices | null, from: string, fromAmt: number, to: string, toAmt: number) => { const m = marketOut(p, from, to, fromAmt); return m && toAmt > 0 ? ((toAmt - m) / m) * 100 : null; };
export const fmtPct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(Math.abs(x) < 10 ? 1 : 0)}%`;
export const fmtUsd = (x: number) => `$${x.toLocaleString(undefined, { maximumFractionDigits: x < 10 ? 3 : 2 })}`;
export const roundSig = (x: number, d: number) => { const s = x.toPrecision(7); const n = Number(s); return n.toFixed(Math.min(d, 6)).replace(/\.?0+$/, ""); };
