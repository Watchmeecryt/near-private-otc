import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useToast } from "@unlocalhosted/metalui";
import { CheckCircle, ArrowsLeftRight, XCircle, Eye, Copy, Prohibit } from "@phosphor-icons/react";
import { Top, NeedSignIn } from "../app/Shell";
import { useApp } from "../app/state";
import { api, type Coarse, type MyDeal, type Revealed, type Terms, type OfferMeta } from "../lib/api";
import { reveal, cachedReveal, signedOffer, cancelPayloads, fmt, sym, requestAccess, signApproval } from "../lib/deal";
import { walletCanSign } from "../lib/wallet";
import { isWallet } from "../lib/signer";
import { StatusChip, SignPanel, PrivacyNote, Steps, Tx, useNow } from "../components/ui";
import { countdown, short } from "../lib/format";
import { toUnits, fromUnits, tokenById } from "@shared/otc.mjs";
import { usePrices, vsMarket, fmtPct } from "../lib/prices";
const human = (id: string, u: string) => Number(fromUnits(u, tokenById(id).decimals, 18));

const mirror = (t: Terms): Terms => ({ sell_token: t.buy_token, sell_amount: t.buy_amount, buy_token: t.sell_token, buy_amount: t.sell_amount });
const who = (a: string, me: string | null) => (a === me ? "You" : a === "*" ? "anyone" : short(a, 6, 4));

export default function Deal() {
  const { id = "" } = useParams();
  const { account } = useApp();
  const toast = useToast(); const now = useNow(1000);
  const prices = usePrices();
  const mk = (t: Terms) => vsMarket(prices, t.sell_token, human(t.sell_token, t.sell_amount), t.buy_token, human(t.buy_token, t.buy_amount));
  const Mkt = ({ t, who: w }: { t: Terms; who: string }) => { const d = mk(t); return d === null ? null : <span className={`mkt-tag ${Math.abs(d) < 0.5 ? "" : d > 0 ? "up" : "down"}`} title={`${w} asks ${fmtPct(d)} vs CoinGecko market`}>{fmtPct(d)} vs market</span>; };
  const [d, setD] = useState<Coarse | null>(null);
  const [my, setMy] = useState<MyDeal | null>(null);
  const [rev, setRev] = useState<Revealed[] | null>(null);
  const [busy, setBusy] = useState("");
  const [mode, setMode] = useState<null | "accept" | "counter">(null);
  const [give, setGive] = useState(""); const [get, setGet] = useState("");
  const load = useCallback(async () => {
    api<Coarse>(`/api/deals/${id}`).then(setD).catch(() => setD(null));
    if (account) api<MyDeal[]>(`/api/my?account=${account}`).then((l) => setMy(l.find((x) => x.id === id) || null)).catch(() => {});
  }, [id, account]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (account) setRev(cachedReveal(account, id)); }, [account, id]);

    if (!d) return <><Top title="Deal" /><div className="card card-pad muted">Loading… (or this deal does not exist)</div></>;
  const me = account;
  const offers: (OfferMeta & { r?: Revealed })[] = (my?.offers || []).map((o) => ({ ...o, r: rev?.find((x) => x.commitment === o.commitment) }));
  const open = offers.find((o) => o.kind === "open") || (rev?.find((x) => x.to === "*") ? { id: "o1", kind: "open", from: rev!.find((x) => x.to === "*")!.from, to: "*", status: "live", r: rev!.find((x) => x.to === "*") } as any : null);
  const isMaker = !!me && (my?.role === "maker");
  const live = d.status === "Open";
  // The offer I can act on: newest live counter to me, else (as a taker without a live counter of my own) the opening offer.
  const toMe = [...offers].reverse().find((o) => o.status === "live" && o.to === me && o.kind === "counter");
  const myLiveCounter = offers.some((o) => o.status === "live" && o.from === me && o.kind === "counter");
  const target = live && me ? (toMe || (!isMaker && !myLiveCounter && open?.status === "live" ? open : null)) : null;
  const targetTerms = target?.r?.terms;
  const step = d.status === "Settled" ? 3 : offers.some((o) => o.kind === "counter") ? 2 : rev ? 1 : 0;
  const deadlineMs = Date.parse(d.deadline);

  const myReq = my?.my_request?.status as string | undefined;
  const canSign = !isWallet(me) || walletCanSign();
  const doRequest = async () => { try { setBusy("Enclave is checking your funds (~10 s)…"); const r = await requestAccess(me!, id); toast.show({ title: r.request.status === "approved" ? "Approved" : "Request sent", sub: r.request.status === "approved" ? "This maker auto-approves anyone with funds. Open the terms now." : "Funds check passed. The maker will see your request.", tone: "success" }); load(); } catch (e: any) { toast.show({ title: "Request refused", sub: e.message, tone: "error" }); } finally { setBusy(""); } };
  const decide = async (requester: string, decision: "approve" | "decline") => { try { setBusy("Signing approval…"); const approval = decision === "approve" ? await signApproval(me!, id, requester) : undefined; setBusy("Checking approval in the enclave…"); await api(`/api/deals/${id}/approve`, { account: me, requester, decision, approval }); toast.show({ title: decision === "approve" ? "Approved" : "Declined", tone: "success" }); load(); } catch (e: any) { toast.show({ title: "Failed", sub: e.message, tone: "error" }); } finally { setBusy(""); } };
  const setAuto = async (on: boolean) => { try { setBusy("Updating…"); const approval = on ? await signApproval(me!, id, "*") : undefined; await api(`/api/deals/${id}/auto`, { account: me, approval, off: !on }); toast.show({ title: on ? "Auto-approve on" : "Auto-approve off", sub: on ? "Anyone who passes the funds check sees the terms right away." : undefined, tone: "success" }); load(); } catch (e: any) { toast.show({ title: "Failed", sub: e.message, tone: "error" }); } finally { setBusy(""); } };
  const doReveal = async () => { try { setBusy("Asking the enclave (OutLayer TEE, ~10 s)…"); const r = await reveal(me!, id); setRev(r.offers); load(); } catch (e: any) { toast.show({ title: "Could not reveal", sub: e.message, tone: "error" }); } finally { setBusy(""); } };
  const startCounter = () => { if (!targetTerms) return; const m = mirror(targetTerms); setGive(fromUnits(m.sell_amount, tokenById(m.sell_token).decimals, 18)); setGet(fromUnits(m.buy_amount, tokenById(m.buy_token).decimals, 18)); setMode("counter"); };
  const counterTerms = (): Terms | null => { if (!targetTerms) return null; try { const m = mirror(targetTerms); return { ...m, sell_amount: toUnits(give, tokenById(m.sell_token).decimals), buy_amount: toUnits(get, tokenById(m.buy_token).decimals) }; } catch { return null; } };
  const send = async (kind: "accept" | "counter") => {
    const terms = kind === "accept" ? mirror(targetTerms!) : counterTerms();
    if (!terms || !target) return;
    try {
      setBusy("Signing your intent…");
      const s = await signedOffer({ account: me!, deal: id, to: target.from, terms, deadlineMs });
      setBusy(kind === "accept" ? "Enclave matching + execute_intents…" : "Sealing your counter…");
      const r = await api<any>(`/api/deals/${id}/offer`, { ...s, account: me, kind, reply_to: target.id });
      toast.show({ title: kind === "accept" ? "Settled atomically" : "Counter sent", sub: r.tx ? `tx ${r.tx.slice(0, 10)}…` : "Only the other party can read it.", tone: "success" });
      setMode(null); await doReveal();
    } catch (e: any) { toast.show({ title: "Failed", sub: e.message, tone: "error" }); } finally { setBusy(""); }
  };
  const decline = async () => { try { await api(`/api/deals/${id}/decline`, { account: me, offer_id: target!.id }); toast.show({ title: "Declined", tone: "success" }); load(); } catch (e: any) { toast.show({ title: "Failed", sub: e.message, tone: "error" }); } };
  const cancel = async () => {
    try {
      setBusy("Signing nonce invalidation…");
      const nonces = offers.filter((o) => o.from === me && o.status === "live").map((o) => o.nonce);
      const signed = await cancelPayloads(me!, nonces);
      setBusy("Burning nonces on the verifier…");
      const r = await api<any>(`/api/deals/${id}/cancel`, { account: me, signed });
      toast.show({ title: "Deal cancelled", sub: `tx ${r.tx.slice(0, 10)}…`, tone: "success" }); load();
    } catch (e: any) { toast.show({ title: "Failed", sub: e.message, tone: "error" }); } finally { setBusy(""); }
  };
  const publicDealStatus = d.status === "Open";
  const publish = async () => { if (!confirm("Make this deal public? It will appear on the board, and it can't be made private again.")) return; try { await api(`/api/deals/${id}/publish`, { account: me }); toast.show({ title: "Deal is now public", tone: "success" }); load(); } catch (e: any) { toast.show({ title: "Failed", sub: e.message, tone: "error" }); } };
  const share = async () => { try { await navigator.clipboard.writeText(`${location.origin}/d/${id}`); toast.show({ title: "Link copied", sub: `${location.host}/d/${id}`, tone: "success" }); } catch {} };

  return (
    <>
      <Top title={`${d.side === "sell" ? "Selling" : "Buying"} ${d.pair.split("/")[0]}`} sub={`Deal ${id} · paid in ${d.pair.split("/")[1]}`}>
        <button className="btn btn-ghost btn-sm" onClick={share}><Copy size={15} /> Copy link</button>
      </Top>
      <div className="deal-wrap">
        <div className="card card-pad">
          <Steps at={step} />
          <dl className="kv-mini" style={{ marginTop: 12 }}>
            <dt>Status</dt><dd><StatusChip s={my?.my_status || d.status} /></dd>
            <dt>Visibility</dt><dd>{d.visibility === "private" ? <><span className="chip chip-muted">Private · link only</span>{isMaker && publicDealStatus && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={publish}>Make public</button>}{isMaker && <p className="tiny muted" style={{ margin: "4px 0 0" }}>Not on the board. Anyone signed in with the link can open, counter or accept. Making it public can't be undone.</p>}</> : <><span className="chip chip-muted">Public · on the board</span>{isMaker && <p className="tiny muted" style={{ margin: "4px 0 0" }}>Public deals can't be made private again: others may already have seen it.</p>}</>}</dd>
            <dt>Counter-offers</dt><dd>{d.counters}</dd>
            <dt>Expires</dt><dd>{deadlineMs > now ? countdown(deadlineMs - now) : "ended"}</dd>
            {isMaker && <><dt>Viewed by</dt><dd>{my?.views?.length ? <ul className="view-log">{[...my.views].reverse().slice(0, 20).map((v, i) => <li key={i}><span className="mono">{short(v.account, 8, 4)}</span> <span className="muted tiny">{new Date(v.at).toLocaleString()}</span></li>)}</ul> : "Nobody yet"}</dd></>}
            <dt>On chain</dt><dd><Tx hash={d.check_tx} label="sealed" /> {d.settle_tx && <Tx hash={d.settle_tx} label="settled" />}</dd>
          </dl>
        </div>

        {!me ? <NeedSignIn what="Sign in to request the exact terms." /> : (
          <div className="card card-pad">
            <div className="row-between"><h3 className="h3">Private terms</h3>{rev && <span className="chip chip-green">visible to you only</span>}</div>
            {!canSign && <p className="wallet-note">This wallet can't sign messages here, so it can't request or trade. Connect Meteor, HOT, Intear, HERE or MyNearWallet, or sign in with email.</p>}
            {!rev ? (isMaker || myReq === "approved") ? (
              <>
                <p className="muted small">{isMaker ? "Your terms are sealed. The enclave re-seals them to a one-time key in this browser." : "The maker approved you. The enclave re-seals the exact terms to a one-time key in this browser; nobody else, including the operator, can read them."}</p>
                <button className="btn btn-dark btn-full" disabled={!!busy || !canSign} onClick={doReveal}><Eye size={16} weight="bold" /> {busy || (isMaker ? "Open my deal" : "Open the terms")}</button>
              </>
            ) : myReq === "pending" ? (
              <p className="muted small">Request sent. You passed the funds check; waiting for the maker to approve you.{d.auto_approve && <> The maker just turned on auto-approve: <button className="link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={doRequest}>check again</button>.</>}</p>
            ) : (
              <>
                <p className="muted small">{myReq === "declined" ? "The maker declined your last request. You can ask again." : <>To see the exact terms, request access. The enclave privately checks that you hold enough <b>{d.side === "sell" ? d.pair.split("/")[1] : d.pair.split("/")[0]}</b> (in Private OTC or your wallet) to fill this deal, without telling anyone the amount. {d.auto_approve ? "This maker auto-approves anyone who passes." : "Then the maker approves you."}</>}</p>
                <button className="btn btn-dark btn-full" disabled={!!busy || !live || !canSign} onClick={doRequest}><Eye size={16} weight="bold" /> {busy || "Request terms"}</button>
              </>
            ) : (
              <ul className="thread">
                {offers.filter((o) => o.r || o.kind !== "open").map((o) => (
                  <li key={o.id} className={`th-item ${o.status}`}>
                    <div className="th-top"><b>{o.kind === "open" ? "Listing" : o.kind === "counter" ? "Counter" : "Accept"}</b><span className="muted">{who(o.from, me)} → {who(o.to, me)}</span><span className={`chip ${o.status === "live" ? "chip-blue" : o.status === "settled" ? "chip-green" : "chip-muted"}`}>{o.status}</span></div>
                    {o.r ? <div className="mono th-terms">{who(o.from, me)} give{o.from === me ? "" : "s"} {fmt(o.r.terms.sell_token, o.r.terms.sell_amount)} · get{o.from === me ? "" : "s"} {fmt(o.r.terms.buy_token, o.r.terms.buy_amount)}<div style={{ marginTop: 4 }}><Mkt t={o.r.terms} who={who(o.from, me)} /><span className="tiny muted">for {who(o.from, me)}</span></div>{o.r.note && <div className="muted">“{o.r.note}”</div>}</div> : <div className="muted small">Sealed. Tap refresh to re-open.</div>}
                  </li>
                ))}
              </ul>
            )}
            {rev && <button className="btn btn-text btn-sm" disabled={!!busy} onClick={doReveal}>{busy || "Refresh private view"}</button>}

            {rev && target && targetTerms && !mode && (
              <div className="actions3">
                <button className="act ok" onClick={() => setMode("accept")}><CheckCircle size={20} weight="fill" />Accept</button>
                <button className="act" onClick={startCounter}><ArrowsLeftRight size={20} weight="bold" />Counter</button>
                {target.kind === "counter" && <button className="act no" onClick={decline}><XCircle size={20} weight="fill" />Decline</button>}
              </div>
            )}
            {mode === "accept" && targetTerms && (
              <SignPanel kind="Mirror token_diff (settles now)" terms={mirror(targetTerms)} deadline={deadlineMs} gas="Paid by the Private OTC relayer (execute_intents).">
                <p className="tiny muted">Both signed intents go to the enclave, which checks they are exact mirror images, then to execute_intents. All or nothing.</p>
                <div className="row-gap"><button className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>Back</button><button className="btn btn-dark btn-sm" disabled={!!busy} onClick={() => send("accept")}>{busy || "Sign & settle"}</button></div>
              </SignPanel>
            )}
            {mode === "counter" && targetTerms && (
              <div className="form-narrow" style={{ marginTop: 12 }}>
                <div className="field-row">
                  <label className="field"><span>You give ({sym(targetTerms.buy_token)})</span><input className="input mono" value={give} onChange={(e) => setGive(e.target.value)} /></label>
                  <label className="field"><span>You get ({sym(targetTerms.sell_token)})</span><input className="input mono" value={get} onChange={(e) => setGet(e.target.value)} /></label>
                </div>
                {counterTerms() && <p className="tiny"><Mkt t={counterTerms()!} who="You" /> <span className="muted">for you, at CoinGecko reference prices</span></p>}
                {counterTerms() && <SignPanel kind="Counter token_diff, sealed to the enclave" terms={counterTerms()!} deadline={deadlineMs} gas="None until settlement (relayer pays)." />}
                <div className="row-gap"><button className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>Back</button><button className="btn btn-dark btn-sm" disabled={!counterTerms() || !!busy} onClick={() => send("counter")}>{busy || "Sign & send counter"}</button></div>
              </div>
            )}
            {isMaker && (
              <div style={{ marginTop: 16 }}>
                <div className="row-between"><h3 className="h3">Requests</h3><label className="tiny" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!d.auto_approve} disabled={!!busy || !live} onChange={(e) => setAuto(e.target.checked)} /> Auto-approve anyone with funds</label></div>
                {my?.requests?.length ? <ul className="req-list">{[...my.requests].reverse().map((q) => (
                  <li key={q.account}><span className="mono" title={q.account}>{short(q.account, 10, 4)}</span><span className="tiny muted">funds ✓ · {new Date(q.at).toLocaleString()}</span>
                    {q.status === "pending" && live ? <span className="row-gap"><button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => decide(q.account, "decline")}>Decline</button><button className="btn btn-dark btn-sm" disabled={!!busy} onClick={() => decide(q.account, "approve")}>Approve</button></span> : <span className={`chip ${q.status === "approved" ? "chip-green" : "chip-muted"}`}>{q.status}{q.auto ? " (auto)" : ""}</span>}</li>))}</ul>
                  : <p className="muted small">No requests yet. Everyone who requests has already passed the enclave's funds check.</p>}
              </div>
            )}
            {isMaker && live && <button className="btn btn-text btn-sm danger" disabled={!!busy} onClick={cancel}><Prohibit size={14} /> Cancel deal (burn nonces)</button>}
          </div>
        )}
        <PrivacyNote />
        <p className="tiny muted">Short link: <span className="mono">{location.host}/d/{id}</span> <button className="icon-btn acct-btn" onClick={share} aria-label="Copy link"><Copy size={12} /></button> · <Link className="link" to="/app/how">How settlement works</Link></p>
      </div>
    </>
  );
}
