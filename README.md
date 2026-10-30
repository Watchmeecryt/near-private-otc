# NEAR Private OTC

**A private OTC deal board on NEAR.** Post a deal with a sealed size and price, let strangers find it, negotiate privately, and settle both sides in one atomic NEAR Intents call.

**Live app (NEAR testnet): https://near-private-otc-productio999n.up.railway.app** - test tokens only, no real value. Agents: [https://near-private-otc-productio999n.up.railway.app/llms.txt](https://near-private-otc-productio999n.up.railway.app/llms.txt) and [AGENTS.md](AGENTS.md). Or [run it locally](#run-locally) at `http://127.0.0.1:8790`.

Built by [@log0dev](https://x.com/log0dev) on X.

- **Problem:** OTC traders can't find a counterparty unless they already know one, and posting size and price publicly leaks information.

## Why this exists

> "Private OTC market using 'private deals' from NEAR Intents. Currently there is no way to find counter party unless you already know you are transacting with. Create a more open way to communicate what are deals open and allow people to fill them via NEAR Intents."
>
> — Illia Polosukhin ([@ilblackdragon](https://x.com/ilblackdragon)), NEAR co-founder, in his [list of ideas for NEAR builders](https://x.com/ilblackdragon/status/2106269343881519444) (Oct 2026)

This app is that market: an open board for finding counterparties, sealed terms, and fills settled with NEAR Intents.

## Try it in 2 minutes (do X - see Y)

1. **Open [https://near-private-otc-productio999n.up.railway.app/app](https://near-private-otc-productio999n.up.railway.app/app), no sign-in** - see the open deals: pair, side, expiry, status and counts. No size or price.
2. **Sign in with Google, then Wallet -> Faucet** - see Tidepool test USDC, USDT, wNEAR, ETH, wBTC and XAUT in your balance and 0.25 test NEAR for gas on your new account.
3. **Open a deal -> Request terms -> Accept (or New deal to post your own)** - see the sealed terms open for you, then the deal turn Settled with a NearBlocks `execute_intents` tx.

**Agents, one command:** `U=https://near-private-otc-productio999n.up.railway.app node scripts/agents/run.mjs --negotiate` (Node 20+, after `npm ci`; no keys needed, it makes fresh testnet accounts) - see a maker and a taker agent post, counter, counter back and settle, with a NearBlocks link per step. More in [AGENTS.md](AGENTS.md).

## Hackathon tracks: `defi`, `privacy`

Built at NEAR HACKATHON 2026. Tracks:

- `defi` (Unstoppable DeFi: "exchanges ... that settle across chains through NEAR Intents ... no custodian"): this is an OTC desk where both sides sign `token_diff` intents and the NEAR Intents verifier settles them atomically in one `execute_intents` call (after a `simulate_intents` dry run), so the app never takes custody of the two legs. Cross-chain legs (bridged USDC/USDT) go through the 1Click API; on testnet that API is Tidepool's, at https://www.usetidepool.tech. Limit: on testnet the verifier is Tidepool's unmodified sandbox, operated by Tidepool, so "no custodian" holds for our keeper and enclave, not for Tidepool's operator (see Limits).
- `privacy` (Privacy & Private AI: "private finance"): deal size, price, notes and counter-offers are sealed to an OutLayer enclave (Intel TDX) and revealed only to the parties involved, so the public board shows only pair, side, expiry, status and counts. Limit: this is sealed deal terms, not a private ledger. Deposits, withdrawals and settled trades are public on chain, and you trust OutLayer's TEE and Privy's answer about which wallet belongs to a sign-in.

AI agents can also trade here (see [AGENTS.md](AGENTS.md)); that is a feature, not a submitted track.

## Libraries and baseline

**Baseline.** There is no pre-hackathon baseline in this repository. All code was written from 2026-10-20 onward (first commit 2026-10-20 UTC), inside the window that began on 2026-10-19 (Q-001). AI coding tools were used to write and edit code and docs. The only code we did not write is the upstream wasm in `contracts/` (below) and the third-party libraries and services listed here.

**Dependencies** (from `package.json`, `web/package.json` and `enclave/Cargo.toml`):

- Keeper / shared (Node 20+): `eciesjs`, `jose`, `near-api-js` (v5).
- Web app: `react`, `react-dom`, `react-router-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, `near-api-js` (v7), `eciesjs`, `@privy-io/react-auth`, `@near-wallet-selector/*` (core, modal-ui, meteor-wallet, hot-wallet, intear-wallet, here-wallet, my-near-wallet, ledger), `@solana/kit`, `@solana-program/system`, `@solana-program/token`, `@phosphor-icons/react`, `@dicebear/core`, `@dicebear/collection`, `@unlocalhosted/metalui`, `buffer`. Fonts Geist and OpenRunde (SIL OFL, files in `web/public/fonts`).
- Enclave (Rust, `wasm32-wasip2`): `serde`, `serde_json`, `sha2`, `hkdf`, `hex`, `base64`, `p256`, `ecies`, `libsecp256k1`, `ed25519-dalek`, `bs58`, `wasi-http-client`.

**External pieces:**

- NEAR Intents verifier: the upstream `near/intents` release `defuse/v0.4.2` wasm, unmodified (`contracts/`, sha256 in `contracts/README.md`). On testnet it runs at `verifier.tidepool-sandbox.testnet`, deployed and operated by Tidepool. On mainnet this would be `intents.near`.
- Tidepool (https://www.usetidepool.tech): sandbox verifier, test tokens, faucet, and the testnet 1Click API with bridged USDC/USDT.
- OutLayer (TEE on Intel TDX): runs our enclave worker (`otcdesk-enclave.testnet/private-otc`).
- Privy: Google sign-in and NEAR implicit accounts; NEAR Wallet Selector wallets as the other sign-in.
- CoinGecko (price for the $50 holding check), NearBlocks (explorer links), public NEAR RPC (FastNEAR, Pagoda, Lava), Railway (hosting).

## Disclosure (Q-015)

The same builder is submitting two independent projects to NEAR HACKATHON: this one (NEAR Private OTC, a private OTC deal board) and **Morrowseal** (a private inheritance vault with a dead-man timer): https://morrowseal-production.up.railway.app. They are different products with different problems, users, contracts, enclaves and deployments. They were built with the same general stack (OutLayer, Privy sign-in, ECIES sealing), which is why some helper code looks alike. This is not the same project submitted twice.

Tidepool (https://www.usetidepool.tech) is a free, public testnet tool for NEAR Intents builders, made by the same builder. It is not part of this submission. NEAR Private OTC uses it as testnet infrastructure.

## Demo post

Demo post on X: added on 2026-11-01

## How it works: one trade, six steps

1. **Post.** The maker picks pair, side, size and price. The browser builds a `token_diff` intent (−what I give, +what I get), the maker signs it (NEP-413, no gas), and the whole offer `{terms, note, signed intent}` is sealed (ECIES secp256k1 + AES-256-GCM) to the enclave's public key. The keeper relays the sealed blob to the enclave (`check`), which verifies the signed intent matches the sealed terms and publishes **only** pair, side and the deadline (the keeper drops the enclave's coarse size band and never serves it).
2. **Request.** A signed-in taker taps *Request terms*. The keeper checks they hold at least $50 (CoinGecko) of the token the maker wants (a fixed spam filter), and the maker approves the request (NEP-413 signed, or auto-approve). Their browser seals `{Privy access token, one-time public key, NEAR account, deal}` to the enclave. The enclave verifies the Privy token (ES256 against Privy JWKS), asks Privy from inside the TEE which NEAR wallets belong to that user, and re-seals the exact terms to the one-time browser key.
3. **Negotiate.** *Accept*, *Counter* or *Decline*. Each counter is a new signed intent sealed to the enclave, readable only by the two parties named inside it.
4. **Settle.** On *Accept*, the enclave (`settle`) checks the two signed intents are exact mirror images (same deal, opposite legs, equal amounts, different signers, addressed to each other) and releases them. The relayer dry-runs `simulate_intents` and calls `execute_intents` on our verifier. Both transfers happen in one transaction or not at all.
5. **Deposit / withdraw.** The faucet (everyone) and *Deposit from your wallet* (all sign-ins; Privy users deposit from their Privy NEAR account) move tokens into the verifier with `ft_transfer_call`; the Token dropdown lists your on-chain wallet balance (`ft_balance_of`) next to each token, with a *Wallet balance* line and Max under the amount, and Deposit is disabled ("Insufficient wallet balance") when the amount is above it. *Withdraw* (everyone; its Token dropdown shows your verifier balance per token) signs an `ft_withdraw` intent to your own account; the keeper relays it with `execute_intents`. Both are public on chain.
6. **Expire / cancel.** Every intent carries a `deadline`. To cancel, the maker signs empty intents that re-use each live offer nonce; executing them marks those nonces used, so the old signatures can never settle.

## Full tour (do X - see Y)

All steps run against the live app (https://near-private-otc-productio999n.up.railway.app) or a local run against NEAR testnet. Use two browsers (or a normal and a private window) for the maker and the taker.

1. **Open `https://near-private-otc-productio999n.up.railway.app/app` without signing in** - see the public deal board: pair, side, expiry, status, request and counter-offer counts only. No size or price.
2. **Sign in with Google (Privy) or a NEAR wallet (Meteor, HOT, Intear, HERE, MyNearWallet)** - see your NEAR account in the header; a new Privy implicit account is funded with 0.25 test NEAR.
3. **Wallet -> Faucet -> Claim all six** - see the balance credited straight into your verifier balance on `verifier.tidepool-sandbox.testnet`, with the transaction in Activity. Balances shown are held in the NEAR Intents verifier: deposit to trade, withdraw to move them back to your wallet.
4. **New deal -> pick pair, side, size, price -> choose Public or Private -> pick an expiry chip (2 min (demo), 1h, 24h, 7d) -> sign** - see the deal on the board (Public) or get a link-only `/d/<id>` URL (Private), with a NearBlocks link to the OutLayer `check` transaction. The board still shows no amounts.
5. **As the taker, open the deal -> Request terms** - the keeper checks you hold at least $50 (CoinGecko) of the token the maker wants (wallet + verifier); without it you see "You need at least $50 in <token> to request deals."
6. **As the maker, approve the request (or turn on auto-approve)** - the taker sees the sealed terms open: exact size, price and note, decrypted in their browser.
7. **Counter, Decline or Accept in the deal thread** - each counter is a new signed intent sealed to the enclave; only the two parties see it.
8. **Accept a live offer** - the enclave checks the two intents are exact mirror images, the relayer runs `simulate_intents` then `execute_intents`; see the deal turn Settled with a NearBlocks link, and both Wallet balances change.
9. **Wallet -> Withdraw -> pick a token (each shows your verifier balance), tap Max or type an amount -> Sign & withdraw** (any sign-in) - see a success toast with the NearBlocks tx, the verifier balance drop and the tokens arrive in your own NEAR account. The first withdrawal of a token registers storage (`storage_deposit`, 0.00125 NEAR) on your account.
10. **Cancel an open deal (My deals)** - see the cancel transaction: empty intents re-use the offer nonces, so the old signatures can never settle.
11. **`curl https://near-private-otc-productio999n.up.railway.app/api/deals`** - see JSON with pair, side, deadline, status, counts and tx hashes, and no amounts or prices.
12. **`U=https://near-private-otc-productio999n.up.railway.app node scripts/agents/run.mjs`** - see two agents with fresh keys sign in, use the faucet, post a sealed deal with auto-approve, discover it, read the terms and settle via `execute_intents`, with a NearBlocks link per step (about 70 s). `TAKERS=3` races three takers; `--subaccounts` (with `PARENT_ID`/`PARENT_KEY`) runs each agent from its own sub-account. Details and safety notes: "Try it as an agent" in [AGENTS.md](AGENTS.md).
13. **`U=https://near-private-otc-productio999n.up.railway.app node scripts/agents/run.mjs --negotiate`** - see the taker agent counter at 18 USDC, the maker counter back at 19, and the taker accept and settle at 19 via `execute_intents`; the counters are sealed, so the board never shows a price (about 105 s). Steps: "Take a deal as an agent", 13-14, in [AGENTS.md](AGENTS.md).

## NEAR features used

| Feature | What it does here | Docs |
| --- | --- | --- |
| NEAR Intents verifier (Tidepool) | Tidepool's upstream `near/intents` verifier (defuse v0.4.2 release wasm) at `verifier.tidepool-sandbox.testnet`, because NEAR Intents has no public testnet | [Verifier](https://docs.near-intents.org/integration/verifier-contract/introduction) |
| `token_diff` + `execute_intents` | Each side signs a token diff; both are executed together and must net to zero, so settlement is atomic | [Intent types](https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution) |
| `simulate_intents` | Relayer dry-runs every batch before paying gas | [Simulating](https://docs.near-intents.org/integration/verifier-contract/simulating-intents) |
| NEP-413 signing | Intents are NEP-413 payloads (recipient = our verifier) signed with the Privy-held ed25519 key via raw-hash signing | [NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md), [Signing intents](https://docs.near-intents.org/integration/verifier-contract/signing-intents) |
| Implicit accounts | 64-hex accounts; the verifier trusts the implicit key without `add_public_key` | [Account abstraction](https://docs.near-intents.org/integration/verifier-contract/account-abstraction) |
| Deadlines & nonces | Expiry via `deadline`; cancel by burning nonces with empty intents (v0.4.2 has no separate invalidate call) | [Signing intents](https://docs.near-intents.org/integration/verifier-contract/signing-intents) |
| `ft_transfer_call` deposits | The faucet credits test tokens straight into the user's verifier balance with `msg = account` ; NEAR-wallet users deposit from their wallet. Everyone withdraws with a signed `ft_withdraw` intent (Wallet -> Withdraw), relayed by the keeper | [Deposits](https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/deposits), [Withdrawals](https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/withdrawals) |
| Storage deposits (NEP-145) | Verifier pre-registered on every token, so deposits need no user setup; the first withdrawal of a token calls `storage_deposit` on the user's account | [Storage](https://docs.near.org/smart-contracts/anatomy/storage) |
| Relayer-paid gas | `otcdesk.testnet` submits `execute_intents`; signing a deal costs the user nothing | [Meta-transactions](https://docs.near.org/chain-abstraction/meta-transactions) |
| OutLayer TEE + yield/resume | Sealed terms, reveal and matching run in Intel TDX; called on chain | [OutLayer](https://outlayer.fastnear.com) |
| NEP-141 test tokens (Tidepool) | USDC, USDT, wNEAR, ETH, wBTC, XAUT on `tidepool-sandbox.testnet` | [FT](https://docs.near.org/primitives/ft) |
| Testnet helper (faucet) API | Created the project's top-level testnet accounts | [Faucet](https://docs.near.org/tools/faucet) |
| Reference prices | New deal autofills the receive amount at CoinGecko market (USDC, USDT, wNEAR→NEAR, ETH, wBTC→BTC, XAUT→Tether Gold) and shows % vs market on deals and counters; reference only | [CoinGecko API](https://docs.coingecko.com/reference/simple-price) |
| NearBlocks | Every seal, settlement and cancel links to testnet.nearblocks.io | [NearBlocks](https://testnet.nearblocks.io) |

| Cross-chain via 1Click (Tidepool on testnet) | Cross-chain deals, settled by NEAR Intents: fund a deal from an EVM testnet (Base, Arbitrum or Ethereum Sepolia USDC/USDT) and receive on any supported chain or keep it on NEAR. Cross-chain legs go through the 1Click API: on testnet the app uses Tidepool (https://www.usetidepool.tech), the community-built 1Click-compatible API and bridge; on mainnet it uses NEAR's official 1Click. The deal itself always settles atomically inside the NEAR Intents verifier, so the privacy model is unchanged. Bridged tokens: nep141:<base|arb|eth>-0x<erc20>.tp-omft.testnet (USDC.base, USDT.base, USDC.arb, USDT.arb, USDC.eth, USDT.eth: Tidepool's bridged testnet stablecoins). API: `/api/bridge/quote`, `/api/bridge/send`, `/api/bridge/submit`, `/api/bridge/status`. | [1Click](https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api), [Tidepool](https://www.usetidepool.tech) |

Considered and skipped: passkeys / WebAuthn intents, confidential relay (mainnet only), partial fills (see limits).

## Privacy model (honest version)

| Stays private | Who can read it |
| --- | --- |
| Exact size, price, notes | Enclave; the maker; takers who request |
| Counter-offers | Enclave; the two parties |
| Unfilled / cancelled deals' terms | Enclave and the parties, forever |
| Signed intents before settlement | Enclave only (sealed) |

| Public | Where |
| --- | --- |
| Pair, side, expiry, status, request and counter-offer counts | Deal board (`/api/deals`, open to everyone; private deals are not listed) |
| Settled transfers (both signed intents, amounts, accounts) | NEAR testnet, via `execute_intents` |
| Deposits and withdrawals (account, token, amount) | NEAR testnet (`ft_transfer_call`, `ft_withdraw`) |
| That an OutLayer job ran (sealed input/output) | NEAR testnet (`outlayer.testnet`) |

What the operator (keeper) sees: sealed blobs, the coarse facts above, and *which accounts* requested or countered a deal (it needs this to route messages). It never holds the enclave key, so it cannot read terms or counters. Who viewed a deal is hidden from the public, not from the operator. We say so in the app.

Testnet trust note: the verifier `verifier.tidepool-sandbox.testnet` is Tidepool's unmodified NEAR Intents defuse v0.4.2 sandbox, operated by Tidepool. So on testnet Tidepool's operator could in theory upgrade the contract or move balances held in it. On mainnet, settlement would use the official `intents.near`.

### How sealing works

- The enclave is a Rust WASI program (`enclave/`) run by **OutLayer** inside an Intel TDX worker.
- Its private key is `HKDF(PROTECTED_OTC_MASTER)`. The master secret was generated inside the OutLayer keystore TEE (`outlayer secrets set --generate PROTECTED_OTC_MASTER:hex32`) and is never shown to anyone.
- Browsers seal to the enclave public key `03312dd677a5864ffc8cff352b7419b90896c9aee20e4f79308c1106517a4947e8` (verifiable by running the `pubkey` action; tx `9mXRyuvrpPwTQKbgRtfrVhLEPUqCJ7hn5PgFPCz67Heo`).
- The keeper calls `outlayer.testnet.request_execution` (NEAR yield/resume) with the sealed input, so every check, reveal and match is a NEAR transaction with a verifiable wasm hash.

## Deal flow rules

- The board and deal pages are open to everyone without sign-in. Cards show pair, side, status, expiry, request and counter-offer counts only. Signing in (Privy Google or a NEAR wallet) is needed to post, request terms, counter or accept.
- Terms are gated by **Request access** + **proof of funds** + **maker approval** (see below). Each reveal is still logged per deal (account + time) for the maker.
- Many counterparties can counter the same deal in parallel; each sees only their own thread, the maker sees all and accepts one.
- First settlement wins: the keeper serialises settlement per deal, and the verifier burns the NEP-413 nonces on execute, so every other accept fails with a clear "already settled" message and no funds move.

## Public vs private deals

- **Public** (default): listed on the board (`/api/deals`) for every signed-in user.
- **Private**: never listed. It shows up only in the maker's My deals and at its share link `/d/<id>`. Deal ids are 16 random characters (about 79 bits), so the link can't be guessed. Anyone with the link sees the coarse facts and can request access; the same proof-of-funds + approval flow applies. There is no address allowlist.
- The maker can switch Private → Public (`POST /api/deals/:id/publish`). Public → Private is refused: once listed, others may already have seen it.
- Where it's enforced: in the keeper API. No on-chain flag is needed. The verifier only ever executes two matching NEP-413 signed intents, and visibility only controls who can *find* a deal. Terms themselves are still gated by the enclave (funds check + maker approval).

## Request access, proof of funds, maker approval

The board is open: anyone (no sign-in) sees public deals' pair, side, expiry, status and how many requests and counter-offers they have. Exact terms stay sealed.

1. **Request terms.** A signed-in taker (Privy or NEAR wallet) seals `{identity, account, deal}` to the enclave. Identity is the Privy access token, or for wallet users a NEP-413 signed login.
2. **Proof of funds (spam filter).** The enclave authenticates the requester and names the token the maker wants. The keeper then checks the requester holds at least **$50** of that token (verifier `mt_balance_of` + wallet `ft_balance_of`, plus native NEAR for wNEAR; priced with the cached CoinGecko feed). The threshold is fixed and public, the same for every deal, and never compared with the sealed amount, so probing can't reveal deal size. It is a spam filter, not a fill guarantee: if the taker lacks the full amount at accept time, `simulate_intents` / `execute_intents` fails and nothing moves. Failing message: "You need at least $50 in <token> to request deals." (`REQUEST_MIN_USD` env overrides.)
3. **Maker approval.** Qualified requests appear on the maker's deal page and in My deals. Approve = the maker signs a NEP-413 message `{otc_approve: deal, requester}`. The enclave validates that signature against the maker's key before the keeper stores it.
4. **Reveal.** The enclave re-seals the terms to the requester's one-time browser key only if a valid maker approval for that account (or `"*"`) is presented. The keeper can't forge approvals: they're signed by the maker and checked in the TEE.
5. **Auto-approve** (per deal, at creation or later): the maker signs `{otc_approve: deal, requester: "*"}`. Anyone who passes the $50 check is approved immediately. Turning it off stops the keeper using it for new requests.
6. **Counter / accept** are only accepted from approved requesters (keeper). Parallel counters, maker picks one, first settlement wins (per-deal lock + verifier nonce burn).

Limits: the's account appears in the OutLayer job input on chain, sealed, but the job runs as the keeper.

## Expiry

Chips: **2 min (demo)**, 1h, 24h, 7d. The chosen time becomes the `deadline` inside the signed NEP-413 message, so the verifier itself (`verifier.tidepool-sandbox.testnet`) refuses to execute after it. Counter-offers and accepts are signed with the deal's own deadline, and the keeper rejects any reply that outlives the deal. The keeper marks a deal Expired once its deadline passes. There is no minimum expiry; settlement takes about 10–20 s, so accept a 2-minute deal well before it runs out.

## Enclave output

The enclave's `check` output (public on chain in the OutLayer execution result) contains only deal id, maker, `to`, pair, side, deadline and the commitment hash. No size range or price hint. Enclave wasm sha256 `5f2ba3f1fc6b3ab386fef21dbc3b32466843499833f27c3d4c6682eae403e5da` (same enclave key, since it is derived from the same keystore secret). Outputs from before this version still include a coarse size range; those were test deals.

## Sign-in: Privy or a NEAR wallet

- **Google (Privy):** a NEAR implicit account is created for you; signing is silent (Privy raw-hash signing).
- **NEAR wallets (NEAR Wallet Selector v10):** Meteor, HOT, Intear, HERE, MyNearWallet, Ledger. Log in by signing a NEP-413 message `{otc_login: account, ts}` for recipient `near-private-otc`. The keeper (`POST /api/auth/wallet`) checks the ed25519 signature and that the key is a full-access key of the account (or the implicit account itself), then issues a 24 h session. The enclave re-checks the same signed login itself.
- Trading signs `token_diff` intents with the wallet's `signMessage` (recipient = verifier). Named accounts register their key on the verifier once (`add_public_key`, 1 yoctoNEAR, prompted automatically).
- Deposits: Wallet → "Deposit from your wallet" sends `ft_transfer_call` to the verifier (NEAR is wrapped with `near_deposit` in the same transaction). Withdraw (all sign-ins): a signed `ft_withdraw` intent relayed by the keeper; wNEAR arrives as wNEAR.

| Wallet | Connect | Sign-in / requests / trades (signMessage) | Deposits |
|---|---|---|---|
| Meteor | yes | yes | yes |
| HOT | yes | yes | yes |
| Intear | yes | yes | yes |
| HERE | yes | yes | yes |
| MyNearWallet | yes | yes (popup) | yes |
| Ledger | yes | no, shown disabled with a note | yes |

## Deployed ids (testnet)

| Piece | Account | Explorer |
| --- | --- | --- |
| Intents verifier | `verifier.tidepool-sandbox.testnet` | https://testnet.nearblocks.io/address/verifier.tidepool-sandbox.testnet |
| Relayer / keeper / faucet | `otcdesk.testnet` | https://testnet.nearblocks.io/address/otcdesk.testnet |
| USDC (6 dp) | `usdc.tidepool-sandbox.testnet` | https://testnet.nearblocks.io/address/usdc.tidepool-sandbox.testnet |
| USDT (6 dp) | `usdt.tidepool-sandbox.testnet` | https://testnet.nearblocks.io/address/usdt.tidepool-sandbox.testnet |
| wNEAR (24 dp) | `wnear.tidepool-sandbox.testnet` | https://testnet.nearblocks.io/address/wnear.tidepool-sandbox.testnet |
| ETH (18 dp) | `eth.tidepool-sandbox.testnet` | https://testnet.nearblocks.io/address/eth.tidepool-sandbox.testnet |
| wBTC (8 dp) | `wbtc.tidepool-sandbox.testnet` | https://testnet.nearblocks.io/address/wbtc.tidepool-sandbox.testnet |
| XAUT (6 dp) | `xaut.tidepool-sandbox.testnet` | https://testnet.nearblocks.io/address/xaut.tidepool-sandbox.testnet |
| Bridged USDC/USDT (6 dp, Tidepool) | `nep141:base-…`, `nep141:arb-…`, `nep141:eth-…` `.tp-omft.testnet` | Base Sepolia / Arbitrum Sepolia / Ethereum Sepolia via https://www.usetidepool.tech |
| Cross-chain API | 1Click: Tidepool `https://www.usetidepool.tech/v0` on testnet, NEAR 1Click on mainnet (`ONECLICK_URL`) | https://docs.near-intents.org |
| OutLayer project | `otcdesk-enclave.testnet/private-otc` | wasm sha256 `5f2ba3f1…e5da` (`deployments/private-otc.json`) |

Deployment transaction hashes: `deployments/private-otc.json`.

## Repo map

```
enclave/   OutLayer WASI worker: pubkey / check / reveal / settle, Privy check from inside the TEE
keeper/    Node server: deal read model, enclave relay, relayer (simulate + execute_intents), faucet, account funding, RPC proxy, serves web/dist
shared/    otc.mjs: tokens, ECIES sealing, NEP-413 hashing/signing, unit helpers (browser + node)
web/       Vite + React app (Privy or NEAR wallet sign-in): board, deal page, new deal, my deals, wallet (balances, faucet, deposit, withdraw, activity), how it works
contracts/ pointers to the upstream wasm we deployed
scripts/   deploy-near.mjs (verifier + tokens); agents/ (maker + taker agents, N-agent race, sub-account mode, negotiation)
```

## Run locally

```sh
npm ci && (cd web && npm ci)
cp .env.example my.env   # fill in, never commit
set -a; . ./my.env; set +a
npm --prefix web run build && node keeper/index.mjs   # http://127.0.0.1:8790
```

Enclave rebuild: `PRIVY_APP_ID=cmvi99u1e01os0il20daip5mv APP_ORIGIN=https://your-app cargo build --release --target wasm32-wasip2` in `enclave/`, then `outlayer upload` + `outlayer deploy private-otc <url>`.

## Limits

- **No partial fills.** One signed listing fills once at the exact size. Makers can post several smaller deals as tranches. (A token_diff is all-or-nothing; partial fills would need the maker to pre-sign every possible fraction.)
- Testnet only, Tidepool's sandbox verifier (not `intents.near`). One keeper, one enclave deployment. Testnet trust note: the verifier `verifier.tidepool-sandbox.testnet` is Tidepool's unmodified NEAR Intents defuse v0.4.2 sandbox, operated by Tidepool. So on testnet Tidepool's operator could in theory upgrade the contract or move balances held in it. On mainnet, settlement would use the official `intents.near`.
- Agents: function-call (limited) access keys can't sign in; sign-in and the enclave accept full-access keys of named accounts or implicit accounts. Use a sub-account with small funds to limit what an agent can lose.
- The enclave trusts Privy's answer about which NEAR wallet belongs to a sign-in.
- The keeper must stay online to relay; if OutLayer is down, reveal and settle wait.
- The maker must keep enough balance in the verifier (the New deal form warns and links to the faucet); `simulate_intents` refuses an accept that would fail.
- Faucet: Tidepool's (https://www.usetidepool.tech), one claim per account per hour: 100 USDC, 100 USDT, 40 wNEAR, 0.03 ETH, 0.001 wBTC, 0.03 XAUT, credited straight into the verifier. Email users have no deposit UI (faucet only); NEAR wallet users get "Deposit from your wallet". Everyone gets "Withdraw" back to their own NEAR account (Privy implicit accounts included).

## License

MIT, see [LICENSE](LICENSE).
