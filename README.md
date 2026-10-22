# NEAR Private OTC

**A private OTC deal board on NEAR.** Post a deal with a sealed size and price, let strangers find it, negotiate privately, and settle both sides in one atomic NEAR Intents call.

- **Try it:** use the app link from the submission form (`<APP_URL>` below), or [run it locally](#run-locally) at `http://127.0.0.1:8790`.
- **Network:** NEAR testnet only (test tokens, no real value).
- **Problem:** OTC traders can't find a counterparty unless they already know one, and posting size and price publicly leaks information.

## Why this exists

> "Private OTC market using 'private deals' from NEAR Intents. Currently there is no way to find counter party unless you already know you are transacting with. Create a more open way to communicate what are deals open and allow people to fill them via NEAR Intents."
>
> — Illia Polosukhin ([@ilblackdragon](https://x.com/ilblackdragon)), NEAR co-founder, in his [list of ideas for NEAR builders](https://x.com/ilblackdragon/status/2106269343881519444) (Oct 2026)

This app is that market: an open board for finding counterparties, sealed terms, and fills settled with NEAR Intents.

## Hackathon track: `defi`

Built at NEAR HACKATHON 2026. Track:

- `defi` - OTC trading settled with NEAR Intents: `token_diff` intents, `simulate_intents`, atomic `execute_intents`, nonces and deadlines.

Privacy is a supporting feature, not a track: exact terms and counter-offers are sealed in an OutLayer enclave (Intel TDX); the operator never holds the key.

## Under the hood: one trade, six steps

1. **Post.** The maker picks pair, side, size and price. The browser builds a `token_diff` intent (−what I give, +what I get), the maker signs it (NEP-413, no gas), and the whole offer `{terms, note, signed intent}` is sealed (ECIES secp256k1 + AES-256-GCM) to the enclave's public key. The keeper relays the sealed blob to the enclave (`check`), which verifies the signed intent matches the sealed terms and publishes **only** pair, side and the deadline (the keeper drops the enclave's coarse size band and never serves it).
2. **Request.** A signed-in taker taps *Request terms*. The keeper checks they hold at least $200 (CoinGecko) of the token the maker wants (a fixed spam filter), and the maker approves the request (NEP-413 signed, or auto-approve). Their browser seals `{Privy access token, one-time public key, NEAR account, deal}` to the enclave. The enclave verifies the Privy token (ES256 against Privy JWKS), asks Privy from inside the TEE which NEAR wallets belong to that user, and re-seals the exact terms to the one-time browser key.
3. **Negotiate.** *Accept*, *Counter* or *Decline*. Each counter is a new signed intent sealed to the enclave, readable only by the two parties named inside it.
4. **Settle.** On *Accept*, the enclave (`settle`) checks the two signed intents are exact mirror images (same deal, opposite legs, equal amounts, different signers, addressed to each other) and releases them. The relayer dry-runs `simulate_intents` and calls `execute_intents` on our verifier. Both transfers happen in one transaction or not at all.
5. **Deposit / withdraw.** The faucet (everyone) and *Deposit from your wallet* (NEAR-wallet sign-ins) move tokens into the verifier with `ft_transfer_call`. *Withdraw* (everyone) signs an `ft_withdraw` intent to your own account; the keeper relays it with `execute_intents`. Both are public on chain.
6. **Expire / cancel.** Every intent carries a `deadline`. To cancel, the maker signs empty intents that re-use each live offer nonce; executing them marks those nonces used, so the old signatures can never settle.

## NEAR features used

| Feature | What it does here | Docs |
| --- | --- | --- |
| Own NEAR Intents verifier | Upstream `near/intents` verifier (defuse v0.4.2 release wasm) at `otcdesk-intents.testnet`, because NEAR Intents has no public testnet | [Verifier](https://docs.near-intents.org/integration/verifier-contract/introduction) |
| `token_diff` + `execute_intents` | Each side signs a token diff; both are executed together and must net to zero, so settlement is atomic | [Intent types](https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution) |
| `simulate_intents` | Relayer dry-runs every batch before paying gas | [Simulating](https://docs.near-intents.org/integration/verifier-contract/simulating-intents) |
| NEP-413 signing | Intents are NEP-413 payloads (recipient = our verifier) signed with the Privy-held ed25519 key via raw-hash signing | [NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md), [Signing intents](https://docs.near-intents.org/integration/verifier-contract/signing-intents) |
| Implicit accounts | 64-hex accounts; the verifier trusts the implicit key without `add_public_key` | [Account abstraction](https://docs.near-intents.org/integration/verifier-contract/account-abstraction) |
| Deadlines & nonces | Expiry via `deadline`; cancel by burning nonces with empty intents (v0.4.2 has no separate invalidate call) | [Signing intents](https://docs.near-intents.org/integration/verifier-contract/signing-intents) |
| `ft_transfer_call` deposits | The faucet credits test tokens straight into the user's verifier balance with `msg = account` ; NEAR-wallet users deposit from their wallet. Everyone withdraws with a signed `ft_withdraw` intent (Wallet -> Withdraw), relayed by the keeper | [Deposits](https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/deposits), [Withdrawals](https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/withdrawals) |
| Storage deposits (NEP-145) | Verifier pre-registered on every token, so deposits need no user setup; the first withdrawal of a token calls `storage_deposit` on the user's account | [Storage](https://docs.near.org/smart-contracts/anatomy/storage) |
| Relayer-paid gas | `otcdesk.testnet` submits `execute_intents`; signing a deal costs the user nothing | [Meta-transactions](https://docs.near.org/chain-abstraction/meta-transactions) |
| OutLayer TEE + yield/resume | Sealed terms, reveal and matching run in Intel TDX; called on chain | [OutLayer](https://outlayer.fastnear.com) |
| NEP-141 tokens & wNEAR | `tUSDC`, `tETH` (upstream FT wasm), `wrap.testnet` | [FT](https://docs.near.org/primitives/ft) |
| Testnet helper (faucet) API | Created the project's top-level testnet accounts | [Faucet](https://docs.near.org/tools/faucet) |
| Reference prices | New deal autofills the receive amount at CoinGecko market (tUSDC→USDC, wNEAR→NEAR, tETH→ETH) and shows % vs market on deals and counters; reference only | [CoinGecko API](https://docs.coingecko.com/reference/simple-price) |
| NearBlocks | Every seal, settlement and cancel links to testnet.nearblocks.io | [NearBlocks](https://testnet.nearblocks.io) |

Considered and skipped: chain signatures (no cross-chain leg needed on testnet), passkeys / WebAuthn intents, 1Click / confidential relay (mainnet only), partial fills (see limits).

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

Testnet trust note: the verifier `otcdesk-intents.testnet` is our own unmodified copy of NEAR Intents defuse v0.4.2, and its super-admin is `otcdesk.testnet` (the operator). So on testnet the operator could in theory upgrade the contract or move balances held in it. On mainnet, settlement would use the official `intents.near`.

### How sealing works

- The enclave is a Rust WASI program (`enclave/`) run by **OutLayer** inside an Intel TDX worker.
- Its private key is `HKDF(PROTECTED_OTC_MASTER)`. The master secret was generated inside the OutLayer keystore TEE (`outlayer secrets set --generate PROTECTED_OTC_MASTER:hex32`) and is never shown to anyone.
- Browsers seal to the enclave public key `03312dd677a5864ffc8cff352b7419b90896c9aee20e4f79308c1106517a4947e8` (verifiable by running the `pubkey` action; tx `9mXRyuvrpPwTQKbgRtfrVhLEPUqCJ7hn5PgFPCz67Heo`).
- The keeper calls `outlayer.testnet.request_execution` (NEAR yield/resume) with the sealed input, so every check, reveal and match is a NEAR transaction with a verifiable wasm hash.

## Judge tour: two browsers, one trade

All steps run against `<APP_URL>` (the link in the submission form) or a local run against NEAR testnet. Use two browsers (or a normal and a private window) for the maker and the taker.

1. **Open `<APP_URL>/app` without signing in** - see the public deal board: pair, side, expiry, status, request and counter-offer counts only. No size or price.
2. **Sign in with Google (Privy) or a NEAR wallet (Meteor, HOT, Intear, HERE, MyNearWallet)** - see your NEAR account in the header; a new Privy implicit account is funded with 0.2 test NEAR.
3. **Wallet -> Faucet -> claim tUSDC (and wNEAR or tETH)** - see the balance credited straight into your verifier balance on `otcdesk-intents.testnet`, with the transaction in Activity. Balances shown are held in the NEAR Intents verifier: deposit to trade, withdraw to move them back to your wallet.
4. **New deal -> pick pair, side, size, price -> choose Public or Private -> pick an expiry chip (2 min (demo), 1h, 24h, 7d) -> sign** - see the deal on the board (Public) or get a link-only `/d/<id>` URL (Private), with a NearBlocks link to the OutLayer `check` transaction. The board still shows no amounts.
5. **As the taker, open the deal -> Request terms** - the keeper checks you hold at least $200 (CoinGecko) of the token the maker wants (wallet + verifier); without it you see "You need at least $200 in <token> to request deals."
6. **As the maker, approve the request (or turn on auto-approve)** - the taker sees the sealed terms open: exact size, price and note, decrypted in their browser.
7. **Counter, Decline or Accept in the deal thread** - each counter is a new signed intent sealed to the enclave; only the two parties see it.
8. **Accept a live offer** - the enclave checks the two intents are exact mirror images, the relayer runs `simulate_intents` then `execute_intents`; see the deal turn Settled with a NearBlocks link, and both Wallet balances change.
9. **Wallet -> Withdraw -> pick a token, tap Max or type an amount -> Sign & withdraw** (any sign-in) - see a success toast with the NearBlocks tx, the verifier balance drop and the tokens arrive in your own NEAR account. The first withdrawal of a token registers storage (`storage_deposit`, 0.00125 NEAR) on your account.
10. **Cancel an open deal (My deals)** - see the cancel transaction: empty intents re-use the offer nonces, so the old signatures can never settle.
11. **`curl <APP_URL>/api/deals`** - see JSON with pair, side, deadline, status, counts and tx hashes, and no amounts or prices.

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
2. **Proof of funds (spam filter).** The enclave authenticates the requester and names the token the maker wants. The keeper then checks the requester holds at least **$200** of that token (verifier `mt_balance_of` + wallet `ft_balance_of`, plus native NEAR for wNEAR; priced with the cached CoinGecko feed). The threshold is fixed and public, the same for every deal, and never compared with the sealed amount, so probing can't reveal deal size. It is a spam filter, not a fill guarantee: if the taker lacks the full amount at accept time, `simulate_intents` / `execute_intents` fails and nothing moves. Failing message: "You need at least $200 in <token> to request deals." (`REQUEST_MIN_USD` env overrides.)
3. **Maker approval.** Qualified requests appear on the maker's deal page and in My deals. Approve = the maker signs a NEP-413 message `{otc_approve: deal, requester}`. The enclave validates that signature against the maker's key before the keeper stores it.
4. **Reveal.** The enclave re-seals the terms to the requester's one-time browser key only if a valid maker approval for that account (or `"*"`) is presented. The keeper can't forge approvals: they're signed by the maker and checked in the TEE.
5. **Auto-approve** (per deal, at creation or later): the maker signs `{otc_approve: deal, requester: "*"}`. Anyone who passes the $200 check is approved immediately. Turning it off stops the keeper using it for new requests.
6. **Counter / accept** are only accepted from approved requesters (keeper). Parallel counters, maker picks one, first settlement wins (per-deal lock + verifier nonce burn).

Limits: the's account appears in the OutLayer job input on chain, sealed, but the job runs as the keeper.

## Expiry

Chips: **2 min (demo)**, 1h, 24h, 7d. The chosen time becomes the `deadline` inside the signed NEP-413 message, so the verifier itself (`otcdesk-intents.testnet`) refuses to execute after it. Counter-offers and accepts are signed with the deal's own deadline, and the keeper rejects any reply that outlives the deal. The keeper marks a deal Expired once its deadline passes. There is no minimum expiry; settlement takes about 10–20 s, so accept a 2-minute deal well before it runs out.

## Enclave output

The enclave's `check` output (public on chain in the OutLayer execution result) contains only deal id, maker, `to`, pair, side, deadline and the commitment hash. No size range or price hint. Enclave wasm sha256 `1b9862020a7a0e13b809880d6022e6e636712731b325f424a60d108345da1760` (same enclave key, since it is derived from the same keystore secret). Outputs from before this version still include a coarse size range; those were test deals.

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
| Intents verifier | `otcdesk-intents.testnet` | https://testnet.nearblocks.io/address/otcdesk-intents.testnet |
| Relayer / keeper / faucet | `otcdesk.testnet` | https://testnet.nearblocks.io/address/otcdesk.testnet |
| tUSDC (6 dp) | `otcdesk-usdc.testnet` | https://testnet.nearblocks.io/address/otcdesk-usdc.testnet |
| tETH (18 dp) | `otcdesk-eth.testnet` | https://testnet.nearblocks.io/address/otcdesk-eth.testnet |
| wNEAR | `wrap.testnet` | https://testnet.nearblocks.io/address/wrap.testnet |
| OutLayer project | `otcdesk-enclave.testnet/private-otc` | wasm sha256 `1c19fcec…09ec` (`deployments/private-otc.json`) |

Deployment transaction hashes: `deployments/private-otc.json`.

## Repo map

```
enclave/   OutLayer WASI worker: pubkey / check / reveal / settle, Privy check from inside the TEE
keeper/    Node server: deal read model, enclave relay, relayer (simulate + execute_intents), faucet, account funding, RPC proxy, serves web/dist
shared/    otc.mjs: tokens, ECIES sealing, NEP-413 hashing/signing, unit helpers (browser + node)
web/       Vite + React app (Privy or NEAR wallet sign-in): board, deal page, new deal, my deals, wallet (balances, faucet, deposit, withdraw, activity), how it works
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

Enclave rebuild: `PRIVY_APP_ID=cmvi99u1e01os0il20daip5mv APP_ORIGIN=https://your-app cargo build --release --target wasm32-wasip2` in `enclave/`, then `outlayer upload` + `outlayer deploy private-otc <url>`.

## Limits

- **No partial fills.** One signed listing fills once at the exact size. Makers can post several smaller deals as tranches. (A token_diff is all-or-nothing; partial fills would need the maker to pre-sign every possible fraction.)
- Testnet only, our own verifier copy (not `intents.near`). One keeper, one enclave deployment. Testnet trust note: the verifier `otcdesk-intents.testnet` is our own unmodified copy of NEAR Intents defuse v0.4.2, and its super-admin is `otcdesk.testnet` (the operator). So on testnet the operator could in theory upgrade the contract or move balances held in it. On mainnet, settlement would use the official `intents.near`.
- The enclave trusts Privy's answer about which NEAR wallet belongs to a sign-in.
- The keeper must stay online to relay; if OutLayer is down, reveal and settle wait.
- The maker must keep enough balance in the verifier (the New deal form warns and links to the faucet); `simulate_intents` refuses an accept that would fail.
- Faucet (per sign-in, per token, 3 claims a day): 1000 tUSDC, 50 wNEAR, 0.5 tETH, credited straight into the verifier. The keeper wraps real testnet NEAR for wNEAR, so that faucet is limited by the keeper's NEAR balance and says so when empty. Email users have no deposit UI (faucet only); NEAR wallet users get "Deposit from your wallet". Everyone gets "Withdraw" back to their own NEAR account (Privy implicit accounts included).

## License

MIT
