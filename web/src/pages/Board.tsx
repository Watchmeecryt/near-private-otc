import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, LockKey } from "@phosphor-icons/react";
import { Top } from "../app/Shell";
import { useApp } from "../app/state";
import { api, type Coarse } from "../lib/api";
import { DealCard } from "../components/DealCard";

export default function Board() {
  const { account } = useApp();
  const [deals, setDeals] = useState<Coarse[] | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");
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
          {list.map((d) => <DealCard key={d.id} d={d} />)}
        </div>
      )}
    </>
  );
}
