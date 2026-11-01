import type { LeaderRow, QueryLog, RecentSale } from "./lib/db";
import { euro, pts, time } from "./phone";

export function Leaderboard({ rows, me }: { rows: LeaderRow[]; me: string | null }) {
  const top = Math.max(1, ...rows.map((r) => r.points));
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[17px] font-semibold tracking-[-0.02em]">Today's leaderboard</h3>
        <span className="flex items-center gap-2 font-mono text-[11px] text-mint">
          <span className="size-2 animate-pulse rounded-full bg-mint" aria-hidden />
          Live
        </span>
      </div>
      <ol className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.name} className={`relative overflow-hidden rounded-xl border px-3.5 py-2.5 ${row.name === me ? "border-brand/60" : "border-line"}`}>
            <div
              aria-hidden
              className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-out ${row.name === me ? "bg-brand/15" : "bg-white/[0.035]"}`}
              style={{ width: `${(row.points / top) * 100}%` }}
            />
            <div className="relative flex items-center gap-3">
              <span className="w-6 font-display text-[14px] text-ash tabular-nums">{row.rank}</span>
              <span className="flex-1 text-[14.5px] font-medium">
                {row.name}
                {row.name === me && <span className="ml-2 font-mono text-[10.5px] text-brand">you</span>}
              </span>
              <span className="font-mono text-[11.5px] text-ash tabular-nums">{euro(row.euros)}</span>
              <span className="w-14 text-right font-display text-[15px] font-semibold tabular-nums">{pts(row.points)}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TeamPanel({ rows, split }: { rows: LeaderRow[]; split: { name: string; sold: number; euros: number }[] }) {
  const points = rows.reduce((n, r) => n + r.points, 0);
  const euros = rows.reduce((n, r) => n + r.euros, 0);
  const sold = rows.reduce((n, r) => n + r.sold, 0);
  const top = Math.max(1, ...split.map((s) => s.sold));
  return (
    <section className="card p-5">
      <h3 className="font-display text-[17px] font-semibold tracking-[-0.02em]">Team today</h3>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Points", pts(points)],
          ["Earned", euro(euros)],
          ["Sales", String(sold)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="font-mono text-[10.5px] text-ash">{label}</p>
            <p className="mt-1 font-display text-[19px] font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <ul className="mt-5 space-y-2">
        {split.map((item) => (
          <li key={item.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-[12.5px]">
            <span className="truncate text-ash">{item.name}</span>
            <span className="font-mono text-[11px] text-ash tabular-nums">{item.sold}</span>
            <span className="col-span-2 mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="block h-full rounded-full bg-brand/80 transition-[width] duration-700" style={{ width: `${(item.sold / top) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecentFeed({ recent }: { recent: RecentSale[] }) {
  return (
    <section className="card p-5">
      <h3 className="font-display text-[17px] font-semibold tracking-[-0.02em]">Latest sales</h3>
      <ul className="mt-3 divide-y divide-line">
        {recent.slice(0, 7).map((sale) => (
          <li key={sale.id} className={`rise flex items-center gap-3 py-2.5 text-[13px] ${sale.voided ? "opacity-40 line-through" : ""}`}>
            <span className="w-11 font-mono text-[11px] text-dim">{time(sale.createdAt)}</span>
            <span className="w-14 font-medium">{sale.seller}</span>
            <span className="min-w-0 flex-1 truncate text-ash">{sale.product}</span>
            <span className="font-mono text-[11.5px] text-mint">+{euro(sale.euros)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QueryConsole({ logs }: { logs: QueryLog[] }) {
  return (
    <section className="card flex min-h-0 flex-col p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-[17px] font-semibold tracking-[-0.02em]">Under the hood</h3>
        <span className="font-mono text-[10.5px] text-dim">role: app</span>
      </div>
      <p className="mt-1 text-[12.5px] text-ash">Every tap is a real query to PostgreSQL 18, running in your browser.</p>
      <ol className="mt-4 max-h-[340px] space-y-2 overflow-y-auto font-mono text-[11.5px]" aria-live="polite">
        {logs.length === 0 && <li className="text-dim">Sign in on the phone to see the queries.</li>}
        {logs.map((log) => (
          <li key={log.id} className="rise rounded-xl border border-line bg-black/30 p-3">
            <p className="break-all text-bone/85">{log.sql}</p>
            <p className={`mt-1.5 ${log.ok ? "text-mint" : "text-red"}`}>
              {log.ok ? "✓" : "✕"} {log.result} <span className="text-dim">· {log.ms.toFixed(1)} ms</span>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface Attempt {
  id: string;
  label: string;
  detail: string;
}

export const ATTEMPTS: Attempt[] = [
  { id: "insert", label: "Insert a sale directly", detail: "Skip the app and write to the sales table" },
  { id: "price", label: "Send my own price", detail: "Claim 999 € for a 45 € contract" },
  { id: "pins", label: "Read everyone's PIN", detail: "Select the PIN column from sellers" },
  { id: "guess", label: "Guess Aino's PIN", detail: "Five wrong tries locks her out" },
  { id: "void", label: "Void a sale as a seller", detail: "Only team leads may" },
];

export function BreakIt({ disabled, onAttempt }: { disabled: boolean; onAttempt: (id: string) => void }) {
  return (
    <section className="card p-5">
      <h3 className="font-display text-[17px] font-semibold tracking-[-0.02em]">Try to break it</h3>
      <p className="mt-1 text-[12.5px] text-ash">
        {disabled ? "Sign in as You first, then try to cheat." : "Each button runs a real query. The database decides."}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {ATTEMPTS.map((attempt) => (
          <button
            key={attempt.id}
            type="button"
            disabled={disabled}
            onClick={() => onAttempt(attempt.id)}
            className="tap rounded-xl border border-line px-3.5 py-3 text-left hover:border-red/40 disabled:opacity-40"
          >
            <span className="block text-[13.5px] font-medium">{attempt.label}</span>
            <span className="text-[11.5px] text-ash">{attempt.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
