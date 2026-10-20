// One-time testnet deployment: verifier (near/intents defuse v0.4.2 release wasm) + two test NEP-141 tokens.
// Keys come from an env file outside the repo (never committed).
import fs from "node:fs";
import { account, call, view } from "../keeper/chain.mjs";
const E = process.env, Y = 10n ** 24n;
const K = (id) => E["KEY_" + id.split(".")[0].replace(/-/g, "_").toUpperCase()];
const acct = (id) => account(id, K(id));
const KEEPER = "otcdesk.testnet", VERIFIER = "otcdesk-intents.testnet";
const TOKENS = [
  { id: "otcdesk-usdc.testnet", name: "Private OTC test USDC", symbol: "tUSDC", decimals: 6, supply: 10n ** 15n },
  { id: "otcdesk-eth.testnet", name: "Private OTC test ETH", symbol: "tETH", decimals: 18, supply: 10n ** 27n },
];
const out = { network: "testnet", keeper: KEEPER, verifier: VERIFIER, wnear: "wrap.testnet", tokens: TOKENS.map((t) => t.id), txs: {} };
const step = process.argv[2] || "all";
if (step === "all" || step === "fund") {
  for (const src of ["otcdesk-fund1.testnet"]) { const r = await (await acct(src)).sendMoney(VERIFIER, 9n * Y); out.txs.fund_verifier = r.transaction.hash; }
  const r = await (await acct("otcdesk-fund2.testnet")).sendMoney(KEEPER, 9n * Y); out.txs.fund_keeper = r.transaction.hash;
}
if (step === "all" || step === "verifier") {
  const v = await acct(VERIFIER);
  const d = await v.deployContract(fs.readFileSync(new URL("../contracts/defuse.wasm", import.meta.url)));
  out.txs.verifier_deploy = d.transaction.hash;
  const i = await call(v, VERIFIER, "new", { config: { wnear_id: "wrap.testnet", fees: { fee: 0, fee_collector: KEEPER }, roles: { super_admins: [KEEPER], admins: {}, grantees: {} } } }, { tgas: 100 });
  out.txs.verifier_init = i.transaction.hash;
}
if (step === "all" || step === "tokens") {
  const k = await acct(KEEPER);
  for (const t of TOKENS) {
    const a = await acct(t.id);
    const d = await a.deployContract(fs.readFileSync(new URL("../contracts/fungible_token.wasm", import.meta.url)));
    const i = await call(a, t.id, "new", { owner_id: KEEPER, total_supply: String(t.supply), metadata: { spec: "ft-1.0.0", name: t.name, symbol: t.symbol, decimals: t.decimals } }, { tgas: 50 });
    const s = await call(k, t.id, "storage_deposit", { account_id: VERIFIER, registration_only: true }, { tgas: 30, deposit: String(125n * 10n ** 22n) });
    out.txs[t.symbol] = { deploy: d.transaction.hash, init: i.transaction.hash, register_verifier: s.transaction.hash };
  }
  for (const who of [VERIFIER, KEEPER]) await call(k, "wrap.testnet", "storage_deposit", { account_id: who, registration_only: true }, { tgas: 30, deposit: String(125n * 10n ** 22n) });
}
for (const t of TOKENS) console.log(t.id, await view(t.id, "ft_metadata").catch((e) => e.message));
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(new URL(`../deployments/deploy-${step}.json`, import.meta.url), JSON.stringify(out, null, 2));
