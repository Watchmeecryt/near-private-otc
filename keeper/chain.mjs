import { connect, keyStores, KeyPair } from "near-api-js";
export const RPC = process.env.NEAR_RPC || "https://test.rpc.fastnear.com";
export async function view(contract, method, args = {}) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "optimistic", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }) });
  const j = await r.json();
  if (j.error || j.result?.error) throw new Error(JSON.stringify(j.error || j.result.error));
  return JSON.parse(Buffer.from(j.result.result).toString());
}
export async function account(id, key) {
  const ks = new keyStores.InMemoryKeyStore();
  await ks.setKey("testnet", id, KeyPair.fromString(key));
  const near = await connect({ networkId: "testnet", nodeUrl: RPC, keyStore: ks });
  return near.account(id);
}
export async function call(acct, contractId, methodName, args, { tgas = 300, deposit = "0" } = {}) {
  return acct.functionCall({ contractId, methodName, args, gas: BigInt(tgas) * 10n ** 12n, attachedDeposit: BigInt(deposit) });
}
export function lastValue(outcome) {
  const s = outcome.status;
  if (s.SuccessValue !== undefined) return s.SuccessValue ? JSON.parse(Buffer.from(s.SuccessValue, "base64").toString()) : null;
  throw new Error(JSON.stringify(s.Failure ?? s));
}
export function logsOf(outcome) { return outcome.receipts_outcome.flatMap((r) => r.outcome.logs); }
