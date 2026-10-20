import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { Top, NeedSignIn } from "../app/Shell";
import { useApp } from "../app/state";
import { api, type MyDeal } from "../lib/api";
import { StatusChip } from "../components/ui";

const ORDER = ["All", "Open", "Requested", "Countered", "Settled", "Expired", "Cancelled"];
export default function Mine() {
  const { account } = useApp();
  const [list, setList] = useState<MyDeal[] | null>(null);
  const [f, setF] = useState("All");
  useEffect(() => { if (!account) return; const load = () => api<MyDeal[]>(`/api/my?account=${account}`).then(setList).catch(() => setList([])); load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [account]);
  if (!account) return <><Top title="My deals" /><NeedSignIn what="Sign in to see deals you made or requested." /></>;
  const shown = (list || []).filter((d) => f === "All" || d.my_status === f);
  return (
    <>
      <Top title="My deals" sub="Deals you posted, requested or negotiated. Terms stay sealed; open a deal to view them." />
      <div className="chips-scroll">{ORDER.map((s) => <button key={s} className={`chip ${f === s ? "chip-blue" : "chip-muted"}`} onClick={() => setF(s)}>{s}</button>)}</div>
      {list === null ? <div className="card card-pad muted">Loading…</div> : shown.length === 0 ? <div className="card card-pad muted">Nothing here yet. <Link className="link" to="/app">Browse the board</Link> or <Link className="link" to="/app/new">post a deal</Link>.</div> : (
        <div className="deal-list">
          {shown.map((d) => (
            <Link key={d.id} to={`/app/d/${d.id}`} className="card deal-row">
              <div className="dr-main"><span className={`side-tag ${d.side}`}>{d.role === "maker" ? "Maker" : "Taker"}</span><b>{d.pair}</b><span className="muted mono">{d.id}</span></div>
              <div className="dr-meta"><span className="chip chip-muted">{d.counters} counter{d.counters === 1 ? "" : "s"}</span><StatusChip s={d.my_status} /><ArrowRight size={16} /></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
