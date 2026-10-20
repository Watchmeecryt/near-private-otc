import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, LockKey } from "@phosphor-icons/react";
import { Top } from "../app/Shell";
import { api, type Coarse } from "../lib/api";
import { StatusChip, useNow } from "../components/ui";
import { countdown } from "../lib/format";

export default function Board() {
  const [deals, setDeals] = useState<Coarse[] | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");
  const now = useNow(5000);
  useEffect(() => { const load = () => api<Coarse[]>("/api/deals").then(setDeals).catch(() => {}); load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);
  const list = (deals || []).filter((d) => show === "all" || d.status === "Open");
  return (
    <>
      <Top title="Deal board" sub="Open OTC deals. Only coarse facts are public; exact size and price stay sealed until you request them.">
        <Link to="/app/new" className="btn btn-dark btn-sm"><Plus size={15} weight="bold" /> New deal</Link>
      </Top>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={show === "open" ? "on" : ""} onClick={() => setShow("open")}>Open</button>
        <button className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>All</button>
      </div>
      {deals === null ? <div className="card card-pad muted">Loading…</div> : list.length === 0 ? (
        <div className="card empty"><span className="icon-chip" style={{ margin: "0 auto" }}><LockKey size={22} weight="duotone" /></span><h3>No open deals yet</h3><p>Post the first one. Your exact terms are sealed; the board only shows pair, side, size band and expiry.</p><Link to="/app/new" className="btn btn-dark">Post a deal</Link></div>
      ) : (
        <div className="deal-list">
          {list.map((d) => (
            <Link key={d.id} to={`/app/d/${d.id}`} className="card deal-row">
              <div className="dr-main">
                <span className={`side-tag ${d.side}`}>{d.side === "sell" ? "Selling" : "Buying"}</span>
                <b>{d.pair.split("/")[0]}</b><span className="muted">for {d.pair.split("/")[1]}</span>
              </div>
              <div className="dr-meta"><span className="mono">{d.band}</span><span className="muted">{Date.parse(d.deadline) > now ? countdown(Date.parse(d.deadline) - now) + " left" : "ended"}</span><StatusChip s={d.status} /><ArrowRight size={16} /></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
