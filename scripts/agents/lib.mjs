// Tiny agent toolkit for NEAR Private OTC: one ed25519 key = one agent. Plain HTTP + shared/otc.mjs.
import nc from "node:crypto";
import { ENCLAVE_PUBKEY, VERIFIER, intentPayload, tokenDiff, seal, unseal, newKeypair, signIntent, base58, toUnits, fromUnits, tokenById, randomBytes, b64 } from "../../shared/otc.mjs";
import { view } from "../../keeper/chain.mjs";

export const U = (process.env.U || "http://127.0.0.1:8790").replace(/\/$/, "");
const C = { dim: "\x1b[2m", b: "\x1b[1m", g: "\x1b[32m", c: "\x1b[36m", y: "\x1b[33m", m: "\x1b[35m", r: "\x1b[31m", x: "\x1b[0m" };
export const color = C;
export const short = (a) => (a.length > 20 ? a.slice(0, 6) + "…" + a.slice(-4) : a);
export const tx = (h) => `https://testnet.nearblocks.io/txns/${h}`;
const t0 = Date.now();
export function say(who, col, msg) { const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(5); console.log(`${C.dim}${s}s${C.x} ${col}${C.b}${who.padEnd(8)}${C.x} ${msg}`); }

/** A fresh ed25519 key. Its implicit account id is the hex public key. */
export function newKey() {
  const { privateKey, publicKey } = nc.generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12);
  const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(16);
  return { priv: privateKey, raw, pkB58: base58(raw), hex: raw.toString("hex"), nearSecret: "ed25519:" + base58(Buffer.concat([seed, raw])) };
}

export class Agent {
  constructor(name, col, key, account) { Object.assign(this, { name, col, key, account: account || key.hex }); }
  log(m) { say(this.name, this.col, m); }
  nep(p) { return signIntent(p, this.key.pkB58, async (h) => new Uint8Array(nc.sign(null, Buffer.from(h), this.key.priv))); }
  async http(method, path, body) {
    const r = await fetch(U + path, { method, headers: { "content-type": "application/json", ...(this.token ? { authorization: "Bearer " + this.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`${method} ${path} -> ${r.status} ${j.error || JSON.stringify(j)}`), { status: r.status });
    return j;
  }
  /** NEP-413 sign-in {otc_login, ts} for recipient near-private-otc -> Bearer session. */
  async signIn() {
    this.login = await this.nep({ message: JSON.stringify({ otc_login: this.account, ts: Date.now() }), nonce: randomBytes(32), recipient: "near-private-otc" });
    this.token = (await this.http("POST", "/api/auth/wallet", { signed: this.login })).token;
    return this.token;
  }
  faucet(token) { return this.http("POST", "/api/faucet", { account: this.account, token }); }
  async balance(sym) { const t = tokenById(sym); return fromUnits(await view(VERIFIER, "mt_balance_of", { account_id: this.account, token_id: t.id }).catch(() => "0"), t.decimals); }
  async signedOffer({ deal, to, terms, deadlineMs }) {
    const nonce = randomBytes(32);
    const intent = await this.nep(intentPayload({ signer: this.account, intents: [tokenDiff(terms.sell_token, terms.sell_amount, terms.buy_token, terms.buy_amount)], deadlineMs, nonce }));
    return { offer_ct: seal(ENCLAVE_PUBKEY, { v: 1, deal, from: this.account, to, terms, note: "", intent }), nonce: b64(nonce) };
  }
  /** Maker: post a public deal selling `sell` for `buy` (["0.01","ETH"]) with auto-approve for anyone with funds. */
  async postDeal(sell, buy, ttlMs) {
    const S = tokenById(sell[1]), B = tokenById(buy[1]);
    const terms = { sell_token: S.id, sell_amount: toUnits(sell[0], S.decimals), buy_token: B.id, buy_amount: toUnits(buy[0], B.decimals) };
    const a = "23456789abcdefghjkmnpqrstuvwxyz", deal = Array.from(randomBytes(16), (x) => a[x % a.length]).join("");
    const o = await this.signedOffer({ deal, to: "*", terms, deadlineMs: Date.now() + ttlMs });
    const auto_approval = await this.nep({ message: JSON.stringify({ otc_approve: deal, requester: "*" }), nonce: randomBytes(32), recipient: "near-private-otc" });
    this.offerNonces = [o.nonce];
    return this.http("POST", "/api/deals", { ...o, account: this.account, visibility: "public", auto_approval });
  }
  requestTerms(id) { return this.http("POST", `/api/deals/${id}/request`, { request_ct: seal(ENCLAVE_PUBKEY, { wallet: this.login, account: this.account, deal: id }), account: this.account }); }
  /** Enclave re-seals the terms to a one-time key only this agent holds. Returns the sealed contents (offers),
   *  the keeper's thread metadata (ids, kind, status) and both zipped together as `thread`. */
  async readTerms(id) {
    const k = newKeypair();
    const r = await this.http("POST", `/api/deals/${id}/reveal`, { request_ct: seal(ENCLAVE_PUBKEY, { wallet: this.login, eph_pub: k.pub, account: this.account, deal: id }), account: this.account });
    const offers = unseal(k.sk, r.offers_ct), meta = r.offers || [];
    const thread = meta.map((m) => ({ ...m, sealed: offers.find((o) => o.commitment === m.commitment) })).filter((m) => m.sealed);
    return { offers, meta, thread, tx: r.tx };
  }
  /** Sign and send an offer that replies to `target` (a thread item): kind "accept" (exact mirror) or "counter". */
  async reply(id, target, kind, terms, note = "") {
    const deadlineMs = Date.parse(target.sealed.deadline);
    const o = await this.signedOffer({ deal: id, to: target.from, terms, deadlineMs, note });
    (this.offerNonces ||= []).push(o.nonce);
    return this.http("POST", `/api/deals/${id}/offer`, { ...o, account: this.account, kind, reply_to: target.id });
  }
  /** Taker: sign the exact mirror of the opening offer and accept -> enclave match -> execute_intents. */
  accept(id, open) { return this.acceptOffer(id, { id: "o1", from: open.from, sealed: open }); }
  /** Accept any live offer addressed to me (the listing or a counter): exact mirror of its terms. */
  acceptOffer(id, target) { return this.reply(id, target, "accept", mirror(target.sealed.terms)); }
  /** Counter `target` with my own terms (same token pair, my side): `give` of what I pay, `get` of what I receive. */
  counter(id, target, give, get, note = "") {
    const m = mirror(target.sealed.terms), S = tokenById(m.sell_token), B = tokenById(m.buy_token);
    return this.reply(id, target, "counter", { ...m, sell_amount: toUnits(String(give), S.decimals), buy_amount: toUnits(String(get), B.decimals) }, note);
  }
  /** Decline a live counter addressed to me (no enclave call). */
  decline(id, offerId) { return this.http("POST", `/api/deals/${id}/decline`, { account: this.account, offer_id: offerId }); }
  /** Cross-chain payout through the 1Click API (Tidepool on testnet): quote `amount` of `asset` from my verifier
   *  balance -> `base` (USDC/USDT) on EVM `chain` to `evm`, sign one transfer to the quote's deposit account, relay it. */
  async bridgeOut({ asset, amount, chain, base, evm }) {
    const q = await this.http("POST", "/api/bridge/quote", { account: this.account, direction: "out", chain, base, asset: tokenById(asset).id, amount, evm });
    const signed = await this.nep(intentPayload({ signer: this.account, intents: [{ intent: "transfer", receiver_id: q.depositAddress, tokens: { [q.asset]: q.amountIn } }], deadlineMs: Date.now() + 600000, nonce: randomBytes(32) }));
    const r = await this.http("POST", "/api/bridge/send", { account: this.account, signed, depositAddress: q.depositAddress });
    return { ...q, ...r };
  }
  bridgeStatus(depositAddress) { return this.http("GET", `/api/bridge/status?depositAddress=${encodeURIComponent(depositAddress)}`); }
  async cancel(id) {
    const signed = []; for (const n of this.offerNonces || []) signed.push(await this.nep(intentPayload({ signer: this.account, intents: [], deadlineMs: Date.now() + 600000, nonce: Uint8Array.from(Buffer.from(n, "base64")) })));
    return this.http("POST", `/api/deals/${id}/cancel`, { account: this.account, signed });
  }
}
export const mirror = (t) => ({ sell_token: t.buy_token, sell_amount: t.buy_amount, buy_token: t.sell_token, buy_amount: t.sell_amount });
export const amt = (units, tok) => Number(fromUnits(units, tokenById(tok).decimals));
export const human = (terms) => `${fromUnits(terms.sell_amount, tokenById(terms.sell_token).decimals)} ${tokenById(terms.sell_token).symbol} for ${fromUnits(terms.buy_amount, tokenById(terms.buy_token).decimals)} ${tokenById(terms.buy_token).symbol}`;
