import { useState, type ReactNode } from "react";

import type { ActivityKind, Day, Product, RecentSale } from "./lib/db";

const euro = (n: number) => `${n.toLocaleString("en-GB")} €`;
const pts = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")} p`;
const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" });

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[390px] rounded-[46px] border border-white/10 bg-[#0b0e12] p-2.5 shadow-[0_40px_120px_-30px_rgb(58_155_224/0.35)]">
      <div className="relative h-[760px] overflow-hidden rounded-[38px] bg-void">
        <div aria-hidden className="absolute top-2.5 left-1/2 z-30 h-6 w-28 -translate-x-1/2 rounded-full bg-black" />
        {children}
      </div>
    </div>
  );
}

const LOCATIONS = ["Kamppi", "Itis", "Sello"];

export function SignIn({
  busy,
  error,
  onSignIn,
}: {
  busy: boolean;
  error: string | null;
  onSignIn: (name: string, pin: string, location: string) => void;
}) {
  const [who, setWho] = useState<"You" | "Leena">("You");
  const [pin, setPin] = useState("");
  const [location, setLocation] = useState(LOCATIONS[0]!);
  const hint = who === "You" ? "1234" : "9999";

  const press = (digit: string) => {
    if (busy) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      onSignIn(who, next, location);
      setTimeout(() => setPin(""), 350);
    }
  };

  return (
    <div className="flex h-full flex-col px-6 pt-14 pb-6">
      <p className="font-mono text-[11px] text-ash">FlagSales</p>
      <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.03em]">Start your shift</h2>

      <div className="mt-6 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who are you">
        {(["You", "Leena"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={who === name}
            onClick={() => {
              setWho(name);
              setPin("");
            }}
            className={`tap rounded-2xl border px-4 py-3 text-left ${who === name ? "border-brand bg-brand/10" : "border-line"}`}
          >
            <span className="block text-[15px] font-medium">{name === "You" ? "You" : "Leena"}</span>
            <span className="font-mono text-[11px] text-ash">{name === "You" ? "Seller" : "Team lead"}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        {LOCATIONS.map((place) => (
          <button
            key={place}
            type="button"
            onClick={() => setLocation(place)}
            className={`tap chip border ${location === place ? "border-bone/40 text-bone" : "border-line text-ash"}`}
          >
            {place}
          </button>
        ))}
      </div>

      <div className="mt-8 flex justify-center gap-4" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`size-3.5 rounded-full transition-colors duration-200 ${i < pin.length ? "bg-bone" : "bg-white/10"}`} />
        ))}
      </div>
      <p className={`mt-4 h-5 text-center text-[13px] ${error ? "text-red" : "text-dim"}`} role="status">
        {error ?? `Demo PIN: ${hint}`}
      </p>

      <div className="mt-auto grid grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key, i) =>
          key === "" ? (
            <span key={`blank-${i}`} />
          ) : (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => (key === "⌫" ? setPin(pin.slice(0, -1)) : press(key))}
              className="tap h-14 rounded-2xl bg-white/[0.05] font-display text-[20px] hover:bg-white/[0.08]"
              aria-label={key === "⌫" ? "Delete" : key}
            >
              {key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function Header({ title, subtitle, onSignOut }: { title: string; subtitle: string; onSignOut: () => void }) {
  return (
    <div className="flex items-end justify-between border-b border-line px-5 pt-12 pb-3">
      <div>
        <p className="font-display text-[17px] font-semibold tracking-[-0.02em]">{title}</p>
        <p className="font-mono text-[11px] text-ash">{subtitle}</p>
      </div>
      <button type="button" onClick={onSignOut} className="tap chip border border-line text-ash">
        End shift
      </button>
    </div>
  );
}

const ACTIVITIES: { kind: ActivityKind; label: string; key: keyof Day }[] = [
  { kind: "encounter", label: "Encounters", key: "encounters" },
  { kind: "assessment", label: "Assessments", key: "assessments" },
  { kind: "offer", label: "Offers", key: "offers" },
];

function rate(a: number, b: number) {
  return a > 0 ? `${Math.round((b / a) * 100)}%` : "–";
}

export function SellerHome({
  day,
  products,
  basket,
  saving,
  onStep,
  onActivity,
  onSave,
  onSignOut,
}: {
  day: Day;
  products: Product[];
  basket: Record<number, number>;
  saving: boolean;
  onStep: (productId: number, delta: 1 | -1) => void;
  onActivity: (kind: ActivityKind, delta: 1 | -1) => void;
  onSave: () => void;
  onSignOut: () => void;
}) {
  const items = products.filter((p) => (basket[p.id] ?? 0) > 0);
  const count = items.reduce((n, p) => n + basket[p.id]!, 0);
  const basketEuros = items.reduce((n, p) => n + p.euros * basket[p.id]!, 0);
  const basketPoints = items.reduce((n, p) => n + p.points * basket[p.id]!, 0);
  const progress = Math.min(1, day.points / Math.max(1, day.goal));

  return (
    <div className="flex h-full flex-col">
      <Header title={day.name === "You" ? "Your shift" : day.name} subtitle={`Clocked in ${time(day.signedInAt)}`} onSignOut={onSignOut} />

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 pb-40">
        <section className="card p-4">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="font-mono text-[10.5px] text-ash">Points</p>
              <p className="mt-1 font-display text-[22px] font-semibold tabular-nums">{pts(day.points)}</p>
            </div>
            <div>
              <p className="font-mono text-[10.5px] text-ash">Earned</p>
              <p className="mt-1 font-display text-[22px] font-semibold text-mint tabular-nums">{euro(day.euros)}</p>
            </div>
            <div>
              <p className="font-mono text-[10.5px] text-ash">Rank</p>
              <p className="mt-1 font-display text-[22px] font-semibold tabular-nums">
                #{day.rank}
                <span className="text-[13px] text-dim">/{day.sellers}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-between text-[12px] text-ash">
            <span>Daily goal {pts(day.goal)}</span>
            <span>{day.points >= day.goal ? "Goal reached" : `${pts(Math.max(0, day.goal - day.points))} to go`}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${progress * 100}%` }} />
          </div>
        </section>

        <section className="grid grid-cols-3 gap-2">
          {ACTIVITIES.map(({ kind, label, key }) => (
            <div key={kind} className="card p-3 text-center">
              <p className="font-mono text-[10px] text-ash">{label}</p>
              <p className="my-1.5 font-display text-[22px] font-semibold tabular-nums">{day[key] as number}</p>
              <div className="flex justify-center gap-1.5">
                <button type="button" className="tap step" disabled={(day[key] as number) === 0} onClick={() => onActivity(kind, -1)} aria-label={`One less ${label}`}>
                  −
                </button>
                <button type="button" className="tap step border-brand/40 text-brand" onClick={() => onActivity(kind, 1)} aria-label={`One more ${label}`}>
                  +
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="card grid grid-cols-3 gap-2 p-3 text-center font-mono text-[10.5px] text-ash">
          <p>
            Met → assessed
            <span className="mt-0.5 block text-[13px] text-bone">{rate(day.encounters, day.assessments)}</span>
          </p>
          <p>
            Assessed → offer
            <span className="mt-0.5 block text-[13px] text-bone">{rate(day.assessments, day.offers)}</span>
          </p>
          <p>
            Offer → sale
            <span className="mt-0.5 block text-[13px] text-bone">{rate(day.offers, day.sold)}</span>
          </p>
        </section>

        <p className="px-1 pt-2 font-mono text-[11px] text-ash">Log a sale</p>
        {products.map((product) => {
          const qty = basket[product.id] ?? 0;
          return (
            <div key={product.id} className={`card flex items-center justify-between gap-3 p-3.5 transition-colors ${qty ? "border-brand/50" : ""}`}>
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-medium">{product.name}</p>
                <div className="mt-1.5 flex gap-1.5">
                  <span className="chip bg-brand/12 text-brand">+{pts(product.points)}</span>
                  <span className="chip bg-mint/12 text-mint">+{euro(product.euros)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="tap step" disabled={qty === 0} onClick={() => onStep(product.id, -1)} aria-label={`Remove one ${product.name}`}>
                  −
                </button>
                <span className="w-5 text-center font-display text-[16px] tabular-nums">{qty}</span>
                <button type="button" className="tap step border-brand/40 text-brand" onClick={() => onStep(product.id, 1)} aria-label={`Add one ${product.name}`}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-line bg-void/90 px-4 pt-3 pb-5 backdrop-blur-xl">
        <div className="mb-3 flex justify-between font-mono text-[11.5px] text-ash">
          <span>{count} in basket</span>
          <span>
            <span className="text-mint">+{euro(basketEuros)}</span> · <span className="text-brand">+{pts(basketPoints)}</span>
          </span>
        </div>
        <button
          type="button"
          disabled={count === 0 || saving}
          onClick={onSave}
          className="tap h-12 w-full rounded-2xl bg-brand text-[15px] font-semibold text-void disabled:bg-white/[0.07] disabled:text-dim"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export function SavedSheet({
  saved,
  onClose,
}: {
  saved: { points: number; euros: number; lines: string[] };
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-void/70 p-6 backdrop-blur-md" onClick={onClose}>
      <div className="pop card w-full p-7 text-center" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Sale saved">
        <div className="mx-auto grid size-16 place-items-center rounded-full border border-mint/40 bg-mint/10 text-[28px] text-mint shadow-[0_0_40px_rgb(70_227_155/0.35)]">
          ✓
        </div>
        <p className="mt-4 text-[13px] text-ash">Saved</p>
        <p className="mt-1 font-display text-[44px] font-semibold text-mint">+{euro(saved.euros)}</p>
        <p className="font-display text-[18px] text-bone/80">+{pts(saved.points)}</p>
        <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-left text-[13px] text-ash">
          {saved.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button type="button" onClick={onClose} className="tap mt-6 h-11 w-full rounded-2xl bg-white/[0.07] text-[14px] font-medium">
          Keep selling
        </button>
      </div>
    </div>
  );
}

export function LeadHome({
  recent,
  onVoid,
  onSignOut,
}: {
  recent: RecentSale[];
  onVoid: (sale: RecentSale) => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <Header title="Team lead" subtitle="Leena · fix mistakes" onSignOut={onSignOut} />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        <p className="px-1 text-[13px] text-ash">Only a team lead can void a sale. Sellers get refused by the database itself.</p>
        {recent.map((sale) => (
          <div key={sale.id} className={`card flex items-center justify-between gap-3 p-3.5 ${sale.voided ? "opacity-45" : ""}`}>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">{sale.product}</p>
              <p className="font-mono text-[11px] text-ash">
                {sale.seller} · {time(sale.createdAt)} · {euro(sale.euros)}
              </p>
            </div>
            {sale.voided ? (
              <span className="chip border border-line text-dim">Voided</span>
            ) : (
              <button type="button" onClick={() => onVoid(sale)} className="tap chip border border-red/40 text-red">
                Void
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { euro, pts, time };
