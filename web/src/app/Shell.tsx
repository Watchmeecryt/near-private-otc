import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Storefront, PlusCircle, Handshake, Wallet, Question, Drop, SignOut, EnvelopeSimple, Copy, ArrowSquareOut } from "@phosphor-icons/react";
import { Logo, ThemeToggle } from "../components/ui";
import { Persona } from "../components/Persona";
import { useApp } from "./state";
import { short } from "../lib/format";
import { useEffect, useState } from "react";
import { useToast } from "@unlocalhosted/metalui";
import { balanceOf } from "../lib/privy";

export const NAV = [
  { to: "/app", icon: Storefront, label: "Board", end: true },
  { to: "/app/new", icon: PlusCircle, label: "New deal" },
  { to: "/app/mine", icon: Handshake, label: "My deals" },
  { to: "/app/wallet", icon: Wallet, label: "Wallet" },
  { to: "/app/how", icon: Question, label: "How it works" },
];

export default function Shell() {
  const { account, login, logout, email } = useApp();
  const loc = useLocation();
  return (
    <div className="shell">
      <aside className="side">
        <Logo to="/" />
        {NAV.map(({ to, icon: I, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
            {({ isActive }) => (<><I size={20} weight={isActive ? "fill" : "regular"} />{label}</>)}
          </NavLink>
        ))}
        <div className="side-foot">
          <div style={{ display: "flex", gap: 8 }}><ThemeToggle /></div>
          {account ? <AccountCard account={account} email={email} onLogout={logout} /> : <button className="btn btn-dark btn-sm" onClick={() => login().catch(() => {})}><EnvelopeSimple size={16} /> Sign in</button>}
        </div>
      </aside>
      <main className="main" key={loc.pathname}><div className="fade-up page-narrow"><Outlet /></div></main>
      <nav className="bottom-nav">
        {NAV.map(({ to, icon: I, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>{({ isActive }) => (<><I size={22} weight={isActive ? "fill" : "regular"} />{label.split(" ")[0]}</>)}</NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Top({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  const { account, login } = useApp();
  return (
    <div className="topbar">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      <div className="topbar-actions"><a href="/app/wallet#faucet" className="btn btn-ghost btn-sm faucet-link"><Drop size={15} weight="fill" /> Faucet</a>{children}<span className="mobile-only"><ThemeToggle /></span>{!account && <span className="mobile-only"><button className="btn btn-dark btn-sm" onClick={() => login().catch(() => {})}>Sign in</button></span>}</div>
    </div>
  );
}

export function NeedSignIn({ what }: { what: string }) {
  const { login } = useApp();
  return (
    <div className="card empty">
      <span className="icon-chip" style={{ margin: "0 auto" }}><EnvelopeSimple size={22} weight="duotone" /></span>
      <h3>Sign in with email or Google</h3>
      <p>{what} You get a NEAR testnet account automatically: no wallet, no seed phrase. We top it up with a little test NEAR.</p>
      <button className="btn btn-dark" onClick={() => login().catch(() => {})}>Sign in</button>
    </div>
  );
}

function AccountCard({ account, email, onLogout }: { account: string; email: string | null; onLogout: () => void }) {
  const toast = useToast();
  const [bal, setBal] = useState<bigint | null>(null);
  useEffect(() => { let live = true; const load = () => balanceOf(account).then((b) => live && setBal(b)); load(); const t = setInterval(load, 20000); return () => { live = false; clearInterval(t); }; }, [account]);
  const near = bal === null ? "…" : (Number(bal / 10n ** 20n) / 10000).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const copy = async () => { try { await navigator.clipboard.writeText(account); toast.show({ title: "Address copied", tone: "success" }); } catch {} };
  return (
    <div className="acct-card">
      <div className="acct">
        <Persona email={email} name={account} size={30} />
        <div className="acct-id"><div className="muted acct-k">Signed in · testnet</div><div className="who" title={email || account}>{email || short(account, 10, 6)}</div></div>
        <button className="icon-btn acct-btn" onClick={onLogout} aria-label="Sign out" title="Sign out"><SignOut size={16} /></button>
      </div>
      <div className="acct-row">
        <span className="mono acct-addr" title={account}>{short(account, 8, 6)}</span>
        <button className="icon-btn acct-btn" onClick={copy} aria-label="Copy address"><Copy size={14} /></button>
        <a className="icon-btn acct-btn" href={`https://testnet.nearblocks.io/address/${account}`} target="_blank" rel="noreferrer" aria-label="NearBlocks"><ArrowSquareOut size={14} /></a>
      </div>
      <div className="acct-row"><span className="muted">Gas balance</span><b className="mono acct-bal">{near} NEAR</b></div>
    </div>
  );
}
