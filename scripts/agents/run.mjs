#!/usr/bin/env node
// Two-agent (or N-agent) demo: a maker agent and taker agent(s) trade on NEAR Private OTC with no human.
//   U=<APP_URL> node scripts/agents/run.mjs                 # 1 maker + 1 taker, fresh implicit accounts
//   U=<APP_URL> TAKERS=3 node scripts/agents/run.mjs        # 1 maker + 3 takers racing; first accept settles
//   U=<APP_URL> PARENT_ID=you.testnet PARENT_KEY=ed25519:… node scripts/agents/run.mjs --subaccounts
// Each run costs OutLayer enclave calls (post: 2, per taker: request + reveal + accept check, settle: 1).
import { Agent, newKey, say, color as C, short, tx, human, U } from "./lib.mjs";
import { call, lastValue, RPC } from "../../keeper/chain.mjs";
import { connect, keyStores, KeyPair } from "near-api-js";
import { VERIFIER, randomBytes } from "../../shared/otc.mjs";

const SUB = process.argv.includes("--subaccounts");
const N = Math.max(1, Number(process.env.TAKERS || 1));
const SELL = (process.env.SELL || "0.01 tETH").split(" "), BUY = (process.env.BUY || "20 tUSDC").split(" ");
const sys = (m) => say("system", C.dim, m);
const cols = [C.y, C.m, C.g, C.r];

sys(`app ${U}  mode ${SUB ? "sub-accounts" : "implicit accounts"}  takers ${N}`);
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
    const q = await t.requestTerms(d.id); t.log(`requested terms -> ${q.request.status} (held $200+ of ${BUY[1]}, maker auto-approves)`);
    const { offers, tx: rtx } = await t.readTerms(d.id);
    const open = offers.find((o) => o.to === "*");
    t.log(`enclave re-sealed the terms to my one-time key: ${C.b}${human(open.terms)}${C.x}  ${C.dim}${tx(rtx)}${C.x}`);
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
