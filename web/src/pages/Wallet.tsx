import { useEffect, useState } from "react";
import { useToast } from "@unlocalhosted/metalui";
import { Drop, Coins, ClockCounterClockwise } from "@phosphor-icons/react";
import { Top, NeedSignIn } from "../app/Shell";
import { useApp } from "../app/state";
import { api } from "../lib/api";
import { balances } from "../lib/deal";
import { TOKENS, fromUnits, toUnits, VERIFIER } from "@shared/otc.mjs";
import { walletTx } from "../lib/wallet";
import { Pick } from "../components/ui";
import { Tx } from "../components/ui";

type Act = { kind: string; detail: string; tx: string; at: number };
const actKey = (a: string) => `otc-activity-${a}`;
const readActs = (a: string): Act[] => { try { return JSON.parse(localStorage.getItem(actKey(a)) || "[]"); } catch { return []; } };

const claimKey = (a: string, s: string) => `otc-claim-${new Date().toISOString().slice(0, 10)}-${a}-${s}`;
const claims = (a: string, s: string) => Number(localStorage.getItem(claimKey(a, s)) || 0);
const bump = (a: string, s: string) => localStorage.setItem(claimKey(a, s), String(claims(a, s) + 1));

export default function WalletPage() {
  const { account, kind, walletId } = useApp();
  const [depTok, setDepTok] = useState(TOKENS[1].id); const [depAmt, setDepAmt] = useState("");
  const toast = useToast();
  const [bal, setBal] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState("");
  const [acts, setActs] = useState<Act[]>([]);
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
  const deposit = () => { const t: any = TOKENS.find((x: any) => x.id === depTok); let units: string; try { units = toUnits(depAmt, t.decimals); } catch { return toast.show({ title: "Enter an amount", tone: "error" }); }
    return run("Deposit", `${depAmt} ${t.symbol} into Private OTC`, async () => {
      const calls = t.contract === "wrap.testnet"
        ? [{ method: "storage_deposit", args: { account_id: account, registration_only: true }, tgas: 10, deposit: "1250000000000000000000" }, { method: "near_deposit", args: {}, tgas: 10, deposit: units }, { method: "ft_transfer_call", args: { receiver_id: VERIFIER, amount: units, msg: account }, tgas: 100, deposit: "1" }]
        : [{ method: "ft_transfer_call", args: { receiver_id: VERIFIER, amount: units, msg: account }, tgas: 100, deposit: "1" }];
      return (await walletTx(t.contract, calls)) || "";
    }); };
  return (
    <>
      <Top title="Wallet" sub="Your test-token balances inside the NEAR Intents verifier. Deals settle straight from here; claim tokens from the faucet." />
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
        {kind === "wallet" && (
          <section className="card card-pad w-dep">
            <h3 className="h3"><Coins size={18} weight="duotone" /> Deposit from your wallet</h3>
            <p className="small muted">Move tokens from your {walletId?.replace(/-wallet$/, "") || "NEAR"} wallet into Private OTC so deals can settle. NEAR is wrapped to wNEAR in the same transaction. You pay a little gas.</p>
            <div className="field-row"><label className="field"><span>Amount</span><input className="input mono" inputMode="decimal" value={depAmt} onChange={(e) => setDepAmt(e.target.value.replace(",", "."))} placeholder="0.5" /></label>
              <div className="field"><span>Token</span><Pick label="Deposit token" value={depTok} onChange={setDepTok} options={TOKENS.map((x: any) => ({ value: x.id, label: x.symbol === "wNEAR" ? "NEAR → wNEAR" : x.symbol }))} /></div></div>
            <button className="btn btn-dark btn-sm" disabled={!!busy || !(Number(depAmt) > 0)} onClick={deposit}>{busy === "Deposit" ? "Waiting for wallet…" : "Deposit"}</button>
          </section>
        )}
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
