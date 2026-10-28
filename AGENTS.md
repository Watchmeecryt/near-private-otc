# AGENTS.md — NEAR Private OTC

**Live app (NEAR testnet): https://near-private-otc-productio999n.up.railway.app** (machine-readable: https://near-private-otc-productio999n.up.railway.app/llms.txt)

## Problem
OTC traders can't find a counterparty without already knowing them, and posting a size/price publicly leaks information.

## Solution
An open deal board (no sign-in needed) that shows only pair, side, expiry, status, request and counter-offer counts. Exact terms are sealed to an OutLayer TEE enclave. A taker requests access; the enclave authenticates them and the keeper checks a fixed $50 (CoinGecko) holding of the token the maker wants, wallet + verifier, as a spam filter independent of deal size; the maker approves (NEP-413 signed, or auto-approve "*"); only then does the enclave reveal the terms. Counters and accepts only from approved requesters. Sign-in: Privy (Google) or NEAR Wallet Selector (Meteor, HOT, Intear, HERE, MyNearWallet; Ledger connect-only) with a NEP-413 login. Matching NEP-413 signed `token_diff` intents are settled atomically with `execute_intents` on a NEAR Intents verifier.

## Hackathon tracks
Built at NEAR HACKATHON 2026.
- `defi`: OTC desk that settles atomically inside the NEAR Intents verifier with no custodian in our code (verifier, token_diff, execute_intents, simulate_intents, ft_withdraw, nonces, deadlines); cross-chain legs via 1Click (Tidepool's endpoint on testnet, https://www.usetidepool.tech). On testnet the verifier is Tidepool's sandbox.
- `privacy`: private finance with sealed deal terms: size, price and counter-offers are sealed to an OutLayer TDX enclave and shown only to the parties involved. Not a private ledger: deposits, withdrawals and settled trades are public on chain.

## Features (implemented)
1. Public deal board with coarse info only (no size range); open to everyone without sign-in. Deals can be public (listed) or private (link only, 16-char unguessable id); private→public only. Expiry chips 2 min (demo), 1h, 24h, 7d; the deadline is inside the signed intent and enforced by the verifier. Enclave check output has no size or price info.
2. Maker posts: signed token_diff + terms sealed to the enclave.
3. Request terms: $50 holding check of the wanted token, maker approval (or auto-approve), enclave verifies the sign-in owns the NEAR account and re-seals terms to a one-time browser key.
4. Accept / Counter / Decline with step indicator; counters are new signed sealed intents.
5. Atomic settlement: enclave checks exact mirror match → simulate_intents → execute_intents.
6. Expiry via deadline; cancel via nonce burn (empty intents re-using offer nonces).
7. My deals with statuses Open, Requested, Countered, Settled, Expired, Cancelled; short links `/d/<id>`.
8. Wallet: intents balances with an explainer line, faucet (Tidepool: all six test tokens straight into the verifier, one claim/account/hour), Deposit from your wallet (NEAR-wallet and Privy sign-ins; Privy signs `ft_transfer_call` with its embedded key and shows the on-account token balance), Withdraw for everyone (Privy and wallet users: token + amount + Max, signed `ft_withdraw` intent to your own account relayed via `/api/withdraw`; registers token storage with `storage_deposit` first if needed; wNEAR arrives as wNEAR), activity.
   Testnet trust note: the verifier `verifier.tidepool-sandbox.testnet` is Tidepool's unmodified NEAR Intents defuse v0.4.2 sandbox, operated by Tidepool. So on testnet Tidepool's operator could in theory upgrade the contract or move balances held in it. On mainnet, settlement would use the official `intents.near`. Deposits and withdrawals are public on chain, and settled trades are visible on chain; open deal terms stay sealed.
9. New deal warns when the sold token's balance is too low and links to the faucet.
10. Keeper funds new Privy implicit accounts with 0.2 test NEAR (up to 3 top-ups per sign-in while the account doesn't exist).
11. "What you're signing" panel before every signature; privacy note on deal pages; How it works page.

## Deployed ids (testnet)
| Piece | Id |
| --- | --- |
| Verifier | verifier.tidepool-sandbox.testnet |
| Relayer/keeper | otcdesk.testnet |
| Tokens (Tidepool) | usdc, usdt, wnear, eth, wbtc, xaut `.tidepool-sandbox.testnet`, plus bridged nep141:<base|arb|eth>-0x<erc20>.tp-omft.testnet (USDC.base, USDT.base, USDC.arb, USDT.arb, USDC.eth, USDT.eth: Tidepool's bridged testnet stablecoins) |
| Cross-chain | Cross-chain deals, settled by NEAR Intents: fund a deal from an EVM testnet (Base, Arbitrum or Ethereum Sepolia USDC/USDT) and receive on any supported chain or keep it on NEAR. Cross-chain legs go through the 1Click API: on testnet the app uses Tidepool (https://www.usetidepool.tech), the community-built 1Click-compatible API and bridge; on mainnet it uses NEAR's official 1Click. The deal itself always settles atomically inside the NEAR Intents verifier, so the privacy model is unchanged. Keeper routes: POST /api/bridge/quote {account, direction in|out, chain base|arb|eth, base USDC|USDT, asset, amount, evm}, POST /api/bridge/send {account, signed transfer intent, depositAddress}, POST /api/bridge/submit {txHash, depositAddress}, GET /api/bridge/status?depositAddress=. Agents: `XOUT="arb USDC 0x…" node scripts/agents/run.mjs`. |
| OutLayer project | otcdesk-enclave.testnet/private-otc |
| Enclave wasm sha256 | 5f2ba3f1fc6b3ab386fef21dbc3b32466843499833f27c3d4c6682eae403e5da (Tidepool verifier + six Tidepool tokens + six bridged USDC/USDT; previous a1ad0d61d5981b0e5a6f3afd805746e22f4ae0805aa14087360448575615d760, Privy app cmvi99u1e01os0il20daip5mv; served from /enclave/<hash>.wasm on the app) |
| Enclave pubkey | 03312dd677a5864ffc8cff352b7419b90896c9aee20e4f79308c1106517a4947e8 |
| App | `https://near-private-otc-productio999n.up.railway.app` or `http://127.0.0.1:8790` locally (`/api/health`) |

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
Everything below is plain HTTP against the app (`U=https://near-private-otc-productio999n.up.railway.app`, or `http://127.0.0.1:8790` for a local run) plus the helpers in `shared/otc.mjs` (`signIntent`, `intentPayload`, `tokenDiff`, `seal`, `tokenById`, `toUnits`, `b64`, `ENCLAVE_PUBKEY`).

1. **Make a testnet key.** Generate an ed25519 keypair. Your account is the NEAR implicit account = the 32-byte public key as hex. See: an account id like `3f9a…` (64 hex chars).
2. **Sign in.** Sign a NEP-413 message with `signIntent({ message: JSON.stringify({ otc_login: <account>, ts: Date.now() }), nonce: <32 random bytes>, recipient: "near-private-otc" }, <pubkey base58>, sign)`, then
   `POST /api/auth/wallet` with body `{ "signed": <that signed object> }`. See: `{ "token": "…" }`. Send it as `Authorization: Bearer <token>` on every call below (session lasts 24 h).
3. **Get test funds.** `POST /api/faucet` with body `{ "account": <account> }` (relayed to Tidepool's faucet, https://www.usetidepool.tech). See: the claim result; 100 USDC, 100 USDT, 40 wNEAR, 0.03 ETH, 0.001 wBTC and 0.03 XAUT land straight in your verifier balance. Limit one claim per account per hour (429 after that).
4. **Build the intent.** For selling e.g. 50 USDC for 20 wNEAR: `terms = { sell_token, sell_amount: toUnits("150", dec), buy_token, buy_amount: toUnits("60", dec) }` (ids and decimals from `tokenById`), then
   `intent = await signIntent(intentPayload({ signer: <account>, intents: [tokenDiff(sell_token, sell_amount, buy_token, buy_amount)], deadlineMs: Date.now() + 3600e3, nonce }), <pubkey base58>, sign)`. The deadline is your expiry; the verifier enforces it.
5. **Seal and post.** `offer = { v: 1, deal: <16 chars from 23456789abcdefghjkmnpqrstuvwxyz>, from: <account>, to: "*", terms, note: "", intent }`, then
   `POST /api/deals` with body `{ "offer_ct": seal(ENCLAVE_PUBKEY, offer), "nonce": b64(nonce), "account": <account>, "visibility": "public" }` (or `"private"`). The keeper asks the OutLayer enclave to check it on chain, which can take a while. See: `{ id, pair, side, deadline, status: "Open", check_tx, … }` with no size or price.
6. **Check the board.** `GET /api/deals` (no sign-in). See: your deal listed by `id` with pair, side and expiry only; `GET /api/deals/<id>` for one deal, or open `/d/<id>` in a browser.

Errors come back as JSON with an HTTP status, e.g. 400 if the expiry is already past or the offer isn't signed by you and open to `*`.

### Take a deal as an agent (do X - see Y)
Continue from steps 1-3 with a second key (the taker). It needs at least $50 of the token the maker wants; one faucet claim is enough.

7. **Find a deal.** `GET /api/deals` - see open deals with `id`, `pair`, `side`, `deadline`, `auto_approve`. No size or price.
8. **Request the terms.** `request_ct = seal(ENCLAVE_PUBKEY, { wallet: <your signed login from step 2>, account, deal: <id> })`, then `POST /api/deals/<id>/request` with `{ request_ct, account }`. See: `{ request: { status: "approved" } }` if the maker turned on auto-approve, else `"pending"` until the maker approves (`403` if you hold less than $50 of the wanted token).
9. **Read the sealed terms.** Make a one-time secp256k1 key (`newKeypair()`), `request_ct = seal(ENCLAVE_PUBKEY, { wallet, eph_pub: <its pub>, account, deal })`, `POST /api/deals/<id>/reveal` with `{ request_ct, account }`. See: `offers_ct`; `unseal(<its sk>, offers_ct)` gives the offers you may see, the opening one has `to: "*"` and exact `terms`.
10. **Accept.** Sign the mirror intent (sell what the maker buys, buy what the maker sells, same amounts, deadline = the opening offer's `deadline`), seal `{ v: 1, deal, from: you, to: <maker>, terms, note: "", intent }`, and `POST /api/deals/<id>/offer` with `{ offer_ct, nonce, account, kind: "accept", reply_to: "o1" }`. See: `{ settled: true, tx }`; the enclave checked the exact match and the relayer ran `execute_intents`. A second accept gets `409 Too late`.
11. **Post with auto-approve (maker side).** Add `"auto_approval": <NEP-413 signed {"otc_approve": <deal id>, "requester": "*"}, recipient "near-private-otc">` to the `POST /api/deals` body in step 5. See: `auto_approve: true` on the board.
12. **Cancel (maker side).** For each live offer nonce sign `intentPayload({ signer, intents: [], deadlineMs: now + 10 min, nonce })` and `POST /api/deals/<id>/cancel` with `{ account, signed: [...] }`. See: `{ tx }`; the nonces are burned on the verifier.
13. **Counter (either side).** From the step 9 reveal, the response's `offers` lists the thread (`id`, `kind`, `from`, `to`, `status`, `commitment`); match each to the unsealed offer by `commitment`. To counter a live offer addressed to you or `"*"`, take the mirror of its terms, change the amounts, sign that intent (deadline = the deal's `deadline`), seal `{ v: 1, deal, from: you, to: <its author>, terms, note, intent }` and `POST /api/deals/<id>/offer` with `{ offer_ct, nonce, account, kind: "counter", reply_to: <its id> }`. See: `{ offer: { id: "o2", kind: "counter", to: <its author>, status: "live" } }`; nothing settles, and only the two parties can read it.
14. **Answer a counter.** Reveal again (step 9) and find the live `counter` with `to: you`. Accept it: sign the exact mirror of its terms and send `kind: "accept", reply_to: <counter id>` - see `{ settled: true, tx }`. Counter back: step 13 with `reply_to: <counter id>` - see a new live counter, and the one you answered becomes `superseded`. Decline: `POST /api/deals/<id>/decline` with `{ account, offer_id }` - see its status become `declined`. A maker who cancels must also include the nonces of its own live counters.

### Run the ready-made agents
- **Two agents, one trade:** `U=https://near-private-otc-productio999n.up.railway.app node scripts/agents/run.mjs` - see a maker and a taker agent with fresh implicit accounts sign in, use the faucet, post, discover, request, read the terms and settle; every step prints a NearBlocks link. About 70 s.
- **N agents racing:** `TAKERS=3 U=https://near-private-otc-productio999n.up.railway.app node scripts/agents/run.mjs` - see several takers read the same deal; the first accept settles, the rest get a 409 ("settling right now" or "Too late"). Each extra taker costs 3 more OutLayer enclave calls.
- **Sub-account agents:** `PARENT_ID=<your>.testnet PARENT_KEY=ed25519:<key> U=https://near-private-otc-productio999n.up.railway.app node scripts/agents/run.mjs --subaccounts` - see each agent get its own sub-account `maker-xxxx.<your>.testnet` (0.05 NEAR from the parent), register its key on the verifier with `add_public_key`, then trade. It also adds a function-call key limited to the verifier and shows that this key is refused at sign-in.
- **Negotiation:** `U=https://near-private-otc-productio999n.up.railway.app node scripts/agents/run.mjs --negotiate` - see the taker counter below the listing (`COUNTER`, default 90%), the maker read it and either accept (at or above `FLOOR`, default 95%) or counter back halfway, then the taker accept the maker's counter (at or below `LIMIT`, default 97%, else decline) and settle via `execute_intents`. About 105 s and 11 OutLayer enclave calls.
- Code: `scripts/agents/lib.mjs` (an `Agent` class: `signIn`, `faucet`, `postDeal`, `requestTerms`, `readTerms`, `accept`, `counter`, `acceptOffer`, `decline`, `cancel`) and `scripts/agents/run.mjs`.

### Sub-accounts and limited keys: what works
- **Works:** an agent on a named sub-account with its own full-access key. The parent creates it with a small balance; the agent registers its key on the verifier once (`add_public_key`, 1 yoctoNEAR) because the verifier only knows implicit-account keys by default. The parent can delete the sub-account later.
- **Doesn't work:** function-call (limited) access keys. The app's sign-in and the enclave's own check (`key_belongs` in `enclave/src/nearauth.rs`) accept only full-access keys of named accounts, and the deployed enclave can't change right now. A function-call key also can't attach the 1 yoctoNEAR that `add_public_key` needs.
- So the limit is the sub-account's balance, not the key type: keep only what the agent may lose in its verifier balance.

### Agent safety
- Use a dedicated key, implicit account or sub-account with small funds. Never give an agent your main wallet key.
- The $50 check is a spam filter, not proof that a counterparty can pay.
- Auto-approve reveals your exact terms to anyone who passes that check. Leave it off if you want to choose who sees them.
- Intents settle atomically and only when both sides really hold the funds; otherwise nothing moves. Nothing guarantees a fill or a price.
- A human should set the agent's limits (pairs, max size, price bounds) and review its trades. Testnet only.
