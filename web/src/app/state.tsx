import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { currentUser, ensureAccount, onAuthChange, signIn, signOut } from "../lib/privy";

type Ctx = { account: string | null; ready: boolean; email: string | null; login: () => Promise<string>; logout: () => Promise<void> };
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppState({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    // Stay "not ready" until Privy is ready AND, for a signed-in user, the NEAR account has hydrated,
    // so a refresh never flashes the sign-in prompt for someone who is already logged in.
    const sync = () => currentUser().then(async (u) => {
      setEmail(u?.email ?? null);
      if (u && !u.account) { const a = await ensureAccount().catch(() => null); setAccount(a ?? null); } else setAccount(u?.account ?? null);
      setReady(true);
      if (u?.account) ensureAccount().then((a) => { if (a) setAccount(a); }).catch(() => {});
    }).catch(() => setReady(true));
    sync(); return onAuthChange(sync);
  }, []);
  const login = async () => { const u = await signIn(); setAccount(u.account); setEmail(u.email); return u.account; };
  const logout = async () => { await signOut(); setAccount(null); setEmail(null); };
  return <C.Provider value={{ account, ready, email, login, logout }}>{children}</C.Provider>;
}
