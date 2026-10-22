import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import type { Coarse } from "../lib/api";
import { StatusChip, PairIcon, useNow } from "./ui";
import { countdown } from "../lib/format";
import { Persona } from "./Persona";
import { Eye } from "@phosphor-icons/react";

/** Overlapping anonymous viewer avatars (max 5) plus a +N chip and the view count. */
export function Viewers({ d }: { d: Coarse }) {
  const seeds = d.viewer_seeds || []; const n = d.viewers ?? seeds.length; const extra = Math.max(0, n - seeds.length);
  return (
    <span className="viewers-inline" title={`${n} viewer${n === 1 ? "" : "s"} · ${d.views ?? 0} view${d.views === 1 ? "" : "s"}`}>
      {seeds.length > 0 && <span className="av-stack">{seeds.map((s) => <Persona key={s} seed={s} size={26} />)}{extra > 0 && <span className="av-more">+{extra}</span>}</span>}
      <span className="muted vw-count"><Eye size={14} weight="bold" /> {d.views ?? 0}</span>
    </span>
  );
}

/** The one deal card used by the Board and My deals: token pair icons left, pair, counts, expiry, status. */
export function DealCard({ d, status, sub, extra }: { d: Coarse; status?: string; sub?: ReactNode; extra?: ReactNode }) {
  const now = useNow(5000);
  const [b, q] = d.pair.split("/"); const [give, get] = d.side === "sell" ? [b, q] : [q, b];
  const left = Date.parse(d.deadline) - now;
  return (
    <Link to={`/app/d/${d.id}`} className="card deal-row board-card">
      <PairIcon a={give} b={get} size={40} />
      <div className="dr-main">
        <div className="bc-pair"><b>{give}</b><ArrowRight size={14} weight="bold" className="muted" /><b>{get}</b></div>
        <span className="tiny muted">{sub ?? `Maker sells ${give}, wants ${get}`}</span>
      </div>
      <div className="dr-meta">
        <Viewers d={d} />
        {extra}
        {d.visibility === "private" && <span className="chip chip-muted">Private</span>}
        <span className="chip chip-muted">{d.requests ?? 0} request{d.requests === 1 ? "" : "s"}</span>
        <span className="chip chip-muted">{d.counters} counter{d.counters === 1 ? "" : "s"}</span>
        <span className="muted">{left > 0 ? countdown(left) + " left" : "ended"}</span>
        <StatusChip s={status || d.status} /><ArrowRight size={16} />
      </div>
    </Link>
  );
}
