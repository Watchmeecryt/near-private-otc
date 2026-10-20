import { useEffect, useState } from "react";
import { useToast } from "@unlocalhosted/metalui";
import { Drop, ArrowDown, ArrowUp, Coins, ClockCounterClockwise } from "@phosphor-icons/react";
import { Top, NeedSignIn } from "../app/Shell";
import { useApp } from "../app/state";
import { api } from "../lib/api";
import { balances, withdrawPayload } from "../lib/deal";
import { sendTx, viewCall } from "../lib/privy";
import { TOKENS, VERIFIER, fromUnits, toUnits } from "@shared/otc.mjs";
import { SignPanel, Tx, Pick } from "../components/ui";

const STORAGE = "1250000000000000000000"; // 0.00125 NEAR
type Act = { kind: string; detail: string; tx: string; at: number };
const actKey = (a: string) => `otc-activity-${a}`;
const readActs = (a: string): Act[] => { try { return JSON.parse(localStorage.getItem(actKey(a)) || "[]"); } catch { return []; } };

const claimKey = (a: string, s: string) => `otc-claim-${new Date().toISOString().slice(0, 10)}-${a}-${s}`;
const claims = (a: string, s: string) => Number(localStorage.getItem(claimKey(a, s)) || 0);
const bump = (a: string, s: string) => localStorage.setItem(claimKey(a, s), String(claims(a, s) + 1));

export default function WalletPage() {
  const { account } = useApp();
  const toast = useToast();
  const [bal, setBal] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState("");
  const [acts, setActs] = useState<Act[]>([]);
  const [dep, setDep] = useState("0.1");
  const [wd, setWd] = useState({ token: TOKENS[0].id as string, amount: "" });
  const load = () => account && balances(account).then(setBal).catch(() => {});
  useEffect(() => { if (!account) return; setActs(readActs(account)); load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [account]);
  useEffect(() => { if (location.hash === "#faucet") setTimeout(() => document.getElementById("faucet")?.scrollIntoView({ behavior: "smooth" }), 200); }, []);
  if (!account) return <><Top title="Wallet" /><NeedSignIn what="Sign in to see your balances and claim test tokens from the faucet." /></>;
  const record = (a: Act) => { const n = [a, ...readActs(account)].slice(0, 20); localStorage.setItem(actKey(account), JSON.stringify(n)); setActs(n); };
  const run = async (kind: string, detail: string, f: () => Promise<string>) => {
    try { setBusy(kind); const tx = await f(); record({ kind, detail, tx, at: Date.now() }); toast.show({ title: `${kind} done`, sub: detail, tone: "success" }); setTimeout(load, 1500); }
    catch (e: any) { toast.show({ title: `${kind} failed`, sub: e.message, tone: "error" }); } finally { setBusy(""); }
  };
  const faucet = async (t: any) => { setBusy("Faucet:" + t.symbol); try { const r = await api<any>("/api/faucet", { account, token: t.symbol }); bump(account, t.symbol); record({ kind: "Faucet", detail: `+${t.faucet} ${t.symbol}`, tx: r.tx, at: Date.now() }); toast.show({ title: `+${t.faucet} ${t.symbol}`, sub: "Added to your balance", tone: "success" }); setTimeout(load, 1500); } catch (e: any) { if (/limit/i.test(e.message)) { localStorage.setItem(claimKey(account, t.symbol), "3"); setActs([...acts]); } toast.show({ title: "Faucet failed", sub: e.message, tone: "error" }); } finally { setBusy(""); } };
  const deposit = () => run("Deposit", `${dep} NEAR → wNEAR`, () => sendTx(account, "wrap.testnet", [
    { method: "storage_deposit", args: { account_id: account, registration_only: true }, deposit: STORAGE, tgas: 10 },
    { method: "near_deposit", args: {}, deposit: toUnits(dep, 24), tgas: 10 },
    { method: "ft_transfer_call", args: { receiver_id: VERIFIER, amount: toUnits(dep, 24), msg: account }, deposit: "1", tgas: 100 },
  ]));
  const wt = TOKENS.find((t: any) => t.id === wd.token)!;
  const withdraw = () => run("Withdraw", `${wd.amount} ${wt.symbol}`, async () => {
    const reg = await viewCall(wt.contract, "storage_balance_of", { account_id: account }).catch(() => null);
    if (!reg) await sendTx(account, wt.contract, [{ method: "storage_deposit", args: { account_id: account, registration_only: true }, deposit: STORAGE, tgas: 10 }]);
    const signed = await withdrawPayload(account, wt.contract, toUnits(wd.amount, wt.decimals));
    return (await api<any>("/api/withdraw", { account, signed })).tx;
  });
  return (
    <>
      <Top title="Wallet" sub="Your balances inside the NEAR Intents verifier. Deals settle from here." />
      <div className="wallet-grid">
        <section className="card card-pad w-bal">
          <h3 className="h3"><Coins size={18} weight="duotone" /> Balances</h3>
          <div className="tok-grid">{TOKENS.map((t: any) => (
            <div key={t.id} className="tok"><span className="tok-sym">{t.symbol}</span><b className="mono tok-amt">{bal ? fromUnits(bal[t.id], t.decimals, 4) : "…"}</b><span className="tiny muted mono">{t.contract}</span></div>
          ))}</div>
        </section>
        <section className="card card-pad w-faucet" id="faucet">
          <h3 className="h3"><Drop size={18} weight="duotone" /> Faucet</h3>
          <p className="small muted">Free test tokens, deposited straight into your verifier balance. Limit: 3 claims per token per day.</p>
          <div className="faucet-row">{TOKENS.map((t: any) => { const n = claims(account, t.symbol); const done = n >= 3; return (
            <div key={t.id} className={`faucet-tile ${done ? "done" : ""}`}>
              <span className="tok-ic">{t.symbol.replace(/^[tw]/, "").slice(0, 1)}</span>
              <div className="ft-txt"><b>+{t.faucet}</b><span>{t.symbol}</span></div>
              <span className="ft-lim">{n}/3 today</span>
              <button className="btn btn-dark btn-sm ft-btn" disabled={!!busy || done} onClick={() => faucet(t)}>{busy === "Faucet:" + t.symbol ? "Claiming…" : done ? "Limit reached" : "Claim"}</button>
            </div>); })}</div>
        </section>
        <section className="card card-pad">
          <h3 className="h3"><ArrowDown size={18} /> Deposit NEAR</h3>
          <label className="field"><span>Amount (NEAR)</span><input className="input mono" value={dep} onChange={(e) => setDep(e.target.value)} /></label>
          <SignPanel kind="NEAR tx to wrap.testnet: storage_deposit → near_deposit → ft_transfer_call(verifier)" gas="You pay ~0.001 NEAR from your topped-up account." />
          <button className="btn btn-dark btn-full" disabled={!!busy} onClick={deposit}>{busy === "Deposit" ? "Depositing…" : "Sign & deposit"}</button>
        </section>
        <section className="card card-pad">
          <h3 className="h3"><ArrowUp size={18} /> Withdraw</h3>
          <div className="field-row">
            <div className="field"><span>Token</span><Pick label="Token" value={wd.token} onChange={(v) => setWd({ ...wd, token: v })} options={TOKENS.map((t: any) => ({ value: t.id, label: t.symbol }))} /></div>
            <label className="field"><span>Amount</span><input className="input mono" value={wd.amount} onChange={(e) => setWd({ ...wd, amount: e.target.value })} placeholder="0.0" /></label>
          </div>
          <SignPanel kind={`ft_withdraw intent (NEP-413) → ${wt.contract}`} gas="Relayer pays. First withdraw of a token asks for a 0.00125 NEAR storage_deposit." />
          <button className="btn btn-dark btn-full" disabled={!!busy || !(Number(wd.amount) > 0)} onClick={withdraw}>{busy === "Withdraw" ? "Withdrawing…" : "Sign & withdraw"}</button>
        </section>
        <section className="card card-pad w-act">
          <h3 className="h3"><ClockCounterClockwise size={18} /> Activity</h3>
          {acts.length === 0 ? <p className="small muted">No wallet activity on this device yet.</p> : (
            <ul className="act-list">{acts.map((a) => <li key={a.tx}><b>{a.kind}</b><span>{a.detail}</span><span className="muted tiny">{new Date(a.at).toLocaleString()}</span><Tx hash={a.tx} /></li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}
