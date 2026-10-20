# AGENTS.md — NEAR Private OTC

## Problem
OTC traders can't find a counterparty without already knowing them, and posting a size/price publicly leaks information.

## Solution
A deal board (signed-in users only) that shows only pair, side, expiry and counter-offer count. Exact terms and every counter-offer are sealed to an OutLayer TEE enclave and revealed only to signed-in parties. Matching NEP-413 signed `token_diff` intents are settled atomically with `execute_intents` on a NEAR Intents verifier.

## Hackathon tracks
- Privacy (TEE sealing, private negotiation).
- NEAR Intents (verifier, token_diff, execute_intents, simulate_intents, ft_withdraw, nonces, deadlines).
- Real-world money (email/Google sign-in, no wallet, relayer-paid gas).

## Features (implemented)
1. Public deal board with coarse info only (no size range); requires a Privy sign-in.
2. Maker posts: signed token_diff + terms sealed to the enclave.
3. Request terms: enclave verifies Privy sign-in owns the NEAR account, re-seals terms to a one-time browser key.
4. Accept / Counter / Decline with step indicator; counters are new signed sealed intents.
5. Atomic settlement: enclave checks exact mirror match → simulate_intents → execute_intents.
6. Expiry via deadline; cancel via nonce burn (empty intents re-using offer nonces).
7. My deals with statuses Open, Requested, Countered, Settled, Expired, Cancelled; short links `/d/<id>`.
8. Wallet: intents balances, faucet (tUSDC, wNEAR, tETH straight into the verifier, 3 claims/token/day), activity. No deposit/withdraw UI (the API keeps an advanced ft_withdraw relay).
11. New deal warns when the sold token's balance is too low and links to the faucet.
9. Keeper funds new Privy implicit accounts with 0.2 test NEAR (up to 3 top-ups per sign-in while the account doesn't exist).
10. "What you're signing" panel before every signature; privacy note on deal pages; How it works page.

## Deployed ids (testnet)
| Piece | Id |
| --- | --- |
| Verifier | otcdesk-intents.testnet |
| Relayer/keeper | otcdesk.testnet |
| tUSDC | otcdesk-usdc.testnet |
| tETH | otcdesk-eth.testnet |
| wNEAR | wrap.testnet |
| OutLayer project | otcdesk-enclave.testnet/private-otc |
| Enclave wasm sha256 | 622cb3c80df5e01f04431fa853539457844efa6e17b9957cfd67599829f1d196 |
| Enclave pubkey | 03312dd677a5864ffc8cff352b7419b90896c9aee20e4f79308c1106517a4947e8 |
| Live app | https://near-private-otc-production.up.railway.app (`/api/health`) |

## Claim → code
| Claim | Where |
| --- | --- |
| Terms sealed in the browser | `shared/otc.mjs` `seal`; `web/src/lib/deal.ts` `signedOffer` |
| NEP-413 hashing/signing | `shared/otc.mjs` `nep413Hash`, `signIntent` |
| Enclave publishes only coarse facts | `enclave/src/main.rs` `check`, `coarse` |
| Only parties see terms | `enclave/src/main.rs` `reveal`; `enclave/src/jwt.rs` `near_wallets` |
| Exact-match settlement | `enclave/src/main.rs` `settle`; `keeper/index.mjs` `execute` |
| Cancel burns nonces | `web/src/lib/deal.ts` `cancelPayloads`; `keeper/index.mjs` `/cancel` |
| Enclave called on chain | `keeper/enclave.mjs` |

## API
`GET /api/health`, `GET /api/prices` (CoinGecko reference, 30 s cache), `GET /api/deals`, `GET /api/deals/:id`, `GET /api/my?account=` (Privy bearer), `POST /api/deals`, `POST /api/deals/:id/{reveal,offer,decline,cancel}`, `POST /api/withdraw`, `POST /api/faucet`, `POST /api/fund`, `POST /api/rpc`.
