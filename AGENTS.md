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
8. Wallet: intents balances with an explainer line, faucet (tUSDC, wNEAR, tETH straight into the verifier, 3 claims/token/day), Deposit from your wallet (NEAR-wallet sign-ins only), Withdraw for everyone (Privy and wallet users: token + amount + Max, signed `ft_withdraw` intent to your own account relayed via `/api/withdraw`; registers token storage with `storage_deposit` first if needed; wNEAR arrives as wNEAR), activity.
   Testnet trust note: the verifier `otcdesk-intents.testnet` is our own unmodified copy of NEAR Intents defuse v0.4.2, and its super-admin is `otcdesk.testnet` (the operator). So on testnet the operator could in theory upgrade the contract or move balances held in it. On mainnet, settlement would use the official `intents.near`. Deposits and withdrawals are public on chain, and settled trades are visible on chain; open deal terms stay sealed.
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
| Enclave wasm sha256 | b0ccc5be19b8c037079cdf962586ac22f334f2743e797d89ddb252ad258aa377 |
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

## Try it as an agent
Everything below is plain HTTP against the live app (`U=https://near-private-otc-productio999n.up.railway.app`) plus the helpers in `shared/otc.mjs` (`signIntent`, `intentPayload`, `tokenDiff`, `seal`, `tokenById`, `toUnits`, `b64`, `ENCLAVE_PUBKEY`).

1. **Make a testnet key.** Generate an ed25519 keypair. Your account is the NEAR implicit account = the 32-byte public key as hex. See: an account id like `3f9a…` (64 hex chars).
2. **Sign in.** Sign a NEP-413 message with `signIntent({ message: JSON.stringify({ otc_login: <account>, ts: Date.now() }), nonce: <32 random bytes>, recipient: "near-private-otc" }, <pubkey base58>, sign)`, then
   `POST /api/auth/wallet` with body `{ "signed": <that signed object> }`. See: `{ "token": "…" }`. Send it as `Authorization: Bearer <token>` on every call below (session lasts 24 h).
3. **Get test funds.** `POST /api/faucet` with body `{ "account": <account>, "token": "tUSDC" }` (also `"tETH"`, `"wNEAR"`). See: the claim result; 1000 tUSDC, 0.5 tETH or 50 wNEAR land straight in your verifier balance. Limit 3 claims per token per day (429 after that).
4. **Build the intent.** For selling e.g. 150 tUSDC for 60 wNEAR: `terms = { sell_token, sell_amount: toUnits("150", dec), buy_token, buy_amount: toUnits("60", dec) }` (ids and decimals from `tokenById`), then
   `intent = await signIntent(intentPayload({ signer: <account>, intents: [tokenDiff(sell_token, sell_amount, buy_token, buy_amount)], deadlineMs: Date.now() + 3600e3, nonce }), <pubkey base58>, sign)`. The deadline is your expiry; the verifier enforces it.
5. **Seal and post.** `offer = { v: 1, deal: <16 chars from 23456789abcdefghjkmnpqrstuvwxyz>, from: <account>, to: "*", terms, note: "", intent }`, then
   `POST /api/deals` with body `{ "offer_ct": seal(ENCLAVE_PUBKEY, offer), "nonce": b64(nonce), "account": <account>, "visibility": "public" }` (or `"private"`). The keeper asks the OutLayer enclave to check it on chain, which can take a while. See: `{ id, pair, side, deadline, status: "Open", check_tx, … }` with no size or price.
6. **Check the board.** `GET /api/deals` (no sign-in). See: your deal listed by `id` with pair, side and expiry only; `GET /api/deals/<id>` for one deal, or open `/d/<id>` in a browser.

Errors come back as JSON with an HTTP status, e.g. 400 if the expiry is already past or the offer isn't signed by you and open to `*`.
