// One-call demo: POST /api/demo/run drives the whole OTC lifecycle with TWO fixed testnet demo accounts
// (maker + taker) whose keys live ONLY in env (DEMO_MAKER_ID/KEY, DEMO_TAKER_ID/KEY). It talks to this same
// server over loopback with the exact public HTTP calls a browser or agent would make, so every step in the
// returned log is a real, replayable request (sessions, sealed blobs and signatures redacted).
// Safety: per-IP rate limit, a single-run mutex, low-balance refusal, tiny amounts, testnet only.
// Keys are never logged, returned, or put in error text; this module never creates accounts or wallets.
import nc from "node:crypto";
import { ENCLAVE_PUBKEY, VERIFIER, EXPLORER, intentPayload, tokenDiff, seal, unseal, newKeypair, signIntent, base58, toUnits, fromUnits, tokenById, randomBytes, b64, toHex } from "../shared/otc.mjs";
import { view, RPC } from "./chain.mjs";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const unb58 = (s) => { let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("bad key encoding"); n = n * 58n + BigInt(i); } const o = []; while (n > 0n) { o.unshift(Number(n % 256n)); n /= 256n; } return Uint8Array.from(o); };
const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");

// Amounts (tiny, testnet): maker lists 0.001 ETH for 3 USDC, taker counters 2.7 USDC, maker accepts the counter.
const SELL = { sym: "ETH", amt: "0.001" }, ASK = { sym: "USDC", amt: "3" }, COUNTER = "2.7";
const MIN_MAKER_SELL = toUnits("0.002", 18);   // refuse below 2x the traded size
const MIN_TAKER_BUY = toUnits("52", 6);        // the app's $50 request gate + the traded amount
const MIN_KEEPER_YOCTO = 1n * 10n ** 24n;      // keeper pays enclave calls: refuse under 1 NEAR
const TTL_MS = 30 * 60e3;
const RATE_MAX = 2, RATE_WINDOW = 10 * 60e3;   // per IP per 10 minutes

let busy = false;
const hits = new Map();
setInterval(() => { const n = Date.now(); for (const [k, w] of hits) if (!w.some((t) => n - t < RATE_WINDOW)) hits.delete(k); }, 300000).unref();

function loadAgent(role) {
  const id = process.env[`DEMO_${role}_ID`], key = process.env[`DEMO_${role}_KEY`];
  if (!id || !key) return null;
  const b = unb58(key.trim().replace(/^ed25519:/, ""));
  if (b.length !== 64 || toHex(b.subarray(32)) !== id.trim()) throw new Error(`DEMO_${role}_ID does not match DEMO_${role}_KEY`);
  const priv = nc.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(b.subarray(0, 32))]), format: "der", type: "pkcs8" });
  return { role: role.toLowerCase(), account: id.trim(), pkB58: base58(b.subarray(32)), sign: async (h) => new Uint8Array(nc.sign(null, Buffer.from(h), priv)) };
}

const scrub = (s) => String(s ?? "").replace(/https?:\/\/[^\s"')]+/g, (u) => /nearblocks\.io|usetidepool\.tech|up\.railway\.app/.test(u) ? u : "<url>").replace(/ed25519:[1-9A-HJ-NP-Za-km-z]{40,}/g, "ed25519:<redacted>").slice(0, 400);

// Public-request view of a body: sealed blobs shortened, signatures and sessions redacted.
function redact(v, k = "") {
  if (Array.isArray(v)) return v.map((x) => redact(x, k));
  if (v && typeof v === "object") {
    if (v.signature && v.payload) return { standard: v.standard, public_key: v.public_key, payload: { message: v.payload.message, nonce: "<32-byte nonce>", recipient: v.payload.recipient }, signature: "ed25519:<redacted signature>" };
    return Object.fromEntries(Object.entries(v).map(([a, b]) => [a, redact(b, a)]));
  }
  if (typeof v === "string") {
    if (/(^|_)ct$/.test(k)) return `<sealed to the enclave/one-time key, ${v.length} hex chars>`;
    if (k === "token") return "<session token, redacted>";
    if (k === "nonce") return "<32-byte nonce>";
  }
  return v;
}

const txLinks = (o, out = []) => { for (const k of ["tx", "check_tx", "enclave_tx", "settle_tx", "settle_enclave_tx"]) if (typeof o?.[k] === "string" && o[k]) out.push({ label: k, url: `${EXPLORER}/txns/${o[k]}` }); return out; };

async function keeperBalance(keeperId) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "optimistic", account_id: keeperId } }), signal: AbortSignal.timeout(12000) });
  const j = await r.json(); return BigInt(j.result?.amount || "0");
}
const bal = async (acct, sym) => { const t = tokenById(sym); return BigInt(await view(VERIFIER, "mt_balance_of", { account_id: acct, token_id: t.id }).catch(() => "0")); };
const fmt = (u, sym) => `${fromUnits(u, tokenById(sym).decimals)} ${sym}`;

export function demoStatus() {
  let m, t; try { m = loadAgent("MAKER"); t = loadAgent("TAKER"); } catch { return { configured: false, error: "demo account env is invalid" }; }
  if (!m || !t) return { configured: false };
  return { configured: true, maker: m.account, taker: t.account, network: "testnet", run: "POST /api/demo/run", busy };
}

/** Returns { code, body }. `ctx` = { port, origin, ip, keeperId, keeperReady, body }. */
export async function runDemo(ctx) {
  const t0 = Date.now();
  if ((ctx.body?.steps ?? "all") !== "all") return { code: 400, body: { ok: false, error: 'Only {"steps":"all"} is supported (the default).' } };
  if (!ctx.keeperReady) return { code: 503, body: { ok: false, error: "Relayer not configured." } };
  let maker, taker;
  try { maker = loadAgent("MAKER"); taker = loadAgent("TAKER"); } catch (e) { return { code: 503, body: { ok: false, error: scrub(e.message) } }; }
  if (!maker || !taker) return { code: 503, body: { ok: false, error: "Demo accounts are not configured on this server." } };

  // per-IP rate limit
  const now = Date.now(), w = (hits.get(ctx.ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (w.length >= RATE_MAX) { const retry = Math.ceil((RATE_WINDOW - (now - w[0])) / 1000); return { code: 429, body: { ok: false, error: `Rate limit: ${RATE_MAX} demo runs per ${RATE_WINDOW / 60000} minutes per IP.`, retry_after_s: retry } }; }
  w.push(now); hits.set(ctx.ip, w);
  // mutex
  if (busy) return { code: 409, body: { ok: false, error: "A demo run is already in progress. Try again in about two minutes." } };
  busy = true;

  const steps = [], explorer = [];
  const base = `http://127.0.0.1:${ctx.port}`;
  const sessions = new Map();
  let deal = null, settled = false, makerNonces = [];
  const fail = (code, error, extra = {}) => ({ code, body: { ok: false, error: scrub(error), ...extra, deal: deal && { id: deal, link: `${ctx.origin}/d/${deal}` }, steps, explorer, elapsed_s: Math.round((Date.now() - t0) / 1000) } });

  async function http(who, name, note, method, path, body) {
    const tok = who && sessions.get(who.account);
    const s = { n: steps.length + 1, step: name, actor: who?.role || "public", what: note, request: { method, url: ctx.origin + path, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer <session token, redacted>" } : {}) }, ...(body ? { body: redact(body) } : {}) } };
    steps.push(s);
    const ts = Date.now();
    let r, j;
    try {
      r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(240000) });
      j = await r.json().catch(() => ({}));
    } catch (e) { s.status = 0; s.error = scrub(e.message); throw new Error(`${name}: ${s.error}`); }
    s.status = r.status; s.ms = Date.now() - ts;
    s.response = redact(j); const links = txLinks(j); if (links.length) { s.explorer = links; explorer.push(...links.map((l) => ({ step: name, ...l }))); }
    if (!r.ok) { s.error = scrub(j.error || r.status); throw new Error(`${name}: HTTP ${r.status} ${s.error}`); }
    return j;
  }
  const nep = (a, p) => signIntent(p, a.pkB58, a.sign);
  const signIn = async (a) => {
    a.login = await nep(a, { message: JSON.stringify({ otc_login: a.account, ts: Date.now() }), nonce: randomBytes(32), recipient: "near-private-otc" });
    const r = await http(a, `${a.role} signs in`, "NEP-413 signed {otc_login, ts} for recipient near-private-otc -> 24 h session. No browser wallet.", "POST", "/api/auth/wallet", { signed: a.login });
    sessions.set(a.account, r.token); // kept server-side; the log shows only <redacted>
  };
  const signedOffer = async (a, { deal, to, terms, deadlineMs }) => {
    const nonce = randomBytes(32);
    const intent = await nep(a, intentPayload({ signer: a.account, intents: [tokenDiff(terms.sell_token, terms.sell_amount, terms.buy_token, terms.buy_amount)], deadlineMs, nonce }));
    return { offer_ct: seal(ENCLAVE_PUBKEY, { v: 1, deal, from: a.account, to, terms, note: "", intent }), nonce: b64(nonce) };
  };
  const reveal = async (a, id, name, note) => {
    const k = newKeypair();
    const r = await http(a, name, note, "POST", `/api/deals/${id}/reveal`, { request_ct: seal(ENCLAVE_PUBKEY, { wallet: a.login, eph_pub: k.pub, account: a.account, deal: id }), account: a.account });
    const offers = unseal(k.sk, r.offers_ct), meta = r.offers || [];
    const thread = meta.map((m) => ({ ...m, sealed: offers.find((o) => o.commitment === m.commitment) })).filter((m) => m.sealed);
    const human = (t) => `sell ${fromUnits(t.sell_amount, tokenById(t.sell_token).decimals)} ${tokenById(t.sell_token).symbol} for ${fromUnits(t.buy_amount, tokenById(t.buy_token).decimals)} ${tokenById(t.buy_token).symbol}`;
    steps[steps.length - 1].decrypted_by_caller = thread.map((m) => ({ id: m.id, kind: m.kind, from: m.from, to: m.to, status: m.status, terms: human(m.sealed.terms) }));
    return { thread };
  };
  const mirror = (t) => ({ sell_token: t.buy_token, sell_amount: t.buy_amount, buy_token: t.sell_token, buy_amount: t.sell_amount });

  let before, after;
  try {
    // 0. low-balance refusal (and one faucet top-up attempt through the existing faucet route when low)
    const S = tokenById(SELL.sym), B = tokenById(ASK.sym);
    const read = async () => ({ keeper: await keeperBalance(ctx.keeperId), makerSell: await bal(maker.account, SELL.sym), takerBuy: await bal(taker.account, ASK.sym) });
    let b = await read();
    const low = (b) => [b.keeper < MIN_KEEPER_YOCTO && "relayer NEAR balance", b.makerSell < MIN_MAKER_SELL && `maker ${SELL.sym} balance`, b.takerBuy < MIN_TAKER_BUY && `taker ${ASK.sym} balance`].filter(Boolean);
    let lows = low(b);
    if (lows.some((x) => x !== "relayer NEAR balance")) {
      for (const a of [maker, taker]) {
        if ((a === maker && b.makerSell >= MIN_MAKER_SELL) || (a === taker && b.takerBuy >= MIN_TAKER_BUY)) continue;
        await signIn(a);
        await http(a, `${a.role} claims the Tidepool faucet`, "Low balance: one claim through the existing faucet route (Tidepool allows one per account per hour).", "POST", "/api/faucet", { account: a.account }).catch(() => {});
      }
      b = await read(); lows = low(b);
    }
    before = { maker_eth: fmt(b.makerSell, SELL.sym), taker_usdc: fmt(b.takerBuy, ASK.sym), relayer_near: fromUnits(b.keeper, 24, 3) };
    if (lows.length) { busy = false; return { code: 503, body: { ok: false, refused: "low-balance", error: `Refusing to run: low ${lows.join(", ")}. Top up the demo accounts (Tidepool faucet) or the relayer, then retry.`, accounts: { maker: maker.account, taker: taker.account }, balances: before, steps, elapsed_s: Math.round((Date.now() - t0) / 1000) } }; }

    for (const a of [maker, taker]) if (!sessions.has(a.account)) await signIn(a);

    // 1. maker posts to the board (public, auto-approve for anyone holding the $50 gate)
    const id = Array.from(randomBytes(16), (x) => "23456789abcdefghjkmnpqrstuvwxyz"[x % 31]).join("");
    const terms = { sell_token: S.id, sell_amount: toUnits(SELL.amt, S.decimals), buy_token: B.id, buy_amount: toUnits(ASK.amt, B.decimals) };
    const o = await signedOffer(maker, { deal: id, to: "*", terms, deadlineMs: Date.now() + TTL_MS });
    const auto_approval = await nep(maker, { message: JSON.stringify({ otc_approve: id, requester: "*" }), nonce: randomBytes(32), recipient: "near-private-otc" });
    makerNonces = [o.nonce];
    const posted = await http(maker, "maker posts the deal", `Sealed to the enclave: sell ${SELL.amt} ${SELL.sym} for ${ASK.amt} ${ASK.sym}. The board shows only pair/side/expiry.`, "POST", "/api/deals", { ...o, account: maker.account, visibility: "public", auto_approval });
    deal = posted.id;

    // 2. anyone sees it on the board (no auth)
    const board = await http(null, "deal is on the public board", "Public, no sign-in: pair, side and expiry only; no size or price.", "GET", "/api/deals");
    steps[steps.length - 1].response = { count: board.length, ours: redact(board.find((d) => d.id === deal) || null) };

    // 3. taker requests terms, 4. reads them
    await http(taker, "taker requests the terms", "Enclave authenticates the taker; the app checks the fixed $50 holding of the wanted token; auto-approve admits them.", "POST", `/api/deals/${deal}/request`, { request_ct: seal(ENCLAVE_PUBKEY, { wallet: taker.login, account: taker.account, deal }), account: taker.account });
    const r1 = await reveal(taker, deal, "taker reads the sealed terms", "Enclave re-seals the terms to a one-time key only the taker holds.");
    const open = r1.thread.find((m) => m.sealed.to === "*"); if (!open) throw new Error("taker could not read the opening offer");

    // 5. taker counters
    const ms = mirror(open.sealed.terms), counterTerms = { ...ms, sell_amount: toUnits(COUNTER, B.decimals) };
    const c = await signedOffer(taker, { deal, to: open.from, terms: counterTerms, deadlineMs: Date.parse(open.sealed.deadline) });
    await http(taker, "taker counters", `Counter: ${COUNTER} ${ASK.sym} for ${SELL.amt} ${SELL.sym} (below the ${ASK.amt} ${ASK.sym} ask). Nothing settles; only the two parties can read it.`, "POST", `/api/deals/${deal}/offer`, { ...c, account: taker.account, kind: "counter", reply_to: open.id });

    // 6. maker reads the counter, 7. accepts it -> settle
    const r2 = await reveal(maker, deal, "maker reads the counter", "Maker's one-time key; the live counter addressed to the maker is visible.");
    const got = [...r2.thread].reverse().find((m) => m.kind === "counter" && m.status === "live" && m.to === maker.account); if (!got) throw new Error("maker could not find the taker's counter");
    const acc = await signedOffer(maker, { deal, to: got.from, terms: mirror(got.sealed.terms), deadlineMs: Date.parse(got.sealed.deadline) });
    makerNonces.push(acc.nonce);
    const s = await http(maker, "maker accepts the counter and settles", "Exact mirror of the counter -> enclave match -> simulate_intents -> execute_intents on the Tidepool-sandbox verifier.", "POST", `/api/deals/${deal}/offer`, { ...acc, account: maker.account, kind: "accept", reply_to: got.id });
    settled = !!s.settled;

    // 8. verify
    const fin = await http(null, "deal is Settled", "Public deal status after settlement.", "GET", `/api/deals/${deal}`);
    const b2 = await read();
    after = { maker_eth: fmt(b2.makerSell, SELL.sym), taker_usdc: fmt(b2.takerBuy, ASK.sym), relayer_near: fromUnits(b2.keeper, 24, 3) };
    return { code: 200, body: {
      ok: fin.status === "Settled", summary: `Maker posted ${SELL.amt} ${SELL.sym} for ${ASK.amt} ${ASK.sym}; taker countered ${COUNTER} ${ASK.sym}; maker accepted the counter; settled via execute_intents on ${VERIFIER}.`,
      network: "testnet", settlement: "Tidepool sandbox verifier (NEAR Intents defuse); cross-chain legs would use Tidepool's 1Click-compatible API",
      deal: { id: deal, link: `${ctx.origin}/d/${deal}`, status: fin.status, settle_tx: fin.settle_tx },
      accounts: { maker: { id: maker.account, explorer: `${EXPLORER}/address/${maker.account}` }, taker: { id: taker.account, explorer: `${EXPLORER}/address/${taker.account}` } },
      balances: { before, after }, explorer, steps, elapsed_s: Math.round((Date.now() - t0) / 1000),
    } };
  } catch (e) {
    if (deal && !settled && makerNonces.length && sessions.has(maker.account)) {
      try { // clean up: burn the maker's nonces so no live signed intent is left behind
        const signed = []; for (const n of makerNonces) signed.push(await nep(maker, intentPayload({ signer: maker.account, intents: [], deadlineMs: Date.now() + 600000, nonce: Uint8Array.from(Buffer.from(n, "base64")) })));
        await http(maker, "cleanup: maker cancels the unsettled deal", "Cancel = burn the maker's nonces (empty intents re-using them).", "POST", `/api/deals/${deal}/cancel`, { account: maker.account, signed });
      } catch { /* reported in the step log */ }
    }
    return fail(502, e.message);
  } finally { busy = false; }
}
