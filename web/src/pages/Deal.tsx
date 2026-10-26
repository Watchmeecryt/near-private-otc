import { Bridge } from "../components/Bridge";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useToast } from "@unlocalhosted/metalui";
import { CheckCircle, ArrowsLeftRight, XCircle, Eye, Prohibit, Tag, ArrowClockwise, UsersThree, LinkSimple, CaretDown, LockSimple, Globe } from "@phosphor-icons/react";
import { NeedSignIn } from "../app/Shell";
import { useApp } from "../app/state";
import { api, type Coarse, type MyDeal, type Revealed, type Terms, type OfferMeta } from "../lib/api";
import { reveal, cachedReveal, signedOffer, cancelPayloads, fmt, requestAccess, signApproval } from "../lib/deal";
import { walletCanSign } from "../lib/wallet";
import { isWallet } from "../lib/signer";
import { StatusChip, SignPanel, PrivacyNote, Steps, Tx, useNow, PairIcon, TokenIcon } from "../components/ui";
import { Persona } from "../components/Persona";
import { countdown, short } from "../lib/format";
import { toUnits, fromUnits, tokenById } from "@shared/otc.mjs";
import { usePrices, vsMarket, fmtPct } from "../lib/prices";

const human = (id: string, u: string) => Number(fromUnits(u, tokenById(id).decimals, 18));
const mirror = (t: Terms): Terms => ({ sell_token: t.buy_token, sell_amount: t.buy_amount, buy_token: t.sell_token, buy_amount: t.sell_amount });
const sy = (id: string) => tokenById(id)?.symbol || id;
const ago = (ms: number) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
type Row = OfferMeta & { r?: Revealed };

export default function Deal() {
  const { id = "" } = useParams();
  const { account: me } = useApp();
  const toast = useToast(); const now = useNow(1000);
  const prices = usePrices();
  const [d, setD] = useState<Coarse | null>(null);
  const [my, setMy] = useState<MyDeal | null>(null);
  const [rev, setRev] = useState<Revealed[] | null>(null);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"talk" | "req" | "info">("talk");
  const [mode, setMode] = useState<null | "accept" | "counter">(null);
  const [give, setGive] = useState(""); const [get, setGet] = useState(""); const [note, setNote] = useState("");
  const [peer, setPeer] = useState<string | null>(null);
  const [allViews, setAllViews] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    api<Coarse>(`/api/deals/${id}`).then(setD).catch(() => setD(null));
    if (me) api<MyDeal[]>(`/api/my?account=${me}`).then((l) => setMy(l.find((x) => x.id === id) || null)).catch(() => {});
  }, [id, me]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (me) setRev(cachedReveal(me, id)); }, [me, id]);

  const isMaker = !!me && my?.role === "maker";
  const offers: Row[] = (my?.offers || []).map((o) => ({ ...o, r: rev?.find((x) => x.commitment === o.commitment) }));
  const openRow: Row | null = offers.find((o) => o.kind === "open") || (rev?.find((x) => x.to === "*") ? { id: "o1", kind: "open", from: rev!.find((x) => x.to === "*")!.from, to: "*", status: "live", nonce: "", at: 0, commitment: rev!.find((x) => x.to === "*")!.commitment, tx: "", r: rev!.find((x) => x.to === "*") } : null);
  const maker = isMaker ? me! : openRow?.from || null;
  // Counterparties (maker view): everyone who countered or accepted.
  const peers = useMemo(() => Array.from(new Set(offers.filter((o) => o.kind !== "open").map((o) => (o.from === me ? o.to : o.from)).filter((a) => a && a !== "*"))), [my, rev]);
  useEffect(() => { if (isMaker && !peer && peers.length) setPeer(peers[peers.length - 1]); }, [isMaker, peers.length]);
  const other = isMaker ? peer : maker;
  const thread: Row[] = [openRow, ...offers.filter((o) => o.kind !== "open" && (isMaker ? (o.from === peer || o.to === peer) : true))].filter(Boolean) as Row[];

  const live = d?.status === "Open";
  const toMe = [...thread].reverse().find((o) => o.status === "live" && o.to === me && o.kind === "counter");
  const myLiveCounter = thread.some((o) => o.status === "live" && o.from === me && o.kind === "counter");
  const target = live && me ? (toMe || (!isMaker && !myLiveCounter && openRow?.status === "live" ? openRow : null)) : null;
  const targetTerms = target?.r?.terms;
  const step = d?.status === "Settled" ? 3 : offers.some((o) => o.kind === "counter") ? 2 : rev ? 1 : 0;
  const deadlineMs = d ? Date.parse(d.deadline) : 0;
  const myReq = my?.my_request?.status as string | undefined;
  const canSign = !isWallet(me) || walletCanSign();
  const pending = (my?.request_list || []).filter((q) => q.status === "pending").length;

  // Auto-refresh the private view when a new sealed offer appears that we haven't opened yet.
  const unseen = offers.some((o) => !o.r && (isMaker || o.kind === "open" || o.from === me || o.to === me));
  const autoKey = offers.map((o) => o.id + o.status).join(",");
  useEffect(() => { if (rev && unseen && !busy && canSign) doReveal(true); }, [autoKey]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [thread.length, rev, peer, mode]);

  const err = (title: string) => (e: any) => toast.show({ title, sub: e.message, tone: "error" });
  async function doReveal(quiet = false) { try { setBusy(quiet ? "sync" : "Opening sealed terms (~10 s)…"); const r = await reveal(me!, id); setRev(r.offers); load(); } catch (e: any) { if (!quiet) err("Could not open terms")(e); } finally { setBusy(""); } }
  const doRequest = async () => { try { setBusy("Checking your sign-in and balance (~10 s)…"); const r = await requestAccess(me!, id); toast.show({ title: r.request.status === "approved" ? "Approved" : "Request sent", sub: r.request.status === "approved" ? "Auto-approved. Open the terms now." : "The maker will see your request.", tone: "success" }); load(); } catch (e: any) { err("Request refused")(e); } finally { setBusy(""); } };
  const decide = async (requester: string, decision: "approve" | "decline") => { try { setBusy("Signing…"); const approval = decision === "approve" ? await signApproval(me!, id, requester) : undefined; await api(`/api/deals/${id}/approve`, { account: me, requester, decision, approval }); toast.show({ title: decision === "approve" ? "Approved" : "Declined", tone: "success" }); load(); } catch (e: any) { err("Failed")(e); } finally { setBusy(""); } };
  const setAuto = async (on: boolean) => { try { setBusy("Updating…"); const approval = on ? await signApproval(me!, id, "*") : undefined; await api(`/api/deals/${id}/auto`, { account: me, approval, off: !on }); load(); } catch (e: any) { err("Failed")(e); } finally { setBusy(""); } };
  const startCounter = () => { if (!targetTerms) return; const m = mirror(targetTerms); setGive(fromUnits(m.sell_amount, tokenById(m.sell_token).decimals, 18)); setGet(fromUnits(m.buy_amount, tokenById(m.buy_token).decimals, 18)); setNote(""); setMode("counter"); };
  const counterTerms = (): Terms | null => { if (!targetTerms) return null; try { const m = mirror(targetTerms); return { ...m, sell_amount: toUnits(give, tokenById(m.sell_token).decimals), buy_amount: toUnits(get, tokenById(m.buy_token).decimals) }; } catch { return null; } };
  const send = async (kind: "accept" | "counter") => {
    const terms = kind === "accept" ? mirror(targetTerms!) : counterTerms();
    if (!terms || !target) return;
    try {
      setBusy("Signing your intent…");
      const s = await signedOffer({ account: me!, deal: id, to: target.from, terms, deadlineMs, note: kind === "counter" ? note : "" });
      setBusy(kind === "accept" ? "Matching in the enclave + settling on NEAR…" : "Sealing your counter…");
      const r = await api<any>(`/api/deals/${id}/offer`, { ...s, account: me, kind, reply_to: target.id });
      toast.show({ title: kind === "accept" ? "Settled atomically" : "Counter sent", sub: r.tx ? `tx ${r.tx.slice(0, 10)}…` : "Only the other party can read it.", tone: "success" });
      setMode(null); setBusy(""); await doReveal(true);
    } catch (e: any) { err("Failed")(e); } finally { setBusy(""); }
  };
  const decline = async () => { try { await api(`/api/deals/${id}/decline`, { account: me, offer_id: target!.id }); toast.show({ title: "Declined", tone: "success" }); load(); } catch (e: any) { err("Failed")(e); } };
  const cancel = async () => {
    if (!confirm("Cancel this deal? Your signatures are invalidated on chain and nobody can fill it.")) return;
    try { setBusy("Cancelling…"); const nonces = offers.filter((o) => o.from === me && o.status === "live").map((o) => o.nonce); const signed = await cancelPayloads(me!, nonces); const r = await api<any>(`/api/deals/${id}/cancel`, { account: me, signed }); toast.show({ title: "Deal cancelled", sub: `tx ${r.tx.slice(0, 10)}…`, tone: "success" }); load(); } catch (e: any) { err("Failed")(e); } finally { setBusy(""); }
  };
  const publish = async () => { if (!confirm("Make this deal public? It will appear on the board, and it can't be made private again.")) return; try { await api(`/api/deals/${id}/publish`, { account: me }); toast.show({ title: "Deal is now public", tone: "success" }); load(); } catch (e: any) { err("Failed")(e); } };
  const share = async () => { try { await navigator.clipboard.writeText(`${location.origin}/d/${id}`); toast.show({ title: "Link copied", sub: `${location.host}/d/${id}`, tone: "success" }); } catch {} };

  if (!d) return <div className="card card-pad muted">Loading… (or this deal does not exist)</div>;
  const [b, q] = d.pair.split("/"); const [mGive, mGet] = d.side === "sell" ? [b, q] : [q, b];
  // Unique viewers, deduped, newest first.
  const viewers = Object.values((my?.view_log || []).reduce((m: Record<string, { account: string; n: number; last: number }>, v) => { const x = m[v.account] ||= { account: v.account, n: 0, last: 0 }; x.n++; x.last = Math.max(x.last, v.at); return m; }, {})).sort((a, b) => b.last - a.last);
  const totalViews = (my?.view_log || []).length;

  const Mkt = ({ t }: { t: Terms }) => { const x = vsMarket(prices, t.sell_token, human(t.sell_token, t.sell_amount), t.buy_token, human(t.buy_token, t.buy_amount)); return x === null ? null : <span className={`mkt-tag ${Math.abs(x) < 0.5 ? "" : x > 0 ? "up" : "down"}`}>{fmtPct(x)} vs market</span>; };
  const Bubble = ({ o }: { o: Row }) => {
    const mine = o.from === me; const t = o.r?.terms;
    const I = o.kind === "open" ? Tag : o.status === "settled" ? CheckCircle : o.status === "declined" ? XCircle : o.kind === "accept" ? CheckCircle : ArrowsLeftRight;
    const label = o.kind === "open" ? "Listing" : o.kind === "accept" ? "Accepted" : "Counter";
    const st = o.status === "settled" ? "accepted" : o.status;
    return (
      <div className={`bubble-row ${mine ? "mine" : "theirs"}`}>
        {!mine && <Persona name={o.from} size={28} />}
        <div className={`bubble ${mine ? "mine" : "theirs"} ${o.status}`}>
          <div className="bb-head"><I size={15} weight="bold" /><b>{label}</b><span className="bb-who">{mine ? "You" : short(o.from, 6, 4)}</span></div>
          {t ? (<>
            <div className="bb-terms"><TokenIcon t={sy(t.sell_token)} size={18} /> gives <b>{fmt(t.sell_token, t.sell_amount)}</b><span className="bb-dot">·</span><TokenIcon t={sy(t.buy_token)} size={18} /> gets <b>{fmt(t.buy_token, t.buy_amount)}</b></div>
            {o.r?.note && <div className="bb-note">“{o.r.note}”</div>}
            <div className="bb-foot"><Mkt t={t} /><span className={`bb-st ${st}`}>{st}</span>{o.at ? <span className="bb-time">{new Date(o.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}</div>
          </>) : <div className="bb-terms bb-sealed">Sealed — tap ↻ to open</div>}
        </div>
      </div>
    );
  };

  const gate = !me ? <NeedSignIn what="Sign in to request the exact terms." />
    : !canSign ? <p className="wallet-note">This wallet can't sign messages here. Connect Meteor, HOT, Intear, HERE or MyNearWallet, or sign in with Google.</p>
    : (isMaker || myReq === "approved") ? <div className="gate"><Eye size={26} weight="duotone" /><p>{isMaker ? "Your terms are sealed in the enclave." : "The maker approved you."} Open them in this browser; nobody else can read them.</p><button className="btn btn-dark" disabled={!!busy} onClick={() => doReveal()}>{busy || (isMaker ? "Open my deal" : "Open the terms")}</button></div>
    : myReq === "pending" ? <div className="gate"><UsersThree size={26} weight="duotone" /><p>Request sent. You passed the $50 check; waiting for the maker to approve you.</p></div>
    : !live ? <div className="gate"><Eye size={26} weight="duotone" /><p>This deal is {String(d.status).toLowerCase()}. It no longer takes requests.</p></div>
    : <div className="gate"><Eye size={26} weight="duotone" /><p>{myReq === "declined" ? "The maker declined your last request. You can ask again." : <>Request access to see the exact terms. You need at least <b>$50 in {mGet}</b> (Private OTC or wallet) — a spam filter, the same for every deal. {d.auto_approve ? "This maker auto-approves." : "Then the maker approves you."}</>}</p><button className="btn btn-dark" disabled={!!busy || !live} onClick={doRequest}>{busy || "Request terms"}</button></div>;

  return (
    <div className="deal2">
      <aside className="card card-pad d2-left">
        <div className="d2-title"><PairIcon a={mGive} b={mGet} size={44} /><div><h1 className="d2-h">{mGive} → {mGet}</h1><span className="tiny muted mono">Deal {id.slice(0, 10)}</span></div><StatusChip s={my?.my_status || d.status} /></div>
        <Steps at={step} />
        <div className="d2-stats">
          <div><span>Expires</span><b className="mono">{!live ? (d.status === "Settled" ? "settled" : "closed") : deadlineMs > now ? countdown(deadlineMs - now) : "ended"}</b></div>
          <div><span>Requests</span><b>{d.requests}</b></div>
          <div><span>Counters</span><b>{d.counters}</b></div>
        </div>
        <div className="d2-row"><span className="chip chip-muted vis-chip">{d.visibility === "private" ? <><LockSimple size={13} weight="bold" /> Private · link only</> : <><Globe size={13} weight="bold" /> Public · on the board</>}</span>{isMaker && d.visibility === "private" && live && <button className="btn btn-ghost btn-sm" onClick={publish}><Globe size={14} /> Make public</button>}</div>
        {isMaker && <p className="tiny muted">{d.visibility === "private" ? "Not on the board. Making it public can't be undone." : "Public deals can't be made private again."}</p>}
        <div className="d2-row"><button className="btn btn-ghost btn-sm" onClick={share}><LinkSimple size={15} /> Copy link</button><span className="tiny muted mono">{location.host}/d/{id.slice(0, 8)}…</span></div>
        <div className="d2-row tiny"><span className="muted">On chain</span><Tx hash={d.check_tx} label="sealed" />{d.settle_tx && <Tx hash={d.settle_tx} label="settled" />}</div>
        {d.status === "Settled" && me && my && <div className="d2-xchain"><b className="small">Receive on another chain</b><p className="tiny muted">Settlement happened inside NEAR Intents. Keep the tokens there, withdraw to NEAR, or pay them out to an EVM testnet.</p><Bridge account={me} initial={{ direction: "out" }} compact /></div>}
        {isMaker && (
          <div className="viewers">
            <div className="row-between"><b className="small">Viewed by</b><span className="tiny muted">{viewers.length} viewer{viewers.length === 1 ? "" : "s"} · {totalViews} view{totalViews === 1 ? "" : "s"}</span></div>
            {viewers.length === 0 ? <p className="tiny muted">Nobody yet.</p> : (
              <ul>{(allViews ? viewers : viewers.slice(0, 5)).map((v) => <li key={v.account}><Persona name={v.account} size={24} /><span className="mono small" title={v.account}>{short(v.account, 8, 4)}</span><span className="tiny muted">{v.n}× · {ago(now - v.last)}</span></li>)}</ul>
            )}
            {viewers.length > 5 && <button className="btn btn-text btn-sm" onClick={() => setAllViews(!allViews)}><CaretDown size={12} style={{ transform: allViews ? "rotate(180deg)" : "" }} /> {allViews ? "Show less" : `${viewers.length - 5} more`}</button>}
          </div>
        )}
        {isMaker && live && <button className="btn btn-text btn-sm danger" disabled={!!busy} onClick={cancel}><Prohibit size={14} /> Cancel deal</button>}
      </aside>

      <section className="card d2-right">
        <div className="d2-tabs" role="tablist">
          <button role="tab" className={tab === "talk" ? "on" : ""} onClick={() => setTab("talk")}>Negotiation</button>
          {isMaker && <button role="tab" className={tab === "req" ? "on" : ""} onClick={() => setTab("req")}>Requests{pending > 0 && <span className="tab-badge">{pending}</span>}</button>}
          <button role="tab" className={tab === "info" ? "on" : ""} onClick={() => setTab("info")}>Details</button>
          {rev && <button className="icon-btn d2-refresh" title="Refresh" aria-label="Refresh" disabled={!!busy} onClick={() => doReveal(true)}><ArrowClockwise size={16} weight="bold" className={busy === "sync" || busy.startsWith("Opening") ? "spin" : ""} /></button>}
        </div>

        {tab === "talk" && (!rev ? <div className="d2-body">{gate}</div> : (
          <div className="d2-talk">
            {isMaker && peers.length > 0 && <div className="peer-bar">{peers.map((p) => { const lv = offers.some((o) => o.from === p && o.status === "live"); return <button key={p} className={`peer ${peer === p ? "on" : ""}`} onClick={() => setPeer(p)}><Persona name={p} size={22} /><span className="mono">{short(p, 6, 4)}</span>{lv && <span className="peer-dot" />}</button>; })}</div>}
            {isMaker && peers.length === 0 && <p className="tiny muted" style={{ padding: "10px 16px 0" }}>No counter-offers yet. Approved requesters can counter or accept your listing.</p>}
            <div className="thread2" ref={scroller}>{thread.map((o) => <Bubble key={o.id} o={o} />)}</div>
            {live && target && targetTerms && (
              <div className="action-bar">
                {!mode && <div className="ab-btns">
                  <button className="btn btn-dark btn-sm" disabled={!!busy} onClick={() => setMode("accept")}><CheckCircle size={16} weight="fill" /> Accept</button>
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={startCounter}><ArrowsLeftRight size={16} weight="bold" /> Counter</button>
                  {target.kind === "counter" && <button className="btn btn-ghost btn-sm danger" disabled={!!busy} onClick={decline}><XCircle size={16} weight="fill" /> Decline</button>}
                  <span className="tiny muted">Replying to {target.from === other ? short(target.from, 6, 4) : "the listing"}</span>
                </div>}
                {mode === "accept" && <div className="ab-compose"><p className="small">You give <b>{fmt(targetTerms.buy_token, targetTerms.buy_amount)}</b> and get <b>{fmt(targetTerms.sell_token, targetTerms.sell_amount)}</b>. Both sides settle in one NEAR Intents call, or nothing moves.</p>
                  <div className="row-gap"><button className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>Back</button><button className="btn btn-dark btn-sm" disabled={!!busy} onClick={() => send("accept")}>{busy || "Sign & settle"}</button></div></div>}
                {mode === "counter" && <div className="ab-compose">
                  <div className="field-row"><label className="field"><span>You give ({sy(targetTerms.buy_token)})</span><input className="input mono" value={give} onChange={(e) => setGive(e.target.value.replace(",", "."))} /></label><label className="field"><span>You get ({sy(targetTerms.sell_token)})</span><input className="input mono" value={get} onChange={(e) => setGet(e.target.value.replace(",", "."))} /></label></div>
                  <input className="input" maxLength={200} placeholder="Note (optional, private)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="row-between" style={{ marginTop: 8 }}>{counterTerms() ? <Mkt t={counterTerms()!} /> : <span />}<div className="row-gap"><button className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>Back</button><button className="btn btn-dark btn-sm" disabled={!counterTerms() || !!busy} onClick={() => send("counter")}>{busy || "Sign & send"}</button></div></div>
                </div>}
              </div>
            )}
            {busy && busy !== "sync" && !mode && <p className="tiny muted" style={{ padding: "0 16px 12px" }}>{busy}</p>}
          </div>
        ))}

        {tab === "req" && isMaker && (
          <div className="d2-body">
            <label className="auto-row"><input type="checkbox" checked={!!d.auto_approve} disabled={!!busy || !live} onChange={(e) => setAuto(e.target.checked)} /><span><b>Auto-approve anyone with $50+</b><br /><span className="tiny muted">Every requester already holds at least $50 of {mGet} (spam filter, not a fill guarantee).</span></span></label>
            {my?.request_list?.length ? <ul className="req-list">{[...my.request_list].reverse().map((r) => (
              <li key={r.account}><span className="req-who"><Persona name={r.account} size={26} /><span><span className="mono small">{short(r.account, 10, 4)}</span><br /><span className="tiny muted">$50+ ✓ · {ago(now - r.at)}</span></span></span>
                {r.status === "pending" && live ? <span className="row-gap"><button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => decide(r.account, "decline")}>Decline</button><button className="btn btn-dark btn-sm" disabled={!!busy} onClick={() => decide(r.account, "approve")}>Approve</button></span> : <span className={`chip ${r.status === "approved" ? "chip-green" : "chip-muted"}`}>{r.status}{r.auto ? " (auto)" : ""}</span>}</li>))}</ul>
              : <p className="muted small">No requests yet. Share the link or wait for traders on the board.</p>}
          </div>
        )}

        {tab === "info" && (
          <div className="d2-body d2-info">
            {targetTerms ? <SignPanel kind="Mirror token_diff (NEAR Intents)" terms={mirror(targetTerms)} deadline={deadlineMs} gas="Paid by the Private OTC relayer (execute_intents)." /> : <SignPanel kind="token_diff intent (NEAR Intents), sealed" deadline={deadlineMs} gas="None. The relayer pays at settlement." />}
            <PrivacyNote />
            <div className="small"><b>How settlement works.</b> <span className="muted">Each side signs a token_diff intent. On Accept the enclave checks the two are exact mirror images and hands them to execute_intents on the verifier: both legs move in one transaction, or nothing moves. The first settlement wins; other replies fail cleanly.</span> <Link className="link" to="/app/how">More</Link></div>
            <p className="tiny muted">Short link: <span className="mono">{location.host}/d/{id}</span></p>
          </div>
        )}
      </section>
    </div>
  );
}
