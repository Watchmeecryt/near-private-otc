import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useToast } from "@unlocalhosted/metalui";
import { LockKey, ArrowsDownUp, Info } from "@phosphor-icons/react";
import { Top, NeedSignIn } from "../app/Shell";
import { useApp } from "../app/state";
import { TOKENS, toUnits, fromUnits } from "@shared/otc.mjs";
import { signedOffer, newDealId, balances } from "../lib/deal";
import { api, type Terms } from "../lib/api";
import { SignPanel, PrivacyNote, Pick } from "../components/ui";
import { usePrices, usd, marketOut, vsMarket, fmtPct, fmtUsd, roundSig } from "../lib/prices";

const EXP: [string, number][] = [["1h", 3600e3], ["24h", 86400e3], ["7d", 7 * 86400e3]];
const EXP_WORDS: Record<string, string> = { "1h": "1 hour", "24h": "24 hours", "7d": "7 days" };
const tok = (id: string) => TOKENS.find((t: any) => t.id === id)!;
const nice = (n: string) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 });
/** Mirrors the enclave's public "band": quote = tUSDC before wNEAR before tETH; band on the quote amount. */
function boardPreview(give: string, giveAmt: string, get: string, getAmt: string) {
  const r = (id: string) => TOKENS.findIndex((t: any) => t.id === id);
  const [quote, base, qAmt, side] = r(give) < r(get) ? [give, get, giveAmt, "Buying"] : [get, give, getAmt, "Selling"];
  const w = Math.floor(Number(qAmt));
  const band = w < 100 ? "under 100" : w < 1000 ? "100 – 1k" : w < 10000 ? "1k – 10k" : w < 100000 ? "10k – 100k" : "100k +";
  return `${side} ${tok(base).symbol} for ${tok(quote).symbol} · roughly ${band} ${tok(quote).symbol}`;
}

function TokenRow({ label, amount, setAmount, token, setToken, bal, hint, usdVal }: { label: string; amount: string; setAmount: (v: string) => void; token: string; setToken: (v: string) => void; bal?: string; hint?: React.ReactNode; usdVal?: number | null }) {
  const t = tok(token);
  return (
    <div className="swap-row">
      <div className="sr-top"><span>{label}</span>{bal !== undefined && label === "You sell" && <button type="button" className="sr-bal" onClick={() => setAmount(fromUnits(bal, t.decimals, 6))}>Balance {nice(fromUnits(bal, t.decimals, 6))} · Max</button>}</div>
      <div className="sr-main">
        <input className="sr-amt mono" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} aria-label={`${label} amount`} />
        <div className="sr-tok"><Pick label={`${label} token`} value={token} onChange={setToken} options={TOKENS.map((x: any) => ({ value: x.id, label: x.symbol, lead: <span className="tok-dot">{x.symbol.replace(/^[tw]/, "")[0]}</span> }))} /></div>
      </div>
      {usdVal ? <div className="sr-usd">≈ {fmtUsd(usdVal)}</div> : null}
      {hint}
    </div>
  );
}

export default function Create() {
  const { account } = useApp();
  const toast = useToast(); const nav = useNavigate();
  const [give, setGive] = useState(TOKENS[0].id); const [giveAmt, setGiveAmt] = useState("");
  const [get, setGet] = useState(TOKENS[1].id); const [getAmt, setGetAmt] = useState("");
  const [exp, setExp] = useState(EXP[1][1]); const [note, setNote] = useState("");
  const [manual, setManual] = useState(false);
  const prices = usePrices();
  const [busy, setBusy] = useState("");
  const [bal, setBal] = useState<Record<string, string> | null>(null);
  useEffect(() => { if (account) balances(account).then(setBal).catch(() => {}); }, [account]);
  useEffect(() => { if (manual) return; const m = marketOut(prices, give, get, Number(giveAmt)); setGetAmt(Number(giveAmt) > 0 && m ? roundSig(m, tok(get).decimals) : ""); }, [giveAmt, give, get, prices, manual]);
  const pickGive = (v: string) => { if (v === get) setGet(give); setGive(v); };
  const pickGet = (v: string) => { if (v === give) setGive(get); setGet(v); };
  const flip = () => { setGive(get); setGet(give); setGiveAmt(getAmt); setGetAmt(giveAmt); };
  const setReceive = (v: string) => { setManual(v !== ""); setGetAmt(v); };
  const terms: Terms | null = useMemo(() => {
    try { if (!(Number(giveAmt) > 0 && Number(getAmt) > 0) || give === get) return null; return { sell_token: give, sell_amount: toUnits(giveAmt, tok(give).decimals), buy_token: get, buy_amount: toUnits(getAmt, tok(get).decimals) }; } catch { return null; }
  }, [give, giveAmt, get, getAmt]);
  if (!account) return <><Top title="New deal" sub="Offer tokens, name what you want back. Only the person you deal with sees the numbers." /><NeedSignIn what="Sign in to post a private deal." /></>;
  const low = terms && bal && BigInt(bal[give] || "0") < BigInt(terms.sell_amount);
  const bad = (v: string) => v !== "" && !(Number(v) > 0);
  const deadline = Date.now() + exp;
  const expLabel = EXP_WORDS[EXP.find(([, v]) => v === exp)![0]];
  const diff = vsMarket(prices, give, Number(giveAmt), get, Number(getAmt));
  const rate = usd(prices, get) && usd(prices, give) ? `1 ${tok(get).symbol.replace(/^[tw]/, "")} ≈ ${fmtUsd(usd(prices, get)!)} · 1 ${tok(give).symbol} = ${roundSig(marketOut(prices, give, get, 1)!, 6)} ${tok(get).symbol}` : null;
  const submit = async () => {
    if (!terms) return;
    try {
      setBusy("Signing…");
      const deal = newDealId();
      const s = await signedOffer({ account, deal, to: "*", terms, deadlineMs: deadline, note });
      setBusy("Sealing privately (≈10 s)…");
      await api("/api/deals", { ...s, account });
      toast.show({ title: "Deal posted", sub: "Share the link; only takers who open it see your numbers.", tone: "success" });
      nav(`/app/d/${deal}`);
    } catch (e: any) { toast.show({ title: "Could not post", sub: e.message, tone: "error" }); } finally { setBusy(""); }
  };
  return (
    <>
      <Top title="New deal" sub="Offer tokens, name what you want back. Only the person you deal with sees the numbers." />
      <div className="create-col">
        <div className="card card-pad swap-card">
          <TokenRow label="You sell" usdVal={usd(prices, give) && Number(giveAmt) > 0 ? usd(prices, give)! * Number(giveAmt) : null} amount={giveAmt} setAmount={setGiveAmt} token={give} setToken={pickGive} bal={bal?.[give]}
            hint={bad(giveAmt) ? <p className="sr-hint err">Enter an amount above 0.</p> : low ? <p className="sr-hint warn-note">You only have {nice(fromUnits(bal![give], tok(give).decimals, 6))} {tok(give).symbol}. <Link to="/app/wallet#faucet" className="link">Get free test tokens →</Link></p> : null} />
          <div className="swap-mid"><button type="button" className="swap-flip" onClick={flip} aria-label="Swap sides"><ArrowsDownUp size={18} weight="bold" /></button></div>
          <TokenRow label="You receive" usdVal={usd(prices, get) && Number(getAmt) > 0 ? usd(prices, get)! * Number(getAmt) : null} amount={getAmt} setAmount={setReceive} token={get} setToken={pickGet} bal={bal?.[get]}
            hint={bad(getAmt) ? <p className="sr-hint err">Enter an amount above 0.</p> : terms ? <p className="sr-hint">{!manual ? <span className="mkt-tag">≈ market</span> : diff !== null ? <span className={`mkt-tag ${Math.abs(diff) < 0.5 ? "" : diff > 0 ? "up" : "down"}`}>{fmtPct(diff)} vs market</span> : null} <span className="muted">{nice(String(Number(getAmt) / Number(giveAmt)))} {tok(get).symbol} per {tok(give).symbol}</span>{manual && <button type="button" className="sr-bal" style={{ marginLeft: 8 }} onClick={() => setManual(false)}>Reset to market</button>}</p> : null} />
          {rate && <div className="rate-line"><span>{rate}</span><span className="tiny muted">Prices from CoinGecko, for reference only</span></div>}
          <div className="field" style={{ marginTop: 16 }}><span>Expires in</span>
            <div className="exp-chips">{EXP.map(([l, v]) => <button key={l} type="button" className={exp === v ? "on" : ""} onClick={() => setExp(v)}>{l}</button>)}</div>
          </div>
          <label className="field"><span>Private note <i className="muted">(optional)</i></span><input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. happy to split into two trades" /></label>
          <button className="btn btn-dark btn-full" disabled={!terms || !!busy} onClick={submit}><LockKey size={16} weight="bold" /> {busy || (terms ? "Sign & seal deal" : "Enter an amount to sell")}</button>
          <p className="tiny muted" style={{ marginTop: 10, textAlign: "center" }}>Free to post. No gas: you only sign a message.</p>
        </div>
        <div className="create-under">
          <div className="card card-pad summary">
            <h3 className="h3">Summary</h3>
            {terms ? (
              <>
                <p className="sum-line">You're offering <b>{nice(giveAmt)} {tok(give).symbol}</b> for <b>{nice(getAmt)} {tok(get).symbol}</b>. Expires in {expLabel}.{diff !== null && manual ? ` That is ${fmtPct(diff)} vs market.` : ""}</p>
                <div className="sum-pub"><Info size={15} /> <span>The public board only shows: <b>{boardPreview(give, giveAmt, get, getAmt)}</b>, and the expiry. Exact amounts stay private.</span></div>
              </>
            ) : <p className="muted small">Fill in what you give and what you want back. You'll see a plain-English summary here.</p>}
          </div>
          {terms && <SignPanel kind="A trade instruction (NEAR Intents), kept sealed" terms={terms} deadline={deadline} gas="None. We pay the network fee when the trade settles." >
            <p className="tiny muted">It only executes if someone signs the exact opposite trade. Keep the tokens in your Wallet until then.</p></SignPanel>}
          <PrivacyNote />
        </div>
      </div>
    </>
  );
}
