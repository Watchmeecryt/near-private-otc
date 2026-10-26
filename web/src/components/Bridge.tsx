// Cross-chain in / out for a verifier balance, through the 1Click API: Tidepool (https://www.usetidepool.tech,
// a community-built 1Click-compatible API with EVM testnet bridges) on testnet, NEAR's official 1Click on
// mainnet. Deals themselves always settle inside NEAR Intents; this only funds or pays out a balance.
import { useEffect, useState } from "react";
import { useToast } from "@unlocalhosted/metalui";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { transferPayload } from "../lib/deal";
import { TOKENS, CHAINS, bridged, chainOf, fromUnits, toUnits, tokenById, tokenLabel } from "@shared/otc.mjs";
import { Pick, TokenIcon } from "./ui";

const EVM = CHAINS.filter((c: any) => c.key !== "near");
const pad = (h: string) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const hist = (a: string) => `otc-bridge-${a}`;

async function sendErc20(chainId: number, token: string, to: string, units: string) {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No browser EVM wallet found. Send the tokens to the deposit address from any wallet instead.");
  const [from] = await eth.request({ method: "eth_requestAccounts" });
  try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + chainId.toString(16) }] }); }
  catch { throw new Error(`Switch your wallet to chain ${chainId} and try again.`); }
  const data = "0xa9059cbb" + pad(to) + pad(BigInt(units).toString(16));
  return eth.request({ method: "eth_sendTransaction", params: [{ from, to: token, data }] }) as Promise<string>;
}

export type BridgeProps = { account: string; balances?: Record<string, string> | null; initial?: { direction?: "in" | "out"; asset?: string; amount?: string; chain?: string }; compact?: boolean; onDone?: () => void };

export function Bridge({ account, balances, initial, compact, onDone }: BridgeProps) {
  const toast = useToast();
  const [dir, setDir] = useState<"in" | "out">(initial?.direction || "in");
  const [chain, setChain] = useState(initial?.chain || "base");
  const [base, setBase] = useState("USDC");
  const [asset, setAsset] = useState(initial?.asset || TOKENS[0].id);
  const [amount, setAmount] = useState(initial?.amount || "");
  const [evm, setEvm] = useState(localStorage.getItem("otc-evm-addr") || "");
  const [q, setQ] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState<any>(null);
  const [list, setList] = useState<any[]>(() => { try { return JSON.parse(localStorage.getItem(hist(account)) || "[]"); } catch { return []; } });
  const ext: any = bridged(chain, base), t: any = tokenById(asset);
  useEffect(() => { if (!q?.depositAddress) return; let on = true; const tick = () => api(`/api/bridge/status?depositAddress=${encodeURIComponent(q.depositAddress)}`).then((s) => { if (on) setStatus(s); if (["SUCCESS", "REFUNDED", "FAILED"].includes(s.status)) { onDone?.(); } }).catch(() => {}); tick(); const i = setInterval(tick, 5000); return () => { on = false; clearInterval(i); }; }, [q?.depositAddress]);
  const remember = (r: any) => { const n = [r, ...list].slice(0, 10); setList(n); localStorage.setItem(hist(account), JSON.stringify(n)); };

  const getQuote = async () => {
    setBusy("quote"); setQ(null); setStatus(null);
    try { localStorage.setItem("otc-evm-addr", evm); const r = await api("/api/bridge/quote", { account, direction: dir, chain, base, asset, amount, evm }); setQ(r); remember({ at: Date.now(), dir, chain, base, asset, amount, depositAddress: r.depositAddress }); }
    catch (e: any) { toast.show({ title: "No quote", sub: e.message, tone: "error" }); } finally { setBusy(""); }
  };
  const payOut = async () => {
    setBusy("send");
    try { const signed = await transferPayload(account, q.depositAddress, q.asset, q.amountIn); const r = await api("/api/bridge/send", { account, signed, depositAddress: q.depositAddress }); toast.show({ title: "Payout started", sub: `NEAR tx ${r.tx.slice(0, 10)}…, delivery on ${chainOf(chain).name} in ~1 min`, tone: "success" }); }
    catch (e: any) { toast.show({ title: "Payout failed", sub: e.message, tone: "error" }); } finally { setBusy(""); }
  };
  const payIn = async () => {
    setBusy("send");
    try { const h = await sendErc20(chainOf(chain).chainId, q.evmToken, q.depositAddress, q.amountIn); await api("/api/bridge/submit", { account, txHash: h, depositAddress: q.depositAddress }); toast.show({ title: "Deposit sent", sub: `${chainOf(chain).name} tx ${h.slice(0, 10)}…`, tone: "success" }); }
    catch (e: any) { toast.show({ title: "Deposit not sent", sub: e.message, tone: "error" }); } finally { setBusy(""); }
  };
  const have = balances && t ? fromUnits(balances[t.id] || "0", t.decimals, 6) : null;
  const assets = TOKENS.filter((x: any) => x.id !== ext?.id);
  const ex = chainOf(chain)?.explorer;

  return (
    <section className={`card card-pad w-bridge${compact ? " compact" : ""}`}>
      <h3 className="h3"><ArrowsLeftRight size={18} /> Cross-chain {dir === "in" ? "deposit" : "payout"}</h3>
      <p className="small muted">{dir === "in" ? "Fund your NEAR Intents balance from an EVM testnet." : "Send part of your NEAR Intents balance to an EVM testnet address."} Routed by the 1Click API: on testnet <a href="https://www.usetidepool.tech" target="_blank" rel="noreferrer">Tidepool</a>, a community-built 1Click-compatible API with testnet bridges; on mainnet, NEAR's official 1Click. Deals still settle inside NEAR Intents.</p>
      <div className="seg" role="tablist">
        <button className={`btn btn-sm ${dir === "in" ? "btn-dark" : "btn-ghost"}`} onClick={() => { setDir("in"); setQ(null); }}>Deposit from chain</button>
        <button className={`btn btn-sm ${dir === "out" ? "btn-dark" : "btn-ghost"}`} onClick={() => { setDir("out"); setQ(null); }}>Withdraw to chain</button>
      </div>
      <div className="field-row">
        <div className="field"><span>{dir === "in" ? "From chain" : "To chain"}</span><Pick label="Chain" value={chain} onChange={(v: string) => { setChain(v); setQ(null); }} options={EVM.map((c: any) => ({ value: c.key, label: c.name }))} /></div>
        <div className="field"><span>{dir === "in" ? "Send token" : "Receive token"}</span><Pick label="EVM token" value={base} onChange={(v: string) => { setBase(v); setQ(null); }} options={["USDC", "USDT"].map((b) => ({ value: b, label: b, lead: <TokenIcon t={bridged(chain, b)?.id || b} size={18} /> }))} /></div>
      </div>
      <div className="field-row">
        <div className="field"><span>{dir === "in" ? "Credit as (NEAR Intents)" : "Pay from (NEAR Intents)"}</span><Pick label="Balance token" value={asset} onChange={(v: string) => { setAsset(v); setQ(null); }} options={assets.map((x: any) => ({ value: x.id, label: tokenLabel(x), lead: <TokenIcon t={x.id} size={18} /> }))} /></div>
        <label className="field"><span>Amount ({dir === "in" ? base : t?.symbol})</span><input className="input mono" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setQ(null); }} placeholder="0.0" /></label>
      </div>
      {dir === "out" && have !== null && <p className="tiny muted">Available: <span className="mono">{have} {t?.symbol}</span></p>}
      <label className="field"><span>{dir === "in" ? "Your EVM address (refunds go here)" : `Recipient on ${chainOf(chain)?.name}`}</span><input className="input mono" value={evm} onChange={(e) => { setEvm(e.target.value.trim()); setQ(null); }} placeholder="0x…" /></label>
      <button className="btn btn-ghost btn-sm" disabled={!!busy || !(Number(amount) > 0) || !/^0x[0-9a-fA-F]{40}$/.test(evm)} onClick={getQuote}>{busy === "quote" ? "Quoting…" : "Get quote"}</button>
      {q && (
        <div className="bridge-q">
          <p className="small">{dir === "in"
            ? <>Send <b className="mono">{fromUnits(q.amountIn, 6)} {base}</b> on {chainOf(chain).name} to <span className="mono">{q.depositAddress}</span>. You get about <b className="mono">{q.amountOutFormatted} {t.symbol}</b> in your NEAR Intents balance.</>
            : <>Pay <b className="mono">{fromUnits(q.amountIn, t.decimals)} {t.symbol}</b> from your balance; <span className="mono">{evm.slice(0, 8)}…{evm.slice(-4)}</span> receives about <b className="mono">{q.amountOutFormatted} {base}</b> on {chainOf(chain).name}.</>}
          </p>
          <p className="tiny muted">Quote by {q.provider}. Same-asset conversions (USDC↔USDC) carry a small 1Click fee. Expires in 1 hour.</p>
          {dir === "in"
            ? <div className="row-gap"><button className="btn btn-dark btn-sm" disabled={!!busy} onClick={payIn}>{busy === "send" ? "Confirm in wallet…" : "Send with browser wallet"}</button><button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(q.depositAddress)}>Copy deposit address</button></div>
            : <button className="btn btn-dark btn-sm" disabled={!!busy} onClick={payOut}>{busy === "send" ? "Signing…" : "Sign & send"}</button>}
          {status && <p className="tiny">Status: <b>{status.status}</b>{(status.swapDetails?.destinationChainTxHashes || []).map((h: any) => <a key={h.hash} className="mono" href={h.explorerUrl} target="_blank" rel="noreferrer"> {h.hash.slice(0, 10)}…</a>)}{(status.swapDetails?.originChainTxHashes || []).filter((h: any) => h.hash.startsWith("0x")).map((h: any) => <a key={h.hash} className="mono" href={h.explorerUrl} target="_blank" rel="noreferrer"> in:{h.hash.slice(0, 8)}…</a>)}</p>}
          {ex && dir === "in" && <p className="tiny muted">Track the vault deposit on <a href={`${ex}/address/${q.depositAddress}`} target="_blank" rel="noreferrer">{chainOf(chain).name} explorer</a>.</p>}
        </div>
      )}
      {!compact && list.length > 0 && <details className="tiny"><summary>Recent cross-chain quotes on this device</summary><ul>{list.map((r) => <li key={r.depositAddress} className="mono">{new Date(r.at).toLocaleString()} · {r.dir} · {r.amount} · {chainOf(r.chain)?.name} · {r.depositAddress?.slice(0, 14)}…</li>)}</ul></details>}
    </section>
  );
}
