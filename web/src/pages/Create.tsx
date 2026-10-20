import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@unlocalhosted/metalui";
import { LockKey } from "@phosphor-icons/react";
import { Top, NeedSignIn } from "../app/Shell";
import { useApp } from "../app/state";
import { TOKENS, toUnits } from "@shared/otc.mjs";
import { signedOffer, newDealId, balances } from "../lib/deal";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { api, type Terms } from "../lib/api";
import { SignPanel, PrivacyNote, Pick } from "../components/ui";

const EXP = [["1 hour", 3600e3], ["24 hours", 86400e3], ["3 days", 3 * 86400e3], ["7 days", 7 * 86400e3]] as const;
export default function Create() {
  const { account } = useApp();
  const toast = useToast(); const nav = useNavigate();
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [base, setBase] = useState(TOKENS[1].id);
  const [quote, setQuote] = useState(TOKENS[0].id);
  const [size, setSize] = useState(""); const [price, setPrice] = useState("");
  const [exp, setExp] = useState<number>(EXP[1][1]); const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [bal, setBal] = useState<Record<string, string> | null>(null);
  useEffect(() => { if (account) balances(account).then(setBal).catch(() => {}); }, [account]);
  const tb = TOKENS.find((t: any) => t.id === base)!, tq = TOKENS.find((t: any) => t.id === quote)!;
  const total = Number(size) * Number(price);
  const terms: Terms | null = useMemo(() => {
    try {
      if (!(Number(size) > 0 && Number(price) > 0) || base === quote) return null;
      const b = toUnits(size, tb.decimals), q = toUnits(total.toFixed(Math.min(tq.decimals, 6)), tq.decimals);
      return side === "sell" ? { sell_token: base, sell_amount: b, buy_token: quote, buy_amount: q } : { sell_token: quote, sell_amount: q, buy_token: base, buy_amount: b };
    } catch { return null; }
  }, [size, price, base, quote, side]);
  if (!account) return <><Top title="New deal" /><NeedSignIn what="Sign in to post a sealed deal." /></>;
  const deadline = Date.now() + exp;
  const submit = async () => {
    if (!terms) return;
    try {
      setBusy("Signing your intent…");
      const deal = newDealId();
      const s = await signedOffer({ account, deal, to: "*", terms, deadlineMs: deadline, note });
      setBusy("Sealing to the enclave (OutLayer TEE, ~10 s)…");
      await api("/api/deals", { ...s, account });
      toast.show({ title: "Deal posted", sub: "Terms sealed. Share the link with anyone.", tone: "success" });
      nav(`/app/d/${deal}`);
    } catch (e: any) { toast.show({ title: "Could not post", sub: e.message, tone: "error" }); } finally { setBusy(""); }
  };
  return (
    <>
      <Top title="New deal" sub="Your exact size and price are sealed. The board shows only a band." />
      <div className="card card-pad form-wide">
        <div className="seg seg-full"><button className={side === "sell" ? "on" : ""} onClick={() => setSide("sell")}>Sell</button><button className={side === "buy" ? "on" : ""} onClick={() => setSide("buy")}>Buy</button></div>
        <div className="field-row">
          <div className="field"><span>Asset</span><Pick label="Asset" value={base} onChange={setBase} options={TOKENS.map((t: any) => ({ value: t.id, label: t.symbol }))} /></div>
          <div className="field"><span>Paid in</span><Pick label="Paid in" value={quote} onChange={setQuote} options={TOKENS.map((t: any) => ({ value: t.id, label: t.symbol }))} /></div>
        </div>
        <div className="field-row">
          <label className="field"><span>Size ({tb.symbol})</span><input className="input mono" inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} placeholder="0.0" /></label>
          <label className="field"><span>Price ({tq.symbol})</span><input className="input mono" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.0" /></label>
        </div>
        <div className="field"><span>Expires in</span><Pick label="Expires in" value={String(exp)} onChange={(v) => setExp(Number(v))} options={EXP.map(([l, v]) => ({ value: String(v), label: l }))} /></div>
        <label className="field"><span>Private note (optional)</span><input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only takers who request see this" /></label>
        {base === quote && <p className="err">Pick two different tokens.</p>}
        {terms && bal && BigInt(bal[terms.sell_token] || "0") < BigInt(terms.sell_amount) && <p className="warn-note">Your {TOKENS.find((t: any) => t.id === terms.sell_token)!.symbol} balance is too low to fill this deal. <Link to="/app/wallet#faucet" className="link">Claim test tokens from the Faucet →</Link></p>}
        {terms && <SignPanel kind="token_diff intent (NEP-413), sealed to the enclave" terms={terms} deadline={deadline} gas="None. The relayer pays for settlement.">
          <p className="tiny muted">Settles only if a taker signs the exact mirror image. Keep this balance in your Wallet until someone accepts.</p></SignPanel>}
        <button className="btn btn-dark btn-full" disabled={!terms || !!busy} onClick={submit}><LockKey size={16} weight="bold" /> {busy || "Sign & seal deal"}</button>
      </div>
      <div className="form-wide" style={{ marginTop: 16 }}><PrivacyNote /></div>
    </>
  );
}
