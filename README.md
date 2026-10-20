# NEAR Private OTC

**A private OTC deal board on NEAR.** Post a deal with a sealed size and price, let strangers find it, negotiate privately, and settle both sides in one atomic NEAR Intents call.

- **Live app:** https://near-private-otc-production.up.railway.app
- **Network:** NEAR testnet only (test tokens, no real value).
- **Idea:** "Private OTC market using 'private deals' from NEAR Intents. Currently there is no way to find counter party unless you already know you are transacting with. Create a more open way to communicate what deals are open and allow people to fill them via NEAR Intents."

**Name:** NEAR Private OTC (short: Private OTC) says exactly what it is: an over-the-counter desk on NEAR where deal terms stay private.

## How it works

1. **Post.** The maker picks pair, side, size and price. The browser builds a `token_diff` intent (−what I give, +what I get), the maker signs it (NEP-413, no gas), and the whole offer `{terms, note, signed intent}` is sealed (ECIES secp256k1 + AES-256-GCM) to the enclave's public key. The keeper relays the sealed blob to the enclave (`check`), which verifies the signed intent matches the sealed terms and publishes **only** pair, side and the deadline (the keeper drops the enclave's coarse size band and never serves it).
2. **Request.** A signed-in taker taps *Request terms*. Their browser seals `{Privy access token, one-time public key, NEAR account, deal}` to the enclave. The enclave verifies the Privy token (ES256 against Privy JWKS), asks Privy from inside the TEE which NEAR wallets belong to that user, and re-seals the exact terms to the one-time browser key.
3. **Negotiate.** *Accept*, *Counter* or *Decline*. Each counter is a new signed intent sealed to the enclave, readable only by the two parties named inside it.
4. **Settle.** On *Accept*, the enclave (`settle`) checks the two signed intents are exact mirror images (same deal, opposite legs, equal amounts, different signers, addressed to each other) and releases them. The relayer dry-runs `simulate_intents` and calls `execute_intents` on our verifier. Both transfers happen in one transaction or not at all.
5. **Expire / cancel.** Every intent carries a `deadline`. To cancel, the maker signs empty intents that re-use each live offer nonce; executing them marks those nonces used, so the old signatures can never settle.

## Privacy model (honest version)

| Stays private | Who can read it |
| --- | --- |
| Exact size, price, notes | Enclave; the maker; takers who request |
| Counter-offers | Enclave; the two parties |
| Unfilled / cancelled deals' terms | Enclave and the parties, forever |
| Signed intents before settlement | Enclave only (sealed) |

| Public | Where |
| --- | --- |
| Pair, side, expiry, status, counter-offer count | Deal board (`/api/deals`, signed-in users only) |
| Settled transfers (both signed intents, amounts, accounts) | NEAR testnet, via `execute_intents` |
| That an OutLayer job ran (sealed input/output) | NEAR testnet (`outlayer.testnet`) |

What the operator (keeper) sees: sealed blobs, the coarse facts above, and *which accounts* requested or countered a deal (it needs this to route messages). It never holds the enclave key, so it cannot read terms or counters. Who viewed a deal is hidden from the public, not from the operator. We say so in the app.

### How sealing works

- The enclave is a Rust WASI program (`enclave/`) run by **OutLayer** inside an Intel TDX worker.
- Its private key is `HKDF(PROTECTED_OTC_MASTER)`. The master secret was generated inside the OutLayer keystore TEE (`outlayer secrets set --generate PROTECTED_OTC_MASTER:hex32`) and is never shown to anyone.
- Browsers seal to the enclave public key `03312dd677a5864ffc8cff352b7419b90896c9aee20e4f79308c1106517a4947e8` (verifiable by running the `pubkey` action; tx `9mXRyuvrpPwTQKbgRtfrVhLEPUqCJ7hn5PgFPCz67Heo`).
- The keeper calls `outlayer.testnet.request_execution` (NEAR yield/resume) with the sealed input, so every check, reveal and match is a NEAR transaction with a verifiable wasm hash.

## NEAR features used

| Feature | What it does here | Docs |
| --- | --- | --- |
| Own NEAR Intents verifier | Upstream `near/intents` verifier (defuse v0.4.2 release wasm) at `otcdesk-intents.testnet`, because NEAR Intents has no public testnet | [Verifier](https://docs.near-intents.org/integration/verifier-contract/introduction) |
| `token_diff` + `execute_intents` | Each side signs a token diff; both are executed together and must net to zero, so settlement is atomic | [Intent types](https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution) |
| `simulate_intents` | Relayer dry-runs every batch before paying gas | [Simulating](https://docs.near-intents.org/integration/verifier-contract/simulating-intents) |
| NEP-413 signing | Intents are NEP-413 payloads (recipient = our verifier) signed with the Privy-held ed25519 key via raw-hash signing | [NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md), [Signing intents](https://docs.near-intents.org/integration/verifier-contract/signing-intents) |
| Implicit accounts | 64-hex accounts; the verifier trusts the implicit key without `add_public_key` | [Account abstraction](https://docs.near-intents.org/integration/verifier-contract/account-abstraction) |
| Deadlines & nonces | Expiry via `deadline`; cancel by burning nonces with empty intents (v0.4.2 has no separate invalidate call) | [Signing intents](https://docs.near-intents.org/integration/verifier-contract/signing-intents) |
| `ft_transfer_call` deposits | The faucet credits test tokens straight into the user's verifier balance with `msg = account` (the API also relays signed `ft_withdraw` intents as an advanced, UI-less option) | [Deposits](https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/deposits), [Withdrawals](https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/withdrawals) |
| Storage deposits (NEP-145) | Verifier pre-registered on every token, so faucet deposits need no user setup | [Storage](https://docs.near.org/smart-contracts/anatomy/storage) |
| Relayer-paid gas | `otcdesk.testnet` submits `execute_intents`; signing a deal costs the user nothing | [Meta-transactions](https://docs.near.org/chain-abstraction/meta-transactions) |
| OutLayer TEE + yield/resume | Sealed terms, reveal and matching run in Intel TDX; called on chain | [OutLayer](https://outlayer.fastnear.com) |
| NEP-141 tokens & wNEAR | `tUSDC`, `tETH` (upstream FT wasm), `wrap.testnet` | [FT](https://docs.near.org/primitives/ft) |
| Testnet helper (faucet) API | Created the project's top-level testnet accounts | [Faucet](https://docs.near.org/tools/faucet) |
| Reference prices | New deal autofills the receive amount at CoinGecko market (tUSDC→USDC, wNEAR→NEAR, tETH→ETH) and shows % vs market on deals and counters; reference only | [CoinGecko API](https://docs.coingecko.com/reference/simple-price) |
| NearBlocks | Every seal, settlement and cancel links to testnet.nearblocks.io | [NearBlocks](https://testnet.nearblocks.io) |

Considered and skipped: chain signatures (no cross-chain leg needed on testnet), passkeys / WebAuthn intents (Privy is the only sign-in by design), wallet selector (same reason), 1Click / confidential relay (mainnet only), partial fills (see limits).

## Deployed ids (testnet)

| Piece | Account | Explorer |
| --- | --- | --- |
| Intents verifier | `otcdesk-intents.testnet` | https://testnet.nearblocks.io/address/otcdesk-intents.testnet |
| Relayer / keeper / faucet | `otcdesk.testnet` | https://testnet.nearblocks.io/address/otcdesk.testnet |
| tUSDC (6 dp) | `otcdesk-usdc.testnet` | https://testnet.nearblocks.io/address/otcdesk-usdc.testnet |
| tETH (18 dp) | `otcdesk-eth.testnet` | https://testnet.nearblocks.io/address/otcdesk-eth.testnet |
| wNEAR | `wrap.testnet` | https://testnet.nearblocks.io/address/wrap.testnet |
| OutLayer project | `otcdesk-enclave.testnet/private-otc` | wasm sha256 `622cb3c8…d196` (`deployments/private-otc.json`) |

Deployment transaction hashes: `deployments/private-otc.json`.

## Repo map

```
enclave/   OutLayer WASI worker: pubkey / check / reveal / settle, Privy check from inside the TEE
keeper/    Node server: deal read model, enclave relay, relayer (simulate + execute_intents), faucet, account funding, RPC proxy, serves web/dist
shared/    otc.mjs: tokens, ECIES sealing, NEP-413 hashing/signing, unit helpers (browser + node)
web/       Vite + React app (Privy sign-in): board, deal page, new deal, my deals, wallet (balances, faucet, activity), how it works
contracts/ pointers to the upstream wasm we deployed
scripts/   deploy-near.mjs (verifier + tokens)
```

## Run locally

```sh
npm ci && (cd web && npm ci)
cp .env.example my.env   # fill in, never commit
set -a; . ./my.env; set +a
npm --prefix web run build && node keeper/index.mjs   # http://127.0.0.1:8790
```

Enclave rebuild: `PRIVY_APP_ID=... APP_ORIGIN=https://your-app cargo build --release --target wasm32-wasip2` in `enclave/`, then `outlayer upload` + `outlayer deploy private-otc <url>`.

## Limits

- **No partial fills.** One signed listing fills once at the exact size. Makers can post several smaller deals as tranches. (A token_diff is all-or-nothing; partial fills would need the maker to pre-sign every possible fraction.)
- Testnet only, our own verifier copy (not `intents.near`). One keeper, one enclave deployment.
- The enclave trusts Privy's answer about which NEAR wallet belongs to a sign-in.
- The keeper must stay online to relay; if OutLayer is down, reveal and settle wait.
- The maker must keep enough balance in the verifier (the New deal form warns and links to the faucet); `simulate_intents` refuses an accept that would fail.
- The Wallet shows balances, faucet and activity only. There is no deposit/withdraw UI: testnet tokens come from the faucet straight into the verifier.

## License

MIT

## Deal flow rules

- The board and deal pages require a Privy sign-in. Cards show pair, status, expiry and counter-offer count only.
- Any signed-in user can ask the enclave to reveal a deal's opening terms. Each reveal is logged per deal (account + time) and the maker sees that list on the deal page.
- Many counterparties can counter the same deal in parallel; each sees only their own thread, the maker sees all and accepts one.
- First settlement wins: the keeper serialises settlement per deal, and the verifier burns the NEP-413 nonces on execute, so every other accept fails with a clear "already settled" message and no funds move.
