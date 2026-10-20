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
export function PrivacyNote() {
  return (
    <div className="privacy-note">
      <div><EyeSlash size={15} weight="bold" /> <b>Private</b> exact size, price, counter-offers, notes, unfilled deals. Sealed to the enclave; only the two parties can read them.</div>
      <div><Eye size={15} weight="bold" /> <b>Public</b> pair, side, size band, expiry, status, and on settlement the two token transfers on NEAR.</div>
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
