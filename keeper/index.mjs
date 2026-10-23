// Private OTC keeper: deal-board read model, OutLayer enclave relay, NEAR Intents relayer (execute_intents),
// faucet, implicit-account funding, RPC proxy, and the web app. It stores only sealed offer blobs plus the
// coarse facts the enclave chose to publish; it never holds the enclave key, so it cannot read terms.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { account, call, view, lastValue, RPC } from "./chain.mjs";
import { enclave } from "./enclave.mjs";
import { fund, privyNearAccounts } from "./fund.mjs";
import { walletLogin } from "./walletauth.mjs";
import { VERIFIER, TOKENS, tokenById, toUnits, base58, randomBytes } from "../shared/otc.mjs";

const RPC_UPSTREAMS = (process.env.RPC_UPSTREAMS || "https://test.rpc.fastnear.com,https://neart.lava.build,https://rpc.testnet.pagoda.co").split(",");
const PORT = Number(process.env.PORT || 8790);
const HOST = process.env.PORT ? "0.0.0.0" : "127.0.0.1";
const WEB = path.resolve(new URL("../web/dist", import.meta.url).pathname);
const DATA = process.env.DATA_DIR || path.resolve(new URL("../.data", import.meta.url).pathname);
fs.mkdirSync(DATA, { recursive: true });
const DB = path.join(DATA, "private-otc.json");
const KEEPER_ID = process.env.KEEPER_ID || "otcdesk.testnet";
const keeper = process.env.KEEPER_KEY ? await account(KEEPER_ID, process.env.KEEPER_KEY) : null;
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---- store ----
const db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, "utf8")) : { deals: {}, faucet: {} };
db.sessions ||= {};
let saving = null;
const save = () => { clearTimeout(saving); saving = setTimeout(() => fs.writeFileSync(DB + ".tmp", JSON.stringify(db)) || fs.renameSync(DB + ".tmp", DB), 50); };
const expired = (d) => Date.parse(d.coarse.deadline) < Date.now();
const publicStatus = (d) => d.status === "Settled" || d.status === "Cancelled" ? d.status : expired(d) ? "Expired" : "Open";
const counterCount = (d) => d.offers.filter((o) => o.kind === "counter").length;
// Public viewer summary: total views, unique viewers, and up to 5 anonymous avatar seeds
// (HMAC of deal id + account with a server-only salt), so no account id is exposed and
// seeds can't be linked across deals or brute-forced from guessable NEAR names.
const VIEW_SALT = process.env.VIEW_SALT || (() => { const f = path.join(DATA, "view_salt"); try { return fs.readFileSync(f, "utf8").trim(); } catch { const x = crypto.randomBytes(32).toString("hex"); fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(f, x, { mode: 0o600 }); return x; } })();
const viewSummary = (d) => {
  const v = d.views || []; const last = new Map();
  for (const x of v) last.set(x.account, Math.max(last.get(x.account) || 0, x.at));
  const uniq = [...last.entries()].sort((a, b) => b[1] - a[1]);
  return { views: v.length, viewers: uniq.length, viewer_seeds: uniq.slice(0, 5).map(([a]) => crypto.createHmac("sha256", VIEW_SALT).update(d.id + ":" + a).digest("hex").slice(0, 16)) };
};
const publicDeal = (d) => ({ ...viewSummary(d),  id: d.id, pair: d.coarse.pair, side: d.coarse.side, deadline: d.coarse.deadline, status: publicStatus(d), counters: counterCount(d), requests: (d.requests || []).length, auto_approve: !!d.auto, visibility: d.visibility || "public", created: d.created, settle_tx: d.settle_tx || null, check_tx: d.check_tx });
/** Status as seen by one account. */
function myStatus(d, me) {
  const p = publicStatus(d); if (p !== "Open") return p;
  const mine = d.offers.filter((o) => o.from === me || o.to === me);
  if (mine.some((o) => o.kind === "counter" && o.status === "live")) return "Countered";
  if (d.maker === me) return (d.requests || []).some((q) => q.status === "pending") ? "Requests" : "Open";
  const q = reqOf(d, me); if (q) return q.status === "approved" ? "Approved" : q.status === "declined" ? "Declined" : "Requested";
  return "Open";
}
const reqOf = (d, me) => (d.requests || []).find((q) => q.account === me);
const approved = (d, me) => d.maker === me || reqOf(d, me)?.status === "approved";
const thread = (d, me) => d.offers.filter((o) => d.maker === me || o.to === "*" || o.from === me || o.to === me).map(({ ct, ...o }) => o);

// ---- http helpers ----
const hits = new Map();
const clientIp = (req) => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
function limited(req, max = 30, bucket = new URL(req.url, "http://x").pathname) {
  const k = `${bucket}|${clientIp(req)}`, now = Date.now(), w = hits.get(k)?.filter((t) => now - t < 60000) || [];
  w.push(now); hits.set(k, w); return w.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, w] of hits) if (!w.some((t) => now - t < 60000)) hits.delete(k); }, 300000).unref();
const body = (req, max = 64 * 1024) => new Promise((res, rej) => { const c = []; let n = 0; req.on("data", (d) => { n += d.length; if (n > max) { rej(new Error("too large")); req.destroy(); } else c.push(d); }); req.on("end", () => res(Buffer.concat(c))); req.on("error", rej); });
const jbody = async (req) => JSON.parse((await body(req)).toString() || "{}");
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".xml": "application/xml", ".wasm": "application/wasm" };
const bearerOf = (req) => (req.headers.authorization || "").replace(/^Bearer /, "");
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const authCache = new Map();
async function who(req, want) {
  const b = bearerOf(req);
  if (b.startsWith("nw_")) {
    const s = db.sessions[b];
    if (!s || s.exp < Date.now()) throw new HttpError(401, "Please sign in again.");
    if (want && want !== s.account) throw new HttpError(403, "That NEAR account is not this wallet.");
    return { sub: "wallet:" + s.account, accounts: [s.account], wallet: s.proof };
  }
  let r = authCache.get(b);
  if (!r || r.exp < Date.now()) { r = { v: await privyNearAccounts(b), exp: Date.now() + 120000 }; if (r.v) authCache.set(b, r); }
  if (!r.v) throw new HttpError(401, "Please sign in again.");
  if (want && !r.v.accounts.includes(want)) throw new HttpError(403, "That NEAR account is not linked to this sign-in.");
  return r.v;
}
const settling = new Set();
const getDeal = (id) => { const d = db.deals[id]; if (!d) throw new HttpError(404, "Deal not found"); return d; };
const shortId = () => base58(randomBytes(6)).slice(0, 8);

// ---- relayer ----
async function simulate(signed) { return view(VERIFIER, "simulate_intents", { signed }); }
async function execute(signed) {
  await simulate(signed).catch((e) => { throw new HttpError(409, "Verifier refused: " + String(e.message).replace(/\\"/g, '"').slice(0, 260)); });
  const o = await call(keeper, VERIFIER, "execute_intents", { signed }, { tgas: 300 });
  lastValue(o); return o.transaction.hash;
}
const msgOf = (p) => JSON.parse(p.payload.message);

// ---- faucet ----
const near = (n) => BigInt(Math.round(n * 1e6)) * 10n ** 18n;
async function faucet(accountId, symbol) {
  const t = tokenById(symbol); if (!t) throw new HttpError(400, "Unknown token");
  const amount = toUnits(t.faucet, t.decimals);
  if (t.contract === "wrap.testnet") {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "final", account_id: KEEPER_ID } }) }).then((x) => x.json());
    if (BigInt(r.result.amount) < BigInt(amount) + 5n * 10n ** 24n) throw new HttpError(503, "The wNEAR faucet is empty right now. Try tUSDC or tETH, or come back later.");
  }
  if (t.contract === "wrap.testnet") await call(keeper, "wrap.testnet", "near_deposit", {}, { tgas: 30, deposit: amount });
  const o = await call(keeper, t.contract, "ft_transfer_call", { receiver_id: VERIFIER, amount, msg: accountId }, { tgas: 100, deposit: "1" });
  lastValue(o); return { tx: o.transaction.hash, amount, token: t.id };
}

// Reference USD prices (CoinGecko), cached 30 s. tUSDC->USDC, wNEAR->NEAR, tETH->ETH.
let priceCache = { at: 0, v: null };
async function prices() {
  if (priceCache.v && Date.now() - priceCache.at < 30000) return priceCache.v;
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,near,ethereum&vs_currencies=usd", { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" } });
    const j = await r.json();
    if (!j?.near?.usd) throw new Error("bad price response");
    priceCache = { at: Date.now(), v: { tUSDC: j["usd-coin"]?.usd ?? 1, wNEAR: j.near.usd, tETH: j.ethereum.usd, source: "CoinGecko", at: new Date().toISOString() } };
  } catch (e) { if (!priceCache.v) throw new HttpError(503, "Price feed unavailable"); }
  return priceCache.v;
}

// Anti-spam gate for requests: a fixed public threshold, the same for every deal and independent of
// deal size (comparing with the sealed amount would leak it by probing). Not a fill guarantee:
// settlement still fails safely if the taker lacks funds at accept time.
const MIN_USD = Number(process.env.REQUEST_MIN_USD || 200);
async function usdHolding(account, symbol) {
  const t = tokenById(symbol); const p = (await prices())[t.symbol];
  const inside = await view(VERIFIER, "mt_balance_of", { account_id: account, token_id: t.id }).catch(() => "0");
  const wallet = await view(t.contract, "ft_balance_of", { account_id: account }).catch(() => "0");
  let units = BigInt(inside || "0") + BigInt(wallet || "0");
  if (t.contract === "wrap.testnet") { // native NEAR counts too: Deposit wraps it in the same transaction
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "final", account_id: account } }) }).then((x) => x.json()).catch(() => null);
    if (r?.result?.amount) units += BigInt(r.result.amount);
  }
  return Number(units) / 10 ** t.decimals * p;
}

const routes = [
  // Admin wipe: enabled only while the ADMIN_WIPE_TOKEN Railway variable is set (Bearer token). Refuses while any deal is Open.
  ["POST", /^\/api\/admin\/wipe$/, async (req) => {
    const t = process.env.ADMIN_WIPE_TOKEN || "", b = Buffer.from(bearerOf(req)), k = Buffer.from(t);
    if (t.length < 32) throw new HttpError(404, "Not found"); // disabled unless ADMIN_WIPE_TOKEN is set
    if ( b.length !== k.length || !crypto.timingSafeEqual(b, k)) throw new HttpError(403, "forbidden");
    const open = Object.values(db.deals).filter((d) => d.status === "Open").map((d) => d.id);
    if (open.length) throw new HttpError(409, "open deals: " + open.join(","));
    const before = { deals: Object.keys(db.deals).length, sessions: Object.keys(db.sessions || {}).length, faucet: Object.keys(db.faucet || {}).length };
    const backup = path.join(DATA, `private-otc.backup-${Date.now()}.json`); fs.writeFileSync(backup, JSON.stringify(db), { mode: 0o600 });
    db.deals = {}; db.sessions = {}; save();
    return { ok: true, before, after: { deals: 0, sessions: 0, faucet: Object.keys(db.faucet || {}).length }, backup: path.basename(backup) };
  }],
  ["GET", /^\/api\/prices$/, async () => prices()],
  ["GET", /^\/api\/health$/, async () => ({ ok: true, keeper: KEEPER_ID, verifier: VERIFIER, deals: Object.keys(db.deals).length, relayer: !!keeper })],
  ["GET", /^\/api\/deals$/, async () => (Object.values(db.deals).filter((d) => d.visibility !== "private").sort((a, b) => b.created - a.created).map(publicDeal))],
  ["GET", /^\/api\/deals\/([\w]+)$/, async (req, [id]) => publicDeal(getDeal(id))],
  ["GET", /^\/api\/my$/, async (req, _, url) => {
    const me = url.searchParams.get("account"); await who(req, me);
    return Object.values(db.deals).filter((d) => d.maker === me || d.requesters.includes(me) || !!reqOf(d, me) || d.offers.some((o) => o.from === me || o.to === me))
      .sort((a, b) => b.created - a.created).map((d) => ({ ...publicDeal(d), role: d.maker === me ? "maker" : "taker", my_status: myStatus(d, me), offers: thread(d, me), requesters: d.maker === me ? d.requesters.length : undefined, view_log: d.maker === me ? (d.views || []) : undefined,
        request_list: d.maker === me ? (d.requests || []).map(({ approval, ...q }) => q) : undefined, my_request: d.maker === me ? undefined : (({ approval, ...q }) => q)(reqOf(d, me) || {}) }));
  }],
  ["POST", /^\/api\/deals$/, async (req) => {
    const { offer_ct, nonce, account: me, visibility, auto_approval } = await jbody(req); await who(req, me);
    if (visibility && !["public", "private"].includes(visibility)) throw new HttpError(400, "visibility must be public or private");
    const c = await enclave(keeper, { action: "check", offers: [offer_ct] });
    if (Date.parse(c.deadline) <= Date.now()) throw new HttpError(400, "That expiry is already in the past.");
    if (c.from !== me || c.to !== "*") throw new HttpError(400, "Opening offers must be signed by you and open to anyone.");
    if (db.deals[c.deal]) throw new HttpError(409, "Deal id taken, try again.");
    const d = { id: c.deal, created: Date.now(), maker: me, status: "Open", visibility: visibility || "public", requesters: [], check_tx: c.tx,
      coarse: { pair: c.pair, side: c.side, deadline: c.deadline },
      offers: [{ id: "o1", kind: "open", from: me, to: "*", nonce, at: Date.now(), status: "live", ct: offer_ct, commitment: c.commitment, tx: c.tx }] };
    d.requests = [];
    if (auto_approval) { const a = await enclave(keeper, { action: "approval", offers: [offer_ct], approval: auto_approval }); if (a.requester === "*") d.auto = auto_approval; }
    db.deals[d.id] = d; save(); log("deal", d.id, c.pair);
    return publicDeal(d);
  }],
  ["POST", /^\/api\/deals\/(\w+)\/reveal$/, async (req, [id]) => {
    const d = getDeal(id); const { request_ct, account: me } = await jbody(req); await who(req, me);
    if (!approved(d, me)) throw new HttpError(403, reqOf(d, me) ? "Waiting for the maker to approve your request." : "Request the terms first.");
    const approval = d.maker === me ? undefined : reqOf(d, me).approval;
    const r = await enclave(keeper, { action: "reveal", request: request_ct, offers: d.offers.map((o) => o.ct), approval });
    if (r.viewer !== me || r.deal !== id) throw new HttpError(400, "Request mismatch");
    if (me !== d.maker) { if (!d.requesters.includes(me)) d.requesters.push(me); (d.views ||= []).push({ account: me, at: Date.now() }); if (d.views.length > 500) d.views.shift(); save(); log("reveal", id, me); }
    return { offers_ct: r.offers_ct, visible: r.visible, tx: r.tx, offers: thread(d, me) };
  }],
  ["POST", /^\/api\/deals\/(\w+)\/offer$/, async (req, [id]) => {
    const d = getDeal(id); const { offer_ct, nonce, account: me, kind, reply_to } = await jbody(req); await who(req, me);
    if (publicStatus(d) !== "Open") throw new HttpError(409, `This deal is ${publicStatus(d).toLowerCase()}.`);
    if (!approved(d, me)) throw new HttpError(403, "Only requesters the maker approved can counter or accept.");
    const prev = d.offers.find((o) => o.id === reply_to && o.status === "live");
    if (!prev) throw new HttpError(404, "That offer is no longer live.");
    const c = await enclave(keeper, { action: "check", offers: [offer_ct] });
    if (Date.parse(c.deadline) > Date.parse(d.coarse.deadline)) throw new HttpError(400, "A reply cannot outlive the deal: use the deal's expiry.");
    if (c.from !== me || c.deal !== id || (prev.to !== "*" && prev.to !== me) || c.to !== prev.from) throw new HttpError(400, "Offer is not addressed correctly.");
    const o = { id: "o" + (d.offers.length + 1), kind: kind === "accept" ? "accept" : "counter", reply_to, from: me, to: prev.from, nonce, at: Date.now(), status: "live", ct: offer_ct, commitment: c.commitment, tx: c.tx };
    if (o.kind === "counter") {
      d.offers.forEach((x) => { if (x.kind === "counter" && x.status === "live" && ((x.from === me && x.to === prev.from) || x.id === reply_to)) x.status = "superseded"; });
      d.offers.push(o); save(); return { offer: (({ ct, ...x }) => x)(o) };
    }
    // First settlement wins: a per-deal lock stops parallel accepts here, and the verifier's nonce burn
    // stops any signed pair from executing twice even across restarts.
    if (settling.has(id)) throw new HttpError(409, "Another trade on this deal is settling right now. If it goes through, this deal is closed.");
    settling.add(id);
    let s, tx;
    try {
      s = await enclave(keeper, { action: "settle", offers: [prev.ct, offer_ct] });
      if (d.status === "Settled") throw new HttpError(409, "Too late: this deal was already settled with another counterparty.");
      tx = await execute(s.signed).catch((e) => { throw /nonce/i.test(e.message) ? new HttpError(409, "Too late: this deal was already filled or cancelled, so its signatures can no longer be used. Nothing was moved from your balance.") : e; });
    } finally { settling.delete(id); }
    o.status = "settled"; prev.status = "settled"; d.offers.push(o);
    d.offers.forEach((x) => { if (x.status === "live") x.status = "closed"; });
    d.status = "Settled"; d.settle_tx = tx; d.settle_enclave_tx = s.tx; save(); log("settled", id, tx);
    return { settled: true, tx, enclave_tx: s.tx };
  }],
  ["POST", /^\/api\/auth\/wallet$/, async (req) => {
    if (limited(req, 10)) throw new HttpError(429, "Slow down.");
    const { signed } = await jbody(req);
    let account; try { account = await walletLogin(signed); } catch (e) { throw new HttpError(401, e.message); }
    const token = "nw_" + Buffer.from(randomBytes(24)).toString("hex");
    db.sessions[token] = { account, proof: signed, exp: Date.now() + 86400000 };
    for (const [k, v] of Object.entries(db.sessions)) if (v.exp < Date.now()) delete db.sessions[k];
    save(); return { token, account };
  }],
  ["POST", /^\/api\/deals\/(\w+)\/request$/, async (req, [id]) => {
    // The enclave authenticates the requester (Privy or NEP-413 wallet login) and names the token the maker
    // wants; the keeper then applies the fixed $ threshold (wallet + verifier balance, CoinGecko price).
    const d = getDeal(id); const { request_ct, account: me } = await jbody(req); await who(req, me);
    if (publicStatus(d) !== "Open") throw new HttpError(409, `This deal is ${publicStatus(d).toLowerCase()}.`);
    if (d.maker === me) throw new HttpError(400, "This is your own deal.");
    const ex = reqOf(d, me); if (ex && ex.status !== "declined" && !(ex.status === "pending" && d.auto)) return { request: (({ approval, ...q }) => q)(ex) };
    const r = await enclave(keeper, { action: "request", request: request_ct, offers: [d.offers[0].ct] });
    if (r.viewer !== me || r.deal !== id) throw new HttpError(400, "Request mismatch");
    if ((await usdHolding(me, r.want)) < MIN_USD) throw new HttpError(403, `You need at least $${MIN_USD} in ${r.want} to request deals.`);
    const q = { account: me, at: Date.now(), status: d.auto ? "approved" : "pending", auto: !!d.auto, tx: r.tx, approval: d.auto || undefined };
    d.requests = (d.requests || []).filter((x) => x.account !== me); d.requests.push(q); save(); log("request", id, me, q.status);
    return { request: (({ approval, ...x }) => x)(q) };
  }],
  ["POST", /^\/api\/deals\/(\w+)\/approve$/, async (req, [id]) => {
    const d = getDeal(id); const { account: me, requester, decision, approval } = await jbody(req); await who(req, me);
    if (d.maker !== me) throw new HttpError(403, "Only the maker can approve requests.");
    const q = reqOf(d, requester); if (!q) throw new HttpError(404, "No such request.");
    if (decision === "decline") { q.status = "declined"; delete q.approval; save(); return { ok: true }; }
    const a = await enclave(keeper, { action: "approval", offers: [d.offers[0].ct], approval });
    if (a.requester !== requester) throw new HttpError(400, "Approval doesn't match that requester.");
    q.status = "approved"; q.approval = approval; q.approved_at = Date.now(); save(); log("approve", id, requester);
    return { ok: true };
  }],
  ["POST", /^\/api\/deals\/(\w+)\/auto$/, async (req, [id]) => {
    const d = getDeal(id); const { account: me, approval, off } = await jbody(req); await who(req, me);
    if (d.maker !== me) throw new HttpError(403, "Only the maker can change this.");
    if (off) { d.auto = null; save(); return { auto_approve: false }; }
    const a = await enclave(keeper, { action: "approval", offers: [d.offers[0].ct], approval });
    if (a.requester !== "*") throw new HttpError(400, "Auto-approve needs an approval for anyone (*).");
    d.auto = approval; save(); return { auto_approve: true };
  }],
  ["POST", /^\/api\/deals\/(\w+)\/publish$/, async (req, [id]) => {
    // One way only: private -> public. Once listed, others may have seen it, so it can't be hidden again.
    const d = getDeal(id); const { account: me } = await jbody(req); await who(req, me);
    if (d.maker !== me) throw new HttpError(403, "Only the maker can change visibility.");
    if (d.visibility !== "private") throw new HttpError(409, "This deal is already public. Public deals can't be made private again.");
    d.visibility = "public"; save(); log("publish", id); return publicDeal(d);
  }],
  ["POST", /^\/api\/deals\/(\w+)\/decline$/, async (req, [id]) => {
    const d = getDeal(id); const { offer_id, account: me } = await jbody(req); await who(req, me);
    const o = d.offers.find((x) => x.id === offer_id);
    if (!o || o.to !== me || o.status !== "live" || o.kind !== "counter") throw new HttpError(400, "Nothing to decline.");
    o.status = "declined"; save(); return { ok: true };
  }],
  ["POST", /^\/api\/deals\/(\w+)\/cancel$/, async (req, [id]) => {
    // Cancel = burn the maker's nonces: each payload re-uses one of the maker's offer nonces with an
    // empty intents list, so the verifier marks those nonces used and the old signatures die.
    const d = getDeal(id); const { signed, account: me } = await jbody(req); await who(req, me);
    if (d.maker !== me) throw new HttpError(403, "Only the maker can cancel.");
    if (publicStatus(d) !== "Open") throw new HttpError(409, "Deal is not open.");
    const mine = new Set(d.offers.filter((o) => o.from === me && o.status === "live").map((o) => o.nonce));
    for (const p of signed || []) { const m = msgOf(p); if (m.signer_id !== me || m.intents.length || !mine.has(p.payload.nonce)) throw new HttpError(400, "Cancel payloads must be empty and re-use your offer nonces."); }
    const tx = await execute(signed);
    d.status = "Cancelled"; d.cancel_tx = tx; d.offers.forEach((o) => { if (o.status === "live") o.status = "cancelled"; }); save();
    return { tx };
  }],
  ["POST", /^\/api\/withdraw$/, async (req) => {
    const { signed, account: me } = await jbody(req); await who(req, me);
    const m = msgOf(signed);
    if (m.signer_id !== me || !m.intents.length || m.intents.some((i) => i.intent !== "ft_withdraw")) throw new HttpError(400, "Only ft_withdraw intents signed by you.");
    return { tx: await execute([signed]) };
  }],
  ["POST", /^\/api\/faucet$/, async (req) => {
    if (limited(req, 6)) throw new HttpError(429, "Slow down.");
    const { account: me, token } = await jbody(req); const { sub } = await who(req, me);
    const day = new Date().toISOString().slice(0, 10), k = `${day}|${sub}|${token}`;
    if ((db.faucet[k] || 0) >= 3) throw new HttpError(429, "Faucet limit for today reached for this token.");
    const r = await faucet(me, token); db.faucet[k] = (db.faucet[k] || 0) + 1; save();
    for (const key of Object.keys(db.faucet)) if (!key.startsWith(day)) delete db.faucet[key];
    return r;
  }],
  ["POST", /^\/api\/fund$/, async (req) => {
    if (limited(req, 5)) throw new HttpError(429, "Slow down.");
    const { account: a } = await jbody(req); const r = await fund(keeper, bearerOf(req), a);
    if (r.code !== 200) throw new HttpError(r.code, r.error); return r;
  }],
];

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/rpc" && req.method === "POST") {
      if (limited(req, 240)) return json(res, 429, { error: "slow down" });
      const raw = (await body(req, 256 * 1024)).toString();
      let m; try { m = JSON.parse(raw).method; } catch { return json(res, 400, { error: "bad json" }); }
      if (!["query", "block", "send_tx", "broadcast_tx_commit", "tx", "status", "gas_price"].includes(m)) return json(res, 400, { error: "method not allowed" });
      let lastErr = "no upstream";
      for (const up of RPC_UPSTREAMS) {
        try {
          const r = await fetch(up, { method: "POST", headers: { "content-type": "application/json" }, body: raw, signal: AbortSignal.timeout(m.startsWith("send") || m.startsWith("broadcast") ? 60000 : 12000) });
          if (r.status === 429 || r.status >= 500) { lastErr = `${up} ${r.status}`; continue; }
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); return res.end(await r.text());
        } catch (e) { lastErr = `${up} ${e.message}`; }
      }
      return json(res, 502, { jsonrpc: "2.0", id: 1, error: { message: "NEAR RPC unavailable", cause: { name: lastErr.slice(0, 120) } } });
    }
    for (const [method, re, fn] of routes) {
      const m = url.pathname.match(re);
      if (m && req.method === method) {
        if (method === "POST" && !keeper && !/fund/.test(url.pathname)) throw new HttpError(503, "Relayer not configured");
        if (method === "POST" && limited(req, 40, "post")) throw new HttpError(429, "Slow down.");
        return json(res, 200, await fn(req, m.slice(1), url));
      }
    }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "not found" });
    let f = path.join(WEB, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(WEB, "index.html");
    if (!fs.existsSync(f)) return json(res, 404, { error: "web not built" });
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": f.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    const code = e.code && Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) log("error", url.pathname, e.message.slice(0, 300));
    json(res, code, { error: e.message.slice(0, 300), tx: e.tx });
  }
}).listen(PORT, HOST, () => log(`private-otc keeper on http://${HOST}:${PORT}`));
