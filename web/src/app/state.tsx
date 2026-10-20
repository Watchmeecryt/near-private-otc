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
    const sync = () => currentUser().then(async (u) => { setEmail(u?.email ?? null); setAccount(u?.account ?? null); setReady(true); if (u) { const a = await ensureAccount(); if (a) setAccount(a); } });
    sync(); return onAuthChange(sync);
  }, []);
  const login = async () => { const u = await signIn(); setAccount(u.account); setEmail(u.email); return u.account; };
  const logout = async () => { await signOut(); setAccount(null); setEmail(null); };
  return <C.Provider value={{ account, ready, email, login, logout }}>{children}</C.Provider>;
}
