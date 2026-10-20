import { connect, keyStores, KeyPair } from "near-api-js";
const N = Number(process.argv[2] || 1); const ben = "otcdesk.testnet";
const ks = new keyStores.InMemoryKeyStore();
const near = await connect({ networkId: "testnet", nodeUrl: "https://test.rpc.fastnear.com", keyStore: ks });
for (let i = 0; i < N; i++) {
  const id = `otcfaucet${Date.now().toString(36)}${i}.testnet`; const kp = KeyPair.fromRandom("ed25519");
  const r = await fetch("https://helper.nearprotocol.com/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }) });
  if (!r.ok) { console.log("create failed", r.status, (await r.text()).slice(0, 120)); break; }
  await ks.setKey("testnet", id, kp); await new Promise((s) => setTimeout(s, 3000));
  const a = await near.account(id); const bal = (await a.getAccountBalance()).total;
  await a.deleteAccount(ben); console.log(id, "->", Number(BigInt(bal) / 10n ** 21n) / 1000, "NEAR");
}
