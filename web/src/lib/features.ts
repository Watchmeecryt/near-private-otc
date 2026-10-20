import { VERIFIER, KEEPER, OUTLAYER_PROJECT, EXPLORER } from "@shared/otc.mjs";
export const FEATURES: [string, string, string][] = [
  ["Own NEAR Intents verifier", `The open-source near/intents verifier (defuse v0.4.2 release wasm) deployed at ${VERIFIER}, since NEAR Intents has no public testnet. It holds balances and settles deals.`, "https://docs.near-intents.org/integration/verifier-contract/introduction"],
  ["token_diff + execute_intents", "Each side signs a token_diff (−what I give, +what I get). The relayer submits both in one execute_intents call; the verifier checks they net to zero, so the swap is atomic.", "https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution"],
  ["simulate_intents", "Before paying gas, the relayer dry-runs the matched pair with simulate_intents and refuses anything that would fail.", "https://docs.near-intents.org/integration/verifier-contract/simulating-intents"],
  ["NEP-413 message signing", "Intents are NEP-413 payloads (signer, deadline, nonce, recipient = our verifier) signed with your Privy-held ed25519 key. No gas, no transaction.", "https://github.com/near/NEPs/blob/master/neps/nep-0413.md"],
  ["Implicit accounts", "Your 64-hex NEAR account is derived from your public key; the verifier trusts that key without add_public_key.", "https://docs.near-intents.org/integration/verifier-contract/account-abstraction"],
  ["Deadlines & nonces", "Every offer carries a deadline (expiry). Cancelling re-uses your offer nonces in empty intents so the verifier marks them used: old signatures can never settle.", "https://docs.near-intents.org/integration/verifier-contract/signing-intents"],
  ["Faucet deposits (ft_transfer_call)", "The faucet credits test tokens straight into your verifier balance with ft_transfer_call (msg = your account). Advanced: the verifier also supports signed ft_withdraw intents; the API keeps a relay for them.", "https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/deposits"],
  ["Storage deposits (NEP-145)", "The verifier is pre-registered on each token so faucet deposits land without any setup on your side.", "https://docs.near.org/smart-contracts/anatomy/storage"],
  ["Relayer-paid gas", `${KEEPER} pays for execute_intents, so signing deals costs you nothing. `, "https://docs.near.org/chain-abstraction/meta-transactions"],
  ["OutLayer TEE (Intel TDX)", `Terms are sealed to an enclave key that exists only inside ${OUTLAYER_PROJECT}. The keeper calls outlayer.testnet request_execution (yield/resume), so every reveal and match is a NEAR transaction.`, "https://outlayer.fastnear.com"],
  ["NEP-141 test tokens & wNEAR", "tUSDC and tETH are standard NEP-141 tokens (near/intents release wasm); wNEAR is wrap.testnet.", "https://docs.near.org/primitives/ft"],
  ["NearBlocks", "Every seal, reveal, settlement and cancel links to its transaction on testnet.nearblocks.io.", EXPLORER],
];
