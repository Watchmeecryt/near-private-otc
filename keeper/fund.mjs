// One-time testnet top-up for a new Privy-held NEAR implicit account. The caller must present a
// valid Privy access token for this app; each Privy user and each account is funded at most once.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { RPC } from "./chain.mjs";

const APP_ID = process.env.PRIVY_APP_ID || "";
const AMOUNT = BigInt(process.env.FUND_YOCTO || "250000000000000000000000"); // 0.25 NEAR
const jwks = APP_ID ? createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`)) : null;
const fundedUsers = new Map(); // sub -> count of funded accounts
let today = { day: "", n: 0 };

async function exists(id) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "final", account_id: id } }) });
  const j = await r.json();
  return !j.error && !j.result?.error;
}

export async function fund(ops, bearer, account) {
  if (!jwks) return { code: 503, error: "sign-in not configured" };
  if (!/^[0-9a-f]{64}$/.test(account || "")) return { code: 400, error: "bad account" };
  let sub;
  try { ({ payload: { sub } } = await jwtVerify(bearer || "", jwks, { issuer: "privy.io", audience: APP_ID })); }
  catch { return { code: 401, error: "Please sign in again." }; }
  if (await exists(account)) return { code: 200, funded: false };
  // Account not on chain yet: allow a few top-ups per sign-in (a previous top-up may have failed,
  // or Privy may have issued a fresh wallet), but cap it so one sign-in can't drain the keeper.
  if ((fundedUsers.get(sub) || 0) >= 3) return { code: 409, error: "This sign-in already has an account." };
  const d = new Date().toISOString().slice(0, 10);
  if (today.day !== d) today = { day: d, n: 0 };
  if (++today.n > Number(process.env.FUND_DAILY_CAP || 200)) return { code: 429, error: "Daily limit reached, try tomorrow." };
  const r = await ops.sendMoney(account, AMOUNT);
  fundedUsers.set(sub, (fundedUsers.get(sub) || 0) + 1);
  return { code: 200, funded: true, tx: r.transaction.hash };
}

export async function privyUser(bearer) {
  if (!jwks) return null;
  try { const { payload } = await jwtVerify(bearer || "", jwks, { issuer: "privy.io", audience: APP_ID }); return payload.sub; } catch { return null; }
}

/** Verified emails (lowercased) for a Privy access token: email-code and Google accounts only. */
export async function privyEmails(bearer) {
  const sub = await privyUser(bearer);
  if (!sub) return null;
  const r = await fetch("https://auth.privy.io/api/v1/users/me", { headers: { authorization: `Bearer ${bearer}`, "privy-app-id": APP_ID, origin: process.env.PRIVY_ORIGIN || "https://near-private-otc-productio999n.up.railway.app" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = await r.json(); const u = j.user || j;
  if (u.id !== sub) return null;
  return [...new Set((u.linked_accounts || []).map((a) => (a.type === "email" ? a.address : a.type === "google_oauth" ? a.email : null)).filter(Boolean).map((e) => e.trim().toLowerCase()))];
}

/** NEAR accounts (Privy embedded wallets) linked to this Privy access token. */
export async function privyNearAccounts(bearer) {
  const sub = await privyUser(bearer);
  if (!sub) return null;
  const r = await fetch("https://auth.privy.io/api/v1/users/me", { headers: { authorization: `Bearer ${bearer}`, "privy-app-id": APP_ID, origin: process.env.PRIVY_ORIGIN || "https://near-private-otc-productio999n.up.railway.app" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = await r.json(); const u = j.user || j;
  if (u.id !== sub) return null;
  return { sub, accounts: (u.linked_accounts || []).filter((a) => a.type === "wallet" && (a.chain_type === "near" || a.chainType === "near")).map((a) => a.address) };
}
