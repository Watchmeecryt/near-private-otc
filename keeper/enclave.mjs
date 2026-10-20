// Calls the Private OTC enclave through OutLayer on NEAR: the keeper account calls
// outlayer.testnet.request_execution (yield/resume) and reads the enclave's answer from the final
// transaction outcome. Inputs are sealed blobs; the keeper never holds the enclave key.
import { call, lastValue } from "./chain.mjs";
export const OUTLAYER = "outlayer.testnet";
export const PROJECT = process.env.OUTLAYER_PROJECT || "otcdesk-enclave.testnet/private-otc";
export const SECRETS_OWNER = PROJECT.split("/")[0];
const DEPOSIT = process.env.TEE_DEPOSIT || "20000000000000000000000"; // 0.02 NEAR, unused part refunded

export async function enclave(keeper, input) {
  const o = await call(keeper, OUTLAYER, "request_execution", {
    source: { Project: { project_id: PROJECT, version_key: null } },
    resource_limits: { max_instructions: 20_000_000_000, max_memory_mb: 128, max_execution_seconds: 60 },
    input_data: JSON.stringify(input),
    secrets_ref: { profile: "default", account_id: SECRETS_OWNER },
    response_format: "Json",
    payer_account_id: null,
  }, { tgas: 300, deposit: DEPOSIT });
  const v = lastValue(o);
  if (!v || v.success !== true) throw Object.assign(new Error(v?.error || "enclave error"), { tx: o.transaction.hash });
  return { ...v.result, tx: o.transaction.hash };
}
