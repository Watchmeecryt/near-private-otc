import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { EnvelopeSimple, Wallet, X } from "@phosphor-icons/react";
import { currentUser, ensureAccount, onAuthChange, signIn, signOut } from "../lib/privy";
import { walletSession, connectWallet, disconnectWallet, walletApiLogin, WALLETS } from "../lib/wallet";

type Kind = "privy" | "wallet" | null;
type Ctx = { account: string | null; ready: boolean; email: string | null; kind: Kind; walletId: string | null; login: () => Promise<string>; logout: () => Promise<void>; relogin: () => Promise<void> };
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppState({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [chooser, setChooser] = useState(false);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const pending = useRef<{ res: (a: string) => void; rej: (e: Error) => void } | null>(null);
  useEffect(() => {
    // Not "ready" until Privy is ready and, for a signed-in user, the NEAR account has hydrated,
    // so a refresh never flashes the sign-in prompt. A connected external wallet wins.
    const sync = () => {
      const w = walletSession();
      if (w) { setAccount(w.account); setKind("wallet"); setWalletId(w.walletId); setEmail(null); setReady(true); return; }
      currentUser().then(async (u) => {
        setEmail(u?.email ?? null); setKind(u ? "privy" : null); setWalletId(null);
        if (u && !u.account) { const a = await ensureAccount().catch(() => null); setAccount(a ?? null); } else setAccount(u?.account ?? null);
        setReady(true);
        if (u?.account) ensureAccount().then((a) => { if (a) setAccount(a); }).catch(() => {});
      }).catch(() => setReady(true));
    };
    sync(); return onAuthChange(sync);
  }, []);
  const done = (a: string) => { setChooser(false); setBusy(""); setErr(""); pending.current?.res(a); pending.current = null; };
  const login = () => new Promise<string>((res, rej) => { pending.current = { res, rej }; setErr(""); setChooser(true); });
  const close = () => { setChooser(false); setBusy(""); pending.current?.rej(new Error("Sign-in cancelled")); pending.current = null; };
  const viaPrivy = async () => { try { setBusy("privy"); setChooser(false); const u = await signIn(); setAccount(u.account); setEmail(u.email); setKind("privy"); done(u.account); } catch (e: any) { setBusy(""); pending.current?.rej(e); pending.current = null; } };
  const viaWallet = async () => { try { setBusy("wallet"); const s = await connectWallet(); setAccount(s.account); setKind("wallet"); setWalletId(s.walletId); setEmail(null); done(s.account); } catch (e: any) { setBusy(""); setErr(e.message); } };
  const logout = async () => { if (kind === "wallet") await disconnectWallet(); else await signOut(); setAccount(null); setEmail(null); setKind(null); setWalletId(null); };
  const relogin = async () => { await walletApiLogin(); };
  return (
    <C.Provider value={{ account, ready, email, kind, walletId, login, logout, relogin }}>
      {children}
      {chooser && (
        <div className="signin-back" onClick={close}>
          <div className="card card-pad signin-modal" role="dialog" aria-modal="true" aria-label="Sign in" onClick={(e) => e.stopPropagation()}>
            <div className="row-between"><h3 className="h3">Sign in to Private OTC</h3><button className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button></div>
            <button className="signin-opt" disabled={!!busy} onClick={viaPrivy}><EnvelopeSimple size={22} weight="duotone" /><span><b>Email or Google</b><small>We create a NEAR testnet account for you. No wallet needed.</small></span></button>
            <button className="signin-opt" disabled={!!busy} onClick={viaWallet}><Wallet size={22} weight="duotone" /><span><b>{busy === "wallet" ? "Waiting for your wallet…" : "Connect NEAR wallet"}</b><small>{WALLETS.map((w) => w.name).join(", ")}. You'll sign one message to log in.</small></span></button>
            {err && <p className="sr-hint err">{err}</p>}
            <p className="tiny muted">Ledger can connect and deposit, but can't sign trade messages here.</p>
          </div>
        </div>
      )}
    </C.Provider>
  );
}
