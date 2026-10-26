#!/usr/bin/env node
// Two-agent (or N-agent) demo: a maker agent and taker agent(s) trade on NEAR Private OTC with no human.
//   U=<APP_URL> node scripts/agents/run.mjs                 # 1 maker + 1 taker, fresh implicit accounts
//   U=<APP_URL> TAKERS=3 node scripts/agents/run.mjs        # 1 maker + 3 takers racing; first accept settles
//   U=<APP_URL> node scripts/agents/run.mjs --negotiate     # taker counters once, maker accepts or counters back, then settle
//   U=<APP_URL> PARENT_ID=you.testnet PARENT_KEY=ed25519:… node scripts/agents/run.mjs --subaccounts
// Each run costs OutLayer enclave calls (post: 2, per taker: request + reveal + accept check, settle: 1).
// --negotiate adds: taker counter check, maker reveal, maker counter check (if it counters back), taker reveal.
import { Agent, newKey, say, color as C, short, tx, human, amt, U } from "./lib.mjs";
import { call, lastValue, RPC } from "../../keeper/chain.mjs";
import { connect, keyStores, KeyPair } from "near-api-js";
import { VERIFIER, randomBytes } from "../../shared/otc.mjs";

const SUB = process.argv.includes("--subaccounts"), NEG = process.argv.includes("--negotiate");
// Negotiation policy (amounts of the BUY token for the whole SELL amount):
//   taker opens at COUNTER; maker accepts anything >= FLOOR, otherwise counters back halfway;
//   taker accepts the maker's reply if it is <= LIMIT, otherwise declines.
const LIST = Number((process.env.BUY || "20 USDC").split(" ")[0]);
const COUNTER = Number(process.env.COUNTER || LIST * 0.9), FLOOR = Number(process.env.FLOOR || LIST * 0.95), LIMIT = Number(process.env.LIMIT || LIST * 0.97);
const N = NEG ? 1 : Math.max(1, Number(process.env.TAKERS || 1));
const SELL = (process.env.SELL || "0.005 ETH").split(" "), BUY = (process.env.BUY || "20 USDC").split(" ");
const sys = (m) => say("system", C.dim, m);
const cols = [C.y, C.m, C.g, C.r];

sys(`app ${U}  mode ${SUB ? "sub-accounts" : "implicit accounts"}  takers ${N}${NEG ? `  negotiate (counter ${COUNTER}, floor ${FLOOR}, limit ${LIMIT} ${BUY[1]})` : ""}`);
const maker = new Agent("maker", C.c, newKey());
const takers = Array.from({ length: N }, (_, i) => new Agent(N > 1 ? `taker${i + 1}` : "taker", cols[i % 4], newKey()));
const all = [maker, ...takers];

if (SUB) {
  // Each agent lives in its own named sub-account of a parent you control (blast radius = that sub-account).
  // One key store for every on-chain signer (near-api-js caches the signer per connection).
  const ks = new keyStores.InMemoryKeyStore(), near = await connect({ networkId: "testnet", nodeUrl: RPC, keyStore: ks, logger: false });
  const account = async (id, key) => { await ks.setKey("testnet", id, KeyPair.fromString(key)); return near.account(id); };
  const parent = await account(process.env.PARENT_ID, process.env.PARENT_KEY);
  const tag = Buffer.from(randomBytes(3)).toString("hex");
  for (const a of all) {
    a.account = `${a.name}-${tag}.${process.env.PARENT_ID}`;
    const o = await parent.createAccount(a.account, "ed25519:" + a.key.pkB58, 50000000000000000000000n); // 0.05 NEAR
    a.log(`created sub-account ${a.account}  ${C.dim}${tx(o.transaction.hash)}${C.x}`);
    const me = await account(a.account, a.key.nearSecret);
    const r = await call(me, VERIFIER, "add_public_key", { public_key: "ed25519:" + a.key.pkB58 }, { tgas: 30, deposit: "1" });
    lastValue(r); a.log(`registered its key on the verifier (add_public_key)  ${C.dim}${tx(r.transaction.hash)}${C.x}`);
  }
  // Limited key test: a function-call key for the verifier cannot sign in (app + enclave require full access).
  const fc = newKey(), me = await near.account(maker.account);
  await me.addKey("ed25519:" + fc.pkB58, VERIFIER, [], 25000000000000000000000n /* 0.025 NEAR gas allowance */);
  const probe = new Agent("maker", C.c, fc, maker.account);
  await probe.signIn().then(() => maker.log("function-call key sign-in: accepted (unexpected)"), (e) => maker.log(`function-call key sign-in refused as expected: ${C.dim}${e.message.slice(0, 90)}${C.x}`));
} else for (const a of all) a.log(`new key, implicit account ${short(a.account)}`);

for (const a of all) { await a.signIn(); a.log("signed in with NEP-413 {otc_login, ts} -> session"); }

maker.log(`faucet ${SELL[1]}: ${C.dim}${tx((await maker.faucet(SELL[1])).tx)}${C.x}`);
for (const t of takers) t.log(`faucet ${BUY[1]}: ${C.dim}${tx((await t.faucet(BUY[1])).tx)}${C.x}`);

maker.log(`posting: sell ${SELL.join(" ")} for ${BUY.join(" ")}, sealed to the enclave, auto-approve on …`);
const d = await maker.postDeal(SELL, BUY, 30 * 60e3);
maker.log(`${C.g}deal ${d.id}${C.x} is on the board as ${d.pair} ${d.side} (no size, no price)  ${C.dim}${tx(d.check_tx)}${C.x}`);

let settled = null;
try {
  await Promise.all(takers.map(async (t) => {
    const board = await t.http("GET", "/api/deals");
    const seen = board.find((x) => x.id === d.id);
    t.log(`board shows ${board.length} deals; found ${seen.id}: ${seen.pair} ${seen.side}, expires ${seen.deadline.slice(11, 16)} UTC`);
    const q = await t.requestTerms(d.id); t.log(`requested terms -> ${q.request.status} (held $50+ of ${BUY[1]}, maker auto-approves)`);
    const { offers, tx: rtx } = await t.readTerms(d.id);
    const open = offers.find((o) => o.to === "*");
    t.log(`enclave re-sealed the terms to my one-time key: ${C.b}${human(open.terms)}${C.x}  ${C.dim}${tx(rtx)}${C.x}`);
    if (NEG) { settled = await negotiate(t, open); return; }
    t.log("terms OK, signing the exact mirror intent and accepting …");
    try {
      const s = await t.accept(d.id, open); settled = { by: t, ...s };
      t.log(`${C.g}${C.b}SETTLED${C.x} via execute_intents  ${C.dim}${tx(s.tx)}${C.x}`);
    } catch (e) { t.log(`${C.dim}lost the race: ${e.message.slice(0, 100)}${C.x}`); }
  }));
} finally {
  if (!settled) { maker.log("no fill, cancelling (nonce burn) …"); maker.log(`cancelled ${C.dim}${tx((await maker.cancel(d.id)).tx)}${C.x}`); }
}
if (settled) {
  maker.log(`balances: ${await maker.balance(SELL[1])} ${SELL[1]}, ${await maker.balance(BUY[1])} ${BUY[1]}`);
  settled.by.log(`balances: ${await settled.by.balance(SELL[1])} ${SELL[1]}, ${await settled.by.balance(BUY[1])} ${BUY[1]}`);
  sys(`deal ${d.id} status: ${(await maker.http("GET", `/api/deals/${d.id}`)).status}`);
}

// One round of private negotiation, all through the same /offer, /reveal and /decline calls the web UI uses.
async function negotiate(t, open) {
  const sellAmt = amt(open.terms.sell_amount, open.terms.sell_token);
  t.log(`countering: ${sellAmt} ${SELL[1]} for ${C.b}${COUNTER} ${BUY[1]}${C.x} (listing asks ${LIST}), sealed to the enclave …`);
  const c1 = await t.counter(d.id, { id: "o1", from: open.from, sealed: open }, COUNTER, sellAmt, "agent counter");
  t.log(`counter ${c1.offer.id} sent; only the maker can read it  ${C.dim}${tx(c1.offer.tx)}${C.x}`);
  const m = await maker.readTerms(d.id);
  const got = [...m.thread].reverse().find((o) => o.kind === "counter" && o.status === "live" && o.to === maker.account);
  const offerAmt = amt(got.sealed.terms.sell_amount, got.sealed.terms.sell_token);
  maker.log(`read counter ${got.id} with my one-time key: ${C.b}${human(got.sealed.terms)}${C.x}  ${C.dim}${tx(m.tx)}${C.x}`);
  if (offerAmt >= FLOOR) {
    maker.log(`>= my floor ${FLOOR}: accepting the counter …`);
    const s = await maker.acceptOffer(d.id, got);
    maker.log(`${C.g}${C.b}SETTLED${C.x} via execute_intents  ${C.dim}${tx(s.tx)}${C.x}`); return { by: t, ...s };
  }
  const back = +((LIST + offerAmt) / 2).toFixed(6);
  maker.log(`below my floor ${FLOOR}: countering back at ${C.b}${back} ${BUY[1]}${C.x} …`);
  const c2 = await maker.counter(d.id, got, sellAmt, back, "meet in the middle");
  maker.log(`counter ${c2.offer.id} sent  ${C.dim}${tx(c2.offer.tx)}${C.x}`);
  const r = await t.readTerms(d.id);
  const reply = [...r.thread].reverse().find((o) => o.kind === "counter" && o.status === "live" && o.to === t.account);
  const ask = amt(reply.sealed.terms.buy_amount, reply.sealed.terms.buy_token);
  t.log(`read reply ${reply.id}: ${C.b}${human(reply.sealed.terms)}${C.x}  ${C.dim}${tx(r.tx)}${C.x}`);
  if (ask > LIMIT) { await t.decline(d.id, reply.id); t.log(`above my limit ${LIMIT}: declined ${reply.id}`); return null; }
  t.log(`<= my limit ${LIMIT}: signing the exact mirror of ${reply.id} and accepting …`);
  const s = await t.acceptOffer(d.id, reply);
  t.log(`${C.g}${C.b}SETTLED${C.x} via execute_intents  ${C.dim}${tx(s.tx)}${C.x}`); return { by: t, ...s };
}
