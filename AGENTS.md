# AGENTS.md — NEAR Private OTC

## Problem
OTC traders can't find a counterparty without already knowing them, and posting a size/price publicly leaks information.

## Solution
An open deal board (no sign-in needed) that shows only pair, side, expiry, status, request and counter-offer counts. Exact terms are sealed to an OutLayer TEE enclave. A taker requests access; the enclave authenticates them and the keeper checks a fixed $200 (CoinGecko) holding of the token the maker wants, wallet + verifier, as a spam filter independent of deal size; the maker approves (NEP-413 signed, or auto-approve "*"); only then does the enclave reveal the terms. Counters and accepts only from approved requesters. Sign-in: Privy (email/Google) or NEAR Wallet Selector (Meteor, HOT, Intear, HERE, MyNearWallet; Ledger connect-only) with a NEP-413 login. Matching NEP-413 signed `token_diff` intents are settled atomically with `execute_intents` on a NEAR Intents verifier.

## Hackathon tracks
Built at NEAR HACKATHON 2026.
- `defi`: NEAR Intents settlement (verifier, token_diff, execute_intents, simulate_intents, ft_withdraw, nonces, deadlines).
- Privacy is a supporting feature, not a track: terms sealed in OutLayer TDX, private negotiation.

## Features (implemented)
1. Public deal board with coarse info only (no size range); open to everyone without sign-in. Deals can be public (listed) or private (link only, 16-char unguessable id); private→public only. Expiry chips 2 min (demo), 1h, 24h, 7d; the deadline is inside the signed intent and enforced by the verifier. Enclave check output has no size or price info.
2. Maker posts: signed token_diff + terms sealed to the enclave.
3. Request terms: $200 holding check of the wanted token, maker approval (or auto-approve), enclave verifies the sign-in owns the NEAR account and re-seals terms to a one-time browser key.
4. Accept / Counter / Decline with step indicator; counters are new signed sealed intents.
5. Atomic settlement: enclave checks exact mirror match → simulate_intents → execute_intents.
6. Expiry via deadline; cancel via nonce burn (empty intents re-using offer nonces).
7. My deals with statuses Open, Requested, Countered, Settled, Expired, Cancelled; short links `/d/<id>`.
8. Wallet: intents balances, faucet (tUSDC, wNEAR, tETH straight into the verifier, 3 claims/token/day), activity. No deposit/withdraw UI (the API keeps an advanced ft_withdraw relay).
9. New deal warns when the sold token's balance is too low and links to the faucet.
10. Keeper funds new Privy implicit accounts with 0.2 test NEAR (up to 3 top-ups per sign-in while the account doesn't exist).
11. "What you're signing" panel before every signature; privacy note on deal pages; How it works page.

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
| Live app | https://near-private-otc-productio999n.up.railway.app (`/api/health`) |

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
