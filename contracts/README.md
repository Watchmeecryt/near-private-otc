# Contracts

We did not write a new settlement contract. Both wasm files are the unmodified upstream releases from https://github.com/near/intents (MIT):

| File | Source | sha256 | Deployed at |
| --- | --- | --- | --- |
| `defuse.wasm` | release `defuse/v0.4.2` asset `defuse.wasm` | `f67f9559b3b512c52dfa11723a28b9119bcf773ac01780370d6409e5f1fb20e5` | `otcdesk-intents.testnet` |
| `fungible_token.wasm` | `releases/fungible-token.wasm` on `main` | `12c5f9bd9136b4396823478281a61368b4c74cdaf35ab5743b302c3aac55a354` | `otcdesk-usdc.testnet`, `otcdesk-eth.testnet` |

Fetch them with:

```sh
gh release download defuse/v0.4.2 -R near/intents -p defuse.wasm
curl -L -o fungible_token.wasm https://raw.githubusercontent.com/near/intents/main/releases/fungible-token.wasm
```

Verifier init: `new({config:{wnear_id:"wrap.testnet", fees:{fee:0, fee_collector:"otcdesk.testnet"}, roles:{super_admins:["otcdesk.testnet"]}}})`. See `scripts/deploy-near.mjs`.
