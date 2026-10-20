import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, LockKey } from "@phosphor-icons/react";
import { Top } from "../app/Shell";
import { useApp } from "../app/state";
import { api, type Coarse } from "../lib/api";
import { StatusChip, useNow, PairIcon } from "../components/ui";
import { countdown } from "../lib/format";

export default function Board() {
  const { account } = useApp();
  const [deals, setDeals] = useState<Coarse[] | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");
  const now = useNow(5000);
  useEffect(() => { const load = () => api<Coarse[]>("/api/deals").then(setDeals).catch(() => {}); load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [account]);
  const list = (deals || []).filter((d) => show === "all" || d.status === "Open");
  return (
    <>
      <Top title="Deal board" sub="Open OTC deals. Open to everyone. Terms stay sealed until the maker approves you. Exact amounts stay private until you open a deal.">
        <Link to="/app/new" className="btn btn-dark btn-sm"><Plus size={15} weight="bold" /> New deal</Link>
      </Top>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={show === "open" ? "on" : ""} onClick={() => setShow("open")}>Open</button>
        <button className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>All</button>
      </div>
      {deals === null ? <div className="card card-pad muted">Loading…</div> : list.length === 0 ? (
        <div className="card empty"><span className="icon-chip" style={{ margin: "0 auto" }}><LockKey size={22} weight="duotone" /></span><h3>No open deals yet</h3><p>Post the first one. Your exact terms are sealed; the board only shows pair, side and expiry.</p><Link to="/app/new" className="btn btn-dark">Post a deal</Link></div>
      ) : (
        <div className="deal-list">
          {list.map((d) => (
            <Link key={d.id} to={`/app/d/${d.id}`} className="card deal-row board-card">
              {(() => { const [b, q] = d.pair.split("/"); const [give, get] = d.side === "sell" ? [b, q] : [q, b]; return <>
                <PairIcon a={give} b={get} size={40} />
                <div className="dr-main">
                  <div className="bc-pair"><b>{give}</b><ArrowRight size={14} weight="bold" className="muted" /><b>{get}</b></div>
                  <span className="tiny muted">Maker sells {give}, wants {get}</span>
                </div>
              </>; })()}
              <div className="dr-meta"><span className="chip chip-muted">{d.requests} request{d.requests === 1 ? "" : "s"}</span><span className="chip chip-muted">{d.counters} counter{d.counters === 1 ? "" : "s"}</span><span className="muted">{Date.parse(d.deadline) > now ? countdown(Date.parse(d.deadline) - now) + " left" : "ended"}</span><StatusChip s={d.status} /><ArrowRight size={16} /></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
