import { useEffect, useState } from "react";
import { useToast } from "@unlocalhosted/metalui";
import { Drop, Coins, ClockCounterClockwise, ArrowUp } from "@phosphor-icons/react";
import { Top, NeedSignIn } from "../app/Shell";
import { useApp } from "../app/state";
import { api } from "../lib/api";
import { balances, withdrawPayload } from "../lib/deal";
import { sendTx, viewCall, ensureFunded, balanceOf } from "../lib/privy";
import { TOKENS, fromUnits, toUnits, VERIFIER } from "@shared/otc.mjs";
import { tokenLabel } from "@shared/otc.mjs";
import { walletTx } from "../lib/wallet";
import { Pick, SignPanel, TokenIcon } from "../components/ui";
import { Tx } from "../components/ui";
import { Bridge } from "../components/Bridge";

const STORAGE = "1250000000000000000000"; // 0.00125 NEAR
type Act = { kind: string; detail: string; tx: string; at: number };
const actKey = (a: string) => `otc-activity-${a}`;
const readActs = (a: string): Act[] => { try { return JSON.parse(localStorage.getItem(actKey(a)) || "[]"); } catch { return []; } };

const initialBridge = () => { const p = new URLSearchParams(location.search); const d = p.get("bridge"); return d === "in" || d === "out" ? { direction: d as "in" | "out", asset: p.get("asset") || undefined, amount: p.get("amount") || undefined, chain: p.get("chain") || undefined } : undefined; };
const claimKey = (a: string, s: string) => `otc-tp-claim-${a}-${s}`;

export default function WalletPage() {
  const { account, kind, walletId } = useApp();
  const [depTok, setDepTok] = useState(TOKENS[1].id); const [depAmt, setDepAmt] = useState("");
  const [wdTok, setWdTok] = useState(TOKENS[0].id as string); const [wdAmt, setWdAmt] = useState("");
  const toast = useToast();
  const [bal, setBal] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState("");
  const [acts, setActs] = useState<Act[]>([]);
  const load = () => account && balances(account).then(setBal).catch(() => {});
  useEffect(() => { if (!account) return; setActs(readActs(account)); load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [account]);
  useEffect(() => { if (new URLSearchParams(location.search).get("bridge")) setTimeout(() => document.getElementById("bridge")?.scrollIntoView({ behavior: "smooth" }), 300);
    if (location.hash === "#faucet") setTimeout(() => document.getElementById("faucet")?.scrollIntoView({ behavior: "smooth" }), 200); }, []);
  if (!account) return <><Top title="Wallet" /><NeedSignIn what="Sign in to see your balances, claim test tokens and withdraw to your NEAR account." /></>;
  const record = (a: Act) => { const n = [a, ...readActs(account)].slice(0, 20); localStorage.setItem(actKey(account), JSON.stringify(n)); setActs(n); };
  const run = async (kind: string, detail: string, f: () => Promise<string>) => {
    try { setBusy(kind); const tx = await f(); record({ kind, detail, tx, at: Date.now() }); toast.show({ title: `${kind} done`, sub: tx ? `${detail} · https://testnet.nearblocks.io/txns/${tx}` : detail, tone: "success" }); setTimeout(load, 1500); }
    catch (e: any) { toast.show({ title: `${kind} failed`, sub: e.message, tone: "error" }); } finally { setBusy(""); }
  };
  const faucet = async () => { setBusy("Faucet"); try { const r = await api<any>("/api/faucet", { account }); localStorage.setItem(claimKey(account, "all"), String(Date.now())); const detail = TOKENS.map((t: any) => `+${t.faucet} ${t.symbol}`).join(", "); record({ kind: "Faucet", detail, tx: r.tx, at: Date.now() }); toast.show({ title: "Test tokens claimed", sub: `${detail} · via Tidepool`, tone: "success" }); setTimeout(load, 1500); } catch (e: any) { if (/rate limited/i.test(e.message)) localStorage.setItem(claimKey(account, "all"), String(Date.now())); toast.show({ title: "Faucet", sub: e.message, tone: "error" }); } finally { setBusy(""); } };
  const lastClaim = Number(localStorage.getItem(claimKey(account, "all")) || 0); const coolLeft = Math.max(0, lastClaim + 3600_000 - Date.now());
  const deposit = () => { const t: any = TOKENS.find((x: any) => x.id === depTok); let units: string; try { units = toUnits(depAmt, t.decimals); } catch { return toast.show({ title: "Enter an amount", tone: "error" }); }
    return run("Deposit", `${depAmt} ${t.symbol} into Private OTC`, async () => {
      const calls = [{ method: "ft_transfer_call", args: { receiver_id: VERIFIER, amount: units, msg: account }, tgas: 100, deposit: "1" }];
      return (await walletTx(t.contract, calls)) || "";
    }); };
  const wt: any = TOKENS.find((x: any) => x.id === wdTok)!;
  const wdMax = bal ? fromUnits(bal[wt.id] || "0", wt.decimals, wt.decimals) : "0";
  const withdraw = () => { let units: bigint; try { units = BigInt(toUnits(wdAmt, wt.decimals)); } catch { return toast.show({ title: "Enter a valid amount", tone: "error" }); }
    const have = BigInt(bal?.[wt.id] || "0");
    if (units <= 0n) return toast.show({ title: "Enter an amount above 0", tone: "error" });
    if (units > have) return toast.show({ title: "Not enough balance", sub: `You hold ${fromUnits(have.toString(), wt.decimals, 6)} ${wt.symbol} in the verifier.`, tone: "error" });
    return run("Withdraw", `${wdAmt} ${wt.symbol} to ${account.length > 24 ? account.slice(0, 10) + "…" + account.slice(-6) : account}`, async () => {
      // Receiver must exist on chain (Privy implicit accounts are created by the keeper top-up).
      if (kind !== "wallet") await ensureFunded(account).catch(() => {});
      if ((await balanceOf(account)) === 0n) throw new Error(`Your NEAR account ${account} doesn't exist on chain yet (it needs a little NEAR). Try again in a minute.`);
      // Receiver needs token storage (NEP-145), else ft_withdraw fails.
      const reg = await viewCall(wt.contract, "storage_balance_of", { account_id: account }).catch(() => null);
      if (!reg) {
        const call = [{ method: "storage_deposit", args: { account_id: account, registration_only: true }, deposit: STORAGE, tgas: 10 }];
        try { if (kind === "wallet") await walletTx(wt.contract, call); else await sendTx(account, wt.contract, call); }
        catch (e: any) { throw new Error(`Couldn't register ${wt.symbol} storage on your account (0.00125 NEAR): ${e.message}`); }
      }
      const signed = await withdrawPayload(account, wt.contract, units.toString());
      const r = await api<any>("/api/withdraw", { account, signed });
      setWdAmt(""); return r.tx || "";
    }); };
  return (
    <>
      <Top title="Wallet" sub="Your test-token balances inside the NEAR Intents verifier. Deals settle straight from here; claim from the faucet, deposit, or withdraw to your own account." />
      <div className="wallet-grid">
        <section className="card card-pad w-bal">
          <h3 className="h3"><Coins size={18} weight="duotone" /> Balances</h3>
          <div className="tok-grid">{TOKENS.map((t: any) => (
            <div key={t.id} className="tok"><span className="tok-sym">{t.symbol}</span><b className="mono tok-amt">{bal ? fromUnits(bal[t.id], t.decimals, 4) : "…"}</b><span className="tiny muted mono">{t.contract}</span></div>
          ))}</div>
          <p className="tiny muted w-explain">Balances shown are held in the NEAR Intents verifier. Deposit to trade, withdraw to move them back to your wallet. Deposits and withdrawals are public on chain; deal terms stay sealed until settlement.</p>
        </section>
        <section className="card card-pad w-faucet" id="faucet">
          <h3 className="h3"><Drop size={18} weight="duotone" /> Faucet</h3>
          <p className="small muted">Free Tidepool test tokens (no value), deposited straight into your verifier balance. One claim gives all six; Tidepool allows one claim per account per hour.</p>
          <div className="faucet-row">{TOKENS.map((t: any) => (
            <div key={t.id} className={`faucet-tile ${coolLeft ? "done" : ""}`}>
              <span className="tok-ic"><TokenIcon t={t.symbol} size={40} /></span>
              <div className="ft-txt"><b>+{t.faucet}</b><span>{t.symbol}</span></div>
            </div>))}</div>
          <button className="btn btn-dark btn-sm" style={{ marginTop: 12 }} disabled={!!busy || coolLeft > 0} onClick={faucet}>{busy === "Faucet" ? "Claiming…" : coolLeft ? `Next claim in ${Math.ceil(coolLeft / 60000)} min` : "Claim all six"}</button>
          <p className="tiny muted">Faucet by <a href="https://www.usetidepool.tech/docs/guides/faucet" target="_blank" rel="noreferrer">Tidepool</a>.</p>
        </section>
        {kind === "wallet" && (
          <section className="card card-pad w-dep">
            <h3 className="h3"><Coins size={18} weight="duotone" /> Deposit from your wallet</h3>
            <p className="small muted">Move tokens from your {walletId?.replace(/-wallet$/, "") || "NEAR"} wallet into Private OTC so deals can settle. You pay a little gas.</p>
            <div className="field-row"><label className="field"><span>Amount</span><input className="input mono" inputMode="decimal" value={depAmt} onChange={(e) => setDepAmt(e.target.value.replace(",", "."))} placeholder="0.5" /></label>
              <div className="field"><span>Token</span><Pick label="Deposit token" value={depTok} onChange={setDepTok} options={TOKENS.map((x: any) => ({ value: x.id, label: tokenLabel(x) }))} /></div></div>
            <button className="btn btn-dark btn-sm" disabled={!!busy || !(Number(depAmt) > 0)} onClick={deposit}>{busy === "Deposit" ? "Waiting for wallet…" : "Deposit"}</button>
          </section>
        )}
        <section className="card card-pad w-wd">
          <h3 className="h3"><ArrowUp size={18} /> Withdraw</h3>
          <p className="small muted">Move tokens from the verifier back to your own NEAR account <span className="mono">{account}</span>. You sign a withdrawal intent; the relayer pays the gas.</p>
          <div className="field-row">
            <div className="field"><span>Token</span><Pick label="Withdraw token" value={wdTok} onChange={(v: string) => { setWdTok(v); setWdAmt(""); }} options={TOKENS.map((x: any) => ({ value: x.id, label: tokenLabel(x) }))} /></div>
            <label className="field"><span>Amount <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 6, padding: "0 8px", minHeight: 0, fontSize: 11 }} onClick={() => setWdAmt(wdMax)} disabled={!bal}>Max</button></span><input className="input mono" inputMode="decimal" value={wdAmt} onChange={(e) => setWdAmt(e.target.value.replace(",", "."))} placeholder="0.0" /></label>
          </div>
          <p className="tiny muted">Available: <span className="mono">{bal ? fromUnits(bal[wt.id] || "0", wt.decimals, 6) : "…"} {wt.symbol}</span></p>
          <SignPanel kind={`ft_withdraw intent (NEP-413) → ${wt.contract}, receiver ${account}`} gas="Relayer pays. The first withdrawal of a token asks for a 0.00125 NEAR storage_deposit from your account." />
          <button className="btn btn-dark btn-sm" disabled={!!busy || !(Number(wdAmt) > 0)} onClick={withdraw}>{busy === "Withdraw" ? "Withdrawing…" : "Sign & withdraw"}</button>
        </section>
        <div id="bridge"><Bridge account={account} balances={bal} initial={initialBridge()} onDone={load} /></div>
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
