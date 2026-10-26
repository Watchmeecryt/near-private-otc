import { tokenById } from "@shared/otc.mjs";
import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun, ChatCenteredDots, Eye, EyeSlash, PenNib, Check } from "@phosphor-icons/react";
import { fmt } from "../lib/deal";
import { VERIFIER, EXPLORER } from "@shared/otc.mjs";
import type { Terms } from "../lib/api";

export function Logo({ to = "/" }: { to?: string }) {
  return <a href={to} className="logo" aria-label="Private OTC home"><span className="logo-mark"><ChatCenteredDots size={17} weight="bold" /></span>Private OTC</a>;
}
export function useTheme() {
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme || "light");
  useEffect(() => { const d = document.documentElement; d.dataset.theme = theme; d.dataset.muColorway = theme === "dark" ? "graphite" : "bone"; }, [theme]);
  return [theme, () => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; try { localStorage.setItem("otc-theme-choice", n); } catch {} return n; })] as const;
}
export function ThemeToggle({ className = "icon-btn" }: { className?: string }) {
  const [theme, toggle] = useTheme();
  return <button className={className} onClick={toggle} aria-label="Toggle theme" title="Theme">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>;
}
export function useNow(ms = 1000) { const [now, set] = useState(Date.now()); useEffect(() => { const t = setInterval(() => set(Date.now()), ms); return () => clearInterval(t); }, [ms]); return now; }
export const Tx = ({ hash, label = "tx" }: { hash?: string | null; label?: string }) => hash ? <a className="link mono" href={`${EXPLORER}/txns/${hash}`} target="_blank" rel="noreferrer">{label} {hash.slice(0, 6)}… ↗</a> : null;

const TONE: Record<string, string> = { Open: "chip-blue", Requested: "chip-amber", Countered: "chip-amber", Settled: "chip-green", Expired: "chip-muted", Cancelled: "chip-red" };
export const StatusChip = ({ s }: { s: string }) => <span className={`chip ${TONE[s] || "chip-muted"}`}>{s}</span>;

/** Compact "what you're signing" panel shown before every signature. */
export function SignPanel({ terms, deadline, kind, gas, children }: { terms?: Terms; deadline?: number; kind: string; gas: string; children?: ReactNode }) {
  return (
    <div className="sign-panel">
      <div className="sp-h"><PenNib size={15} weight="bold" /> What you're signing</div>
      <dl className="kv-mini">
        <dt>Type</dt><dd>{kind}</dd>
        {terms && <><dt>You give</dt><dd className="mono">−{fmt(terms.sell_token, terms.sell_amount)}</dd><dt>You get</dt><dd className="mono">+{fmt(terms.buy_token, terms.buy_amount)}</dd></>}
        {deadline && <><dt>Valid until</dt><dd>{new Date(deadline).toLocaleString()}</dd></>}
        <dt>Verifier</dt><dd className="mono">{VERIFIER}</dd>
        <dt>Gas</dt><dd>{gas}</dd>
      </dl>
      {children}
    </div>
  );
}
const ICON: Record<string, (k: string) => ReactNode> = {
  USDC: (k) => <><circle cx="16" cy="16" r="16" fill="#2775CA" /><circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff" strokeWidth="1.6" opacity=".55" /><path key={k} d="M17.2 9.6v1.6c1.6.2 2.8 1.1 3 2.6h-2c-.2-.7-.9-1.1-1.9-1.1-1.2 0-1.9.5-1.9 1.2 0 .8.7 1 2.3 1.4 2.3.5 3.7 1.2 3.7 3.2 0 1.6-1.2 2.6-3.2 2.9v1.6h-1.5v-1.6c-1.9-.2-3.2-1.2-3.4-2.9h2c.2.9 1 1.4 2.2 1.4 1.3 0 2-.5 2-1.3 0-.8-.6-1.1-2.3-1.5-2.2-.5-3.6-1.2-3.6-3.1 0-1.5 1.2-2.6 3-2.8V9.6z" fill="#fff" /></>,
  wNEAR: (k) => <><circle cx="16" cy="16" r="16" fill="#111" /><path key={k} d="M20.6 9.2l-2.9 4.3c-.2.3.2.6.5.4l2.9-2.5c.1-.1.2 0 .2.1v7.7c0 .1-.2.2-.3.1L12.6 9.6c-.3-.3-.7-.5-1.1-.5h-.3c-.8 0-1.4.6-1.4 1.4v11c0 .8.6 1.4 1.4 1.4.5 0 .9-.3 1.2-.7l2.9-4.3c.2-.3-.2-.6-.5-.4l-2.9 2.5c-.1.1-.2 0-.2-.1v-7.7c0-.1.2-.2.3-.1l8.4 9.7c.3.3.7.5 1.1.5h.3c.8 0 1.4-.6 1.4-1.4v-11c0-.8-.6-1.4-1.4-1.4-.5 0-.9.3-1.2.7z" fill="#00EC97" /></>,
  ETH: (k) => <><circle cx="16" cy="16" r="16" fill="#627EEA" /><path key={k} d="M16 5.5v7.8l6.6 2.9z" fill="#fff" opacity=".6" /><path d="M16 5.5L9.4 16.2l6.6-2.9z" fill="#fff" /><path d="M16 21.3v5.2l6.6-9.2z" fill="#fff" opacity=".6" /><path d="M16 26.5v-5.2l-6.6-4z" fill="#fff" /><path d="M16 20.1l6.6-3.9-6.6-2.9z" fill="#fff" opacity=".2" /><path d="M9.4 16.2l6.6 3.9v-6.8z" fill="#fff" opacity=".6" /></>,
  USDT: (k) => <><circle cx="16" cy="16" r="16" fill="#26A17B" /><path key={k} d="M17.9 17.1v0c-.1 0-.7.1-1.9.1-1 0-1.7 0-1.9-.1v0c-3.7-.2-6.4-.8-6.4-1.6s2.7-1.4 6.4-1.6v2.5c.2 0 .9.1 1.9.1 1.2 0 1.8-.1 1.9-.1v-2.5c3.7.2 6.4.8 6.4 1.6s-2.7 1.4-6.4 1.6zm0-3.4V11.5h5.2V8H8.9v3.5h5.2v2.2c-4.2.2-7.4 1-7.4 2s3.2 1.8 7.4 2v7.1h3.8v-7.1c4.2-.2 7.4-1 7.4-2s-3.2-1.8-7.4-2z" fill="#fff" /></>,
  wBTC: (k) => <><circle cx="16" cy="16" r="16" fill="#F7931A" /><path key={k} d="M22.5 14c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.7 2.6-1.3-.3.7-2.7-1.6-.4-.7 2.7-1-.3-2.3-.6-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1.2.1-.2-.1-1.1 4.4c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.8 2.1.5 1.2.3-.7 2.8 1.6.4.7-2.7 1.3.3-.7 2.7 1.6.4.7-2.8c2.8.5 4.9.3 5.8-2.2.7-2-.03-3.2-1.5-3.9 1.1-.3 1.9-1 2.1-2.5zm-3.7 5.2c-.5 2-3.9.9-5 .6l.9-3.5c1.1.3 4.6.8 4.1 2.9zm.5-5.3c-.5 1.8-3.3.9-4.2.7l.8-3.2c.9.2 3.9.6 3.4 2.5z" fill="#fff" /></>,
  XAUT: (k) => <><circle cx="16" cy="16" r="16" fill="#C9A24B" /><path key={k} d="M8 21.5l2.2-5.5h11.6l2.2 5.5z M11.2 15l1.6-4h6.4l1.6 4z" fill="#FFF4D6" /><path d="M8 21.5h16v1.4H8z" fill="#8A6A22" /></>,
};
/** Origin-chain badge for Tidepool-bridged tokens: [colour, letter]. */
export const CHAIN_BADGE: Record<string, [string, string]> = { base: ["#0052FF", "B"], arb: ["#213147", "A"], eth: ["#627EEA", "E"] };
const symId = (s: string) => s.replace(/^.*?\b(usdc|usdt|wnear|wbtc|eth|xaut)\..*$/i, (_m, x) => ({ usdc: "USDC", usdt: "USDT", wnear: "wNEAR", wbtc: "wBTC", eth: "ETH", xaut: "XAUT" } as any)[x.toLowerCase()]);
/** Inline SVG token mark (USDC, USDT, wNEAR, ETH, wBTC, XAUT); accepts a token id or symbol. */
export function TokenIcon({ t, size = 28 }: { t: string; size?: number }) {
  const tk: any = tokenById(t);
  const k = tk?.base || tk?.symbol || symId(t);
  const draw = ICON[k];
  const badge = tk?.chain ? CHAIN_BADGE[tk.chain] : null;
  return <svg className="tok-ico" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">{draw ? draw(k) : <circle cx="16" cy="16" r="16" fill="var(--brand)" />}{badge && <g><circle cx="25" cy="25" r="7" fill="#fff" /><circle cx="25" cy="25" r="5.6" fill={badge[0]} /><text x="25" y="27.4" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="#fff" fontFamily="system-ui,sans-serif">{badge[1]}</text></g>}</svg>;
}
/** Two overlapping token marks for a pair like "ETH/USDC". */
export function PairIcon({ a, b, size = 40 }: { a: string; b: string; size?: number }) {
  return <span className="pair-ico" style={{ width: size * 1.6, height: size }}><TokenIcon t={a} size={size} /><TokenIcon t={b} size={size} /></span>;
}

export function PrivacyNote() {
  return (
    <div className="privacy-note">
      <div><EyeSlash size={15} weight="bold" /> <b>Private</b> exact size, price, counter-offers and notes. Sealed to the enclave; only you and requesters you approve (who hold $50+ of the token you want) can read them.</div>
      <div><Eye size={15} weight="bold" /> <b>Public</b> on the open board: pair, side, expiry, status, request and counter-offer counts (private deals: link only). On settlement, the two token transfers on NEAR.</div>
    </div>
  );
}
const STEPS = ["Listed", "Terms revealed", "Negotiating", "Settled"];
export function Steps({ at }: { at: number }) {
  return <ol className="steps-mini">{STEPS.map((s, i) => <li key={s} className={i < at ? "done" : i === at ? "cur" : ""}><span>{i < at ? <Check size={11} weight="bold" /> : i + 1}</span>{s}</li>)}</ol>;
}

import { Select } from "@unlocalhosted/metalui";
/** Rounded Meta UI select (frosted menu) used for every dropdown. */
export function Pick<V extends string>({ value, onChange, options, label }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; label: string }) {
  return <Select<V> className="pick" aria-label={label} options={options} value={value} onValueChange={onChange} />;
}
