import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Top, NeedSignIn } from "../app/Shell";
import { useApp } from "../app/state";
import { api, type MyDeal } from "../lib/api";
import { DealCard } from "../components/DealCard";

const ORDER = ["All", "Open", "Requested", "Countered", "Settled", "Expired", "Cancelled"];
export default function Mine() {
  const { account } = useApp();
  const [list, setList] = useState<MyDeal[] | null>(null);
  const [f, setF] = useState("All");
  useEffect(() => { if (!account) return; const load = () => api<MyDeal[]>(`/api/my?account=${account}`).then(setList).catch(() => setList([])); load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [account]);
  const [admin, setAdmin] = useState(false);
  useEffect(() => { setAdmin(false); if (account) api<{ admin: boolean }>(`/api/admin/status?account=${account}`).then((r) => setAdmin(!!r.admin)).catch(() => {}); }, [account]);
  if (!account) return <><Top title="My deals" /><NeedSignIn what="Sign in to see deals you made or requested." /></>;
  const shown = (list || []).filter((d) => f === "All" || d.my_status === f);
  return (
    <>
      <Top title="My deals" sub="Deals you posted, requested or negotiated. Terms stay sealed; open a deal to view them." />
      <div className="chips-scroll">{ORDER.map((s) => <button key={s} className={`chip ${f === s ? "chip-blue" : "chip-muted"}`} onClick={() => setF(s)}>{s}</button>)}</div>
      {list === null ? <div className="card card-pad muted">Loading…</div> : shown.length === 0 ? <div className="card card-pad muted">Nothing here yet. <Link className="link" to="/app">Browse the board</Link> or <Link className="link" to="/app/new">post a deal</Link>.</div> : (
        <div className="deal-list">
          {shown.map((d) => { const pend = d.role === "maker" ? (d.request_list?.filter((q) => q.status === "pending").length ?? 0) : 0; return (
            <DealCard key={d.id} d={d} status={d.my_status} sub={<>{d.role === "maker" ? "You're the maker" : "You requested"} · <span className="mono">{d.id.slice(0, 8)}</span></>}
              extra={pend > 0 ? <span className="chip chip-blue">{pend} to approve</span> : null} />); })}
        </div>
      )}
      {admin && <AdminWipe account={account} />}
    </>
  );
}

function AdminWipe({ account }: { account: string }) {
  const [txt, setTxt] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setMsg("");
    try { const r = await api<{ before: { deals: number } }>("/api/admin/wipe-wallet", { account, confirm: txt }); setMsg(`Wiped ${r.before.deals} deals. Sessions were cleared, so sign in again.`); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card card-pad" style={{ marginTop: 24 }}>
      <div className="muted" style={{ marginBottom: 8 }}>Admin: wipe all deals (and sessions). Type WIPE to confirm.</div>
      <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="WIPE" />{" "}
      <button className="btn" disabled={busy || txt !== "WIPE"} onClick={go}>Admin: wipe all deals</button>
      {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
