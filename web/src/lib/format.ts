const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const tzLabel = () => { try { return new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value || tz; } catch { return tz; } };
export const when = (ms: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
export const short = (s: string, a = 6, b = 4) => (s && s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);
export function span(sec: number) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 90) return `${sec}s`;
  const m = Math.round(sec / 60); if (m < 90) return `${m} min`;
  const h = Math.round(sec / 3600); if (h < 48) return `${h} h`;
  const d = Math.round(sec / 86400); if (d < 60) return `${d} days`;
  return `${Math.round(d / 30)} months`;
}
export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${String(r).padStart(2, "0")}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}
