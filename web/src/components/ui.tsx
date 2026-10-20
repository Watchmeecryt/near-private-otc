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
  tUSDC: (k) => <><circle cx="16" cy="16" r="16" fill="#2775CA" /><circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff" strokeWidth="1.6" opacity=".55" /><path key={k} d="M17.2 9.6v1.6c1.6.2 2.8 1.1 3 2.6h-2c-.2-.7-.9-1.1-1.9-1.1-1.2 0-1.9.5-1.9 1.2 0 .8.7 1 2.3 1.4 2.3.5 3.7 1.2 3.7 3.2 0 1.6-1.2 2.6-3.2 2.9v1.6h-1.5v-1.6c-1.9-.2-3.2-1.2-3.4-2.9h2c.2.9 1 1.4 2.2 1.4 1.3 0 2-.5 2-1.3 0-.8-.6-1.1-2.3-1.5-2.2-.5-3.6-1.2-3.6-3.1 0-1.5 1.2-2.6 3-2.8V9.6z" fill="#fff" /></>,
  wNEAR: (k) => <><circle cx="16" cy="16" r="16" fill="#111" /><path key={k} d="M20.6 9.2l-2.9 4.3c-.2.3.2.6.5.4l2.9-2.5c.1-.1.2 0 .2.1v7.7c0 .1-.2.2-.3.1L12.6 9.6c-.3-.3-.7-.5-1.1-.5h-.3c-.8 0-1.4.6-1.4 1.4v11c0 .8.6 1.4 1.4 1.4.5 0 .9-.3 1.2-.7l2.9-4.3c.2-.3-.2-.6-.5-.4l-2.9 2.5c-.1.1-.2 0-.2-.1v-7.7c0-.1.2-.2.3-.1l8.4 9.7c.3.3.7.5 1.1.5h.3c.8 0 1.4-.6 1.4-1.4v-11c0-.8-.6-1.4-1.4-1.4-.5 0-.9.3-1.2.7z" fill="#00EC97" /></>,
  tETH: (k) => <><circle cx="16" cy="16" r="16" fill="#627EEA" /><path key={k} d="M16 5.5v7.8l6.6 2.9z" fill="#fff" opacity=".6" /><path d="M16 5.5L9.4 16.2l6.6-2.9z" fill="#fff" /><path d="M16 21.3v5.2l6.6-9.2z" fill="#fff" opacity=".6" /><path d="M16 26.5v-5.2l-6.6-4z" fill="#fff" /><path d="M16 20.1l6.6-3.9-6.6-2.9z" fill="#fff" opacity=".2" /><path d="M9.4 16.2l6.6 3.9v-6.8z" fill="#fff" opacity=".6" /></>,
};
const symId = (s: string) => s.replace(/^.*?(tUSDC|wNEAR|tETH).*$/, "$1");
/** Inline SVG token mark (tUSDC, wNEAR, tETH); accepts a token id or symbol. */
export function TokenIcon({ t, size = 28 }: { t: string; size?: number }) {
  const k = tokenById(t)?.symbol || symId(t);
  const draw = ICON[k];
  return <svg className="tok-ico" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">{draw ? draw(k) : <circle cx="16" cy="16" r="16" fill="var(--brand)" />}</svg>;
}
/** Two overlapping token marks for a pair like "tETH/tUSDC". */
export function PairIcon({ a, b, size = 40 }: { a: string; b: string; size?: number }) {
  return <span className="pair-ico" style={{ width: size * 1.6, height: size }}><TokenIcon t={a} size={size} /><TokenIcon t={b} size={size} /></span>;
}

export function PrivacyNote() {
  return (
    <div className="privacy-note">
      <div><EyeSlash size={15} weight="bold" /> <b>Private</b> exact size, price, counter-offers, notes, unfilled deals. Sealed to the enclave; only the two parties can read them.</div>
      <div><Eye size={15} weight="bold" /> <b>Public</b> pair, side, expiry, status, number of counter-offers, and on settlement the two token transfers on NEAR.</div>
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
