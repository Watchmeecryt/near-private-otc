// Privy is the only sign-in (Google). Every user gets a NEAR testnet implicit account
// held by Privy (ed25519). We use raw-hash signing for both NEAR transactions and NEP-413 intents.
import { PrivyProvider, useLogin, useLogout, usePrivy, getAccessToken } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useEffect, useRef, type ReactNode } from "react";
import { actions, createTransaction, PublicKey, SignedTransaction, Signature, baseDecode, baseEncode } from "near-api-js";

export const PRIVY_APP_ID = (import.meta.env.VITE_PRIVY_APP_ID as string) || "";
const RPC = "/api/rpc";

type Bridge = {
  ready: boolean; authenticated: boolean; user: any;
  login: () => void; logout: () => Promise<void>;
  createWallet: (i: { chainType: "near" }) => Promise<any>;
  signRawHash: (i: { address: string; chainType: "near"; hash: `0x${string}` }) => Promise<{ signature: `0x${string}` }>;
};
const B: { cur: Bridge | null; waiters: (() => void)[]; loginWaiters: ((ok: boolean) => void)[] } = { cur: null, waiters: [], loginWaiters: [] };
const listeners = new Set<() => void>();
export const onAuthChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

function BridgeInner() {
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin({ onComplete: () => { B.loginWaiters.splice(0).forEach((f) => f(true)); }, onError: () => { B.loginWaiters.splice(0).forEach((f) => f(false)); } });
  const { logout } = useLogout();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const prev = useRef("");
  B.cur = { ready, authenticated, user, login: () => login({ loginMethods: ["google"] }), logout, createWallet: createWallet as any, signRawHash: signRawHash as any };
  useEffect(() => {
    if (ready) B.waiters.splice(0).forEach((f) => f());
    const k = `${ready}|${authenticated}|${user?.id}|${nearWalletOf(user)}|`;
    if (k !== prev.current) { prev.current = k; listeners.forEach((f) => f()); }
  });
  return null;
}

export function AuthRoot({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <>{children}</>;
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={{ loginMethods: ["google"], appearance: { theme: (document.documentElement.dataset.theme === "dark" ? "dark" : "light") as any, accentColor: "#a65f0c", showWalletLoginFirst: false, landingHeader: "Sign in to Private OTC", loginMessage: "Continue with Google." }, embeddedWallets: { showWalletUIs: false, ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } } } as any}>
      <BridgeInner />{children}
    </PrivyProvider>
  );
}

const whenReady = () => new Promise<void>((r) => (B.cur?.ready ? r() : B.waiters.push(r)));
const nearWalletOf = (user: any): string | null => user?.linkedAccounts?.find((a: any) => a.type === "wallet" && a.chainType === "near")?.address ?? null;
export const authConfigured = () => !!PRIVY_APP_ID;

export async function currentUser(): Promise<{ email: string | null; account: string | null } | null> {
  if (!PRIVY_APP_ID) return null;
  await whenReady();
  const b = B.cur!;
  if (!b.authenticated) return null;
  return { email: b.user?.email?.address ?? b.user?.google?.email ?? null, account: nearWalletOf(b.user) };
}

export async function signIn(): Promise<{ email: string | null; account: string }> {
  if (!PRIVY_APP_ID) throw new Error("Sign-in is not configured");
  await whenReady();
  if (!B.cur!.authenticated) {
    const ok = await new Promise<boolean>((r) => { B.loginWaiters.push(r); B.cur!.login(); });
    if (!ok) throw new Error("Sign-in cancelled");
    await new Promise((r) => setTimeout(r, 300));
  }
  let account = nearWalletOf(B.cur!.user);
  if (!account) account = (await B.cur!.createWallet({ chainType: "near" })).wallet.address as string;
  ensureFunded(account).catch(() => {});
  return { email: B.cur!.user?.email?.address ?? B.cur!.user?.google?.email ?? null, account };
}
export async function ensureAccount(): Promise<string | null> {
  const u = await currentUser();
  if (!u) return null;
  let account = u.account;
  if (!account) account = (await B.cur!.createWallet({ chainType: "near" })).wallet.address as string;
  try { await ensureFunded(account); } catch {}
  return account;
}
export async function balanceOf(account: string): Promise<bigint | null> {
  try { const r = await rpc("query", { request_type: "view_account", finality: "final", account_id: account }); return BigInt(r.amount); } catch { return 0n; }
}
export async function signOut() { try { await B.cur?.logout(); } catch {} }
export async function accessToken(): Promise<string | null> { try { return await getAccessToken(); } catch { return null; } }

export async function rpc(method: string, params: any) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error?.data?.TxExecutionError ? JSON.stringify(j.error.data.TxExecutionError).slice(0, 240) : (j.error.cause?.name || j.error.message || "rpc error"));
  return j.result;
}
export async function viewCall<T = any>(contract: string, method: string, args: object): Promise<T> {
  const r = await rpc("query", { request_type: "call_function", finality: "optimistic", account_id: contract, method_name: method, args_base64: btoa(JSON.stringify(args)) });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));
}

// Keeper top-up: up to 3 attempts per sign-in while the implicit account does not exist yet.
export async function ensureFunded(account: string) {
  try { await rpc("query", { request_type: "view_account", finality: "final", account_id: account }); return; } catch {}
  const token = await getAccessToken();
  const r = await fetch("/api/fund", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ account }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not set up your NEAR account");
  for (let i = 0; i < 20; i++) { try { await rpc("query", { request_type: "view_account", finality: "final", account_id: account }); return; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
}

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
export const unhex = (s: string) => Uint8Array.from(s.replace(/^0x/, "").match(/../g)!.map((h) => parseInt(h, 16)));
export const publicKeyB58 = (account: string) => baseEncode(unhex(account));

/** Sign a 32-byte digest with the user's Privy-held NEAR key (ed25519). */
export async function signHash(account: string, digest: Uint8Array): Promise<Uint8Array> {
  const { signature } = await B.cur!.signRawHash({ address: account, chainType: "near", hash: `0x${hex(digest)}` });
  return unhex(signature);
}

export type Call = { method: string; args: object; tgas?: number; deposit?: string };
/** One NEAR transaction (several function calls to one contract), signed in the browser, user pays gas. */
export async function sendTx(account: string, receiver: string, calls: Call[]) {
  await ensureFunded(account);
  const pk = PublicKey.fromString("ed25519:" + publicKeyB58(account));
  const ak = await rpc("query", { request_type: "view_access_key", finality: "final", account_id: account, public_key: pk.toString() });
  const block = await rpc("block", { finality: "final" });
  const acts = calls.map((c) => actions.functionCall(c.method, new TextEncoder().encode(JSON.stringify(c.args)), BigInt(c.tgas ?? 50) * 10n ** 12n, BigInt(c.deposit ?? "0")));
  const tx = createTransaction(account, pk, receiver, BigInt(ak.nonce) + 1n, acts, baseDecode(block.header.hash));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", tx.encode() as BufferSource));
  const sig = await signHash(account, digest);
  const signed = new SignedTransaction({ transaction: tx, signature: new Signature({ keyType: pk.keyType, data: sig }) });
  const out = await rpc("send_tx", { signed_tx_base64: btoa(String.fromCharCode(...signed.encode())), wait_until: "EXECUTED_OPTIMISTIC" });
  if (out?.status?.Failure) throw new Error(JSON.stringify(out.status.Failure).slice(0, 240));
  return out?.transaction?.hash as string;
}
