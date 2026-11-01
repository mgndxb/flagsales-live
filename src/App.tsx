import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { useCallback, useEffect, useRef, useState } from "react";

import { BreakIt, Leaderboard, QueryConsole, RecentFeed, TeamPanel } from "./board";
import schema from "./db/schema.sql?raw";
import { pickProduct, TEAMMATES } from "./db/seed";
import { SalesDb, type ActivityKind, type Day, type LeaderRow, type Product, type QueryLog, type RecentSale } from "./lib/db";
import { sound } from "./lib/sound";
import { euro, LeadHome, PhoneFrame, pts, SavedSheet, SellerHome, SignIn } from "./phone";
import { SoundEffects, SoundToggle } from "./sound";

interface Session {
  token: string;
  name: string;
  role: "seller" | "lead";
}

// One database per page load, shared across React's double-mount in development.
let booting: Promise<SalesDb> | null = null;
function bootDatabase() {
  booting ??= SalesDb.open(new PGlite({ extensions: { pgcrypto } }), schema);
  return booting;
}

export function App() {
  const [db, setDb] = useState<SalesDb | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState<Day | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [basket, setBasket] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ points: number; euros: number; lines: string[] } | null>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [split, setSplit] = useState<{ name: string; sold: number; euros: number }[]>([]);
  const [recent, setRecent] = useState<RecentSale[]>([]);
  const [logs, setLogs] = useState<QueryLog[]>([]);
  const visitorToken = useRef<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const refresh = useCallback(async (database: SalesDb) => {
    const [rows, productRows, recentRows] = await Promise.all([database.leaderboard(), database.productSplit(), database.recentSales()]);
    setBoard(rows);
    setSplit(productRows);
    setRecent(recentRows);
    const current = sessionRef.current;
    if (current?.role === "seller") setDay(await database.myDay(current.token));
  }, []);

  useEffect(() => {
    let active = true;
    bootDatabase()
      .then(async (database) => {
        if (!active) return;
        database.onQuery((entry) => setLogs((current) => [entry, ...current].slice(0, 30)));
        setProducts(await database.products());
        setDb(database);
        await refresh(database);
      })
      .catch((error) => setBootError(String(error)));
    return () => {
      active = false;
    };
  }, [refresh]);

  // Teammates sign in quietly and keep selling, so the leaderboard moves while you watch.
  useEffect(() => {
    if (!db) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tokens: string[] = [];
    (async () => {
      for (const mate of TEAMMATES) tokens.push(await db.signIn(mate.name, mate.pin, "Kamppi", { log: false }));
      const tick = async () => {
        if (stopped) return;
        const token = tokens[Math.floor(Math.random() * tokens.length)]!;
        await db.logSales(token, [{ productId: pickProduct(Math.random), quantity: 1 }], { log: false });
        await refresh(db);
        timer = setTimeout(tick, 3_500 + Math.random() * 5_000);
      };
      timer = setTimeout(tick, 2_500);
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [db, refresh]);

  useEffect(() => {
    if (!db) return;
    const timer = setInterval(() => void refresh(db), 4_000);
    return () => clearInterval(timer);
  }, [db, refresh]);

  const signIn = async (name: string, pin: string, location: string) => {
    if (!db) return;
    setBusy(true);
    try {
      const token = await db.signIn(name, pin, location);
      const next: Session = { token, name, role: name === "Leena" ? "lead" : "seller" };
      if (name === "You") visitorToken.current = token;
      sessionRef.current = next;
      setSession(next);
      setSignInError(null);
      sound.success();
      await refresh(db);
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : String(error));
      sound.refuse();
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    sessionRef.current = null;
    setSession(null);
    setDay(null);
    setBasket({});
  };

  const step = (productId: number, delta: 1 | -1) =>
    setBasket((current) => ({ ...current, [productId]: Math.min(20, Math.max(0, (current[productId] ?? 0) + delta)) }));

  const activity = async (kind: ActivityKind, delta: 1 | -1) => {
    if (!db || !session) return;
    await db.logActivity(session.token, kind, delta);
    await refresh(db);
  };

  const save = async () => {
    if (!db || !session) return;
    const items = products.filter((p) => (basket[p.id] ?? 0) > 0).map((p) => ({ productId: p.id, quantity: basket[p.id]! }));
    setSaving(true);
    try {
      const totals = await db.logSales(session.token, items);
      sound.confirm();
      setSaved({
        ...totals,
        lines: items.map((item) => {
          const product = products.find((p) => p.id === item.productId)!;
          return `${product.name} ×${item.quantity} · ${euro(product.euros * item.quantity)} · ${pts(product.points * item.quantity)}`;
        }),
      });
      setBasket({});
      await refresh(db);
    } finally {
      setSaving(false);
    }
  };

  const voidSale = async (sale: RecentSale) => {
    if (!db || !session) return;
    await db.voidSale(session.token, sale.id).catch(() => undefined);
    await refresh(db);
  };

  // Each attempt is a real query as the app role; the database's answer lands in the log.
  const attempt = async (id: string) => {
    const token = visitorToken.current;
    if (!db || !token) return;
    // Every refusal gets the same low, muted note the portfolio uses for "the database said no".
    const ignore = () => sound.refuse();
    if (id === "insert") {
      await db.run("insert into sales (seller_id, product_id, quantity, points, euros) values (1, 1, 1, 999, 999)").catch(ignore);
    } else if (id === "price") {
      await db.run("select * from log_sales($1, $2::jsonb)", [token, '[{"product_id": 1, "quantity": 1, "euros": 999}]']).catch(ignore);
    } else if (id === "pins") {
      await db.run("select name, pin_hash from sellers").catch(ignore);
    } else if (id === "guess") {
      const guess = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
      await db.signIn("Aino", guess === "1111" ? "0000" : guess, "Kamppi").catch(ignore);
    } else if (id === "void") {
      const target = recent.find((sale) => !sale.voided);
      if (target) await db.voidSale(token, target.id).catch(ignore);
    }
    await refresh(db);
  };

  let screen;
  if (!db) {
    screen = (
      <div className="grid h-full place-items-center px-8 text-center">
        <div>
          <div className="mx-auto size-10 animate-spin rounded-full border-2 border-brand/30 border-t-brand" aria-hidden />
          <p className="mt-5 font-display text-[16px]">{bootError ? "Couldn't start the database" : "Starting PostgreSQL…"}</p>
          <p className="mt-2 text-[13px] text-ash">{bootError ?? "A real database, running inside your browser."}</p>
        </div>
      </div>
    );
  } else if (!session) {
    screen = <SignIn busy={busy} error={signInError} onSignIn={signIn} />;
  } else if (session.role === "lead") {
    screen = <LeadHome recent={recent} onVoid={voidSale} onSignOut={signOut} />;
  } else if (day) {
    screen = (
      <SellerHome
        day={day}
        products={products}
        basket={basket}
        saving={saving}
        onStep={step}
        onActivity={activity}
        onSave={save}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="min-h-dvh">
      <SoundEffects />
      <header className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 pt-6 md:px-8">
        <p className="font-display text-[15px] font-semibold tracking-[-0.02em]">
          FlagSales <span className="text-brand">Live</span>
        </p>
        <nav className="flex gap-2 text-[13px]">
          <SoundToggle className="rounded-full border border-line px-3.5 py-1.5 font-mono text-[12px] text-ash hover:text-bone" bar="bg-bone" />
          <a href="https://github.com/mgndxb/flagsales-live" className="rounded-full border border-line px-3.5 py-1.5 text-ash hover:text-bone">
            Source
          </a>
          <a href="https://magnus.is-a.dev/" className="rounded-full border border-line px-3.5 py-1.5 text-ash hover:text-bone">
            Magnus Kaur ↗
          </a>
        </nav>
      </header>

      <section className="mx-auto max-w-[1400px] px-4 pt-12 pb-10 md:px-8">
        <h1 className="font-display text-[clamp(2.4rem,6vw,5rem)] leading-[0.95] font-extrabold tracking-[-0.045em]">
          Log a sale.
          <br />
          <span className="text-brand">Try to cheat.</span>
        </h1>
        <p className="mt-6 max-w-[62ch] text-[16px] leading-relaxed text-bone/80">
          A field-sales team of about 20 used to count its sales by reading a WhatsApp chat. I built them an app instead,
          and they used it every day for over a year. This is a rebuild with made-up people and products, so you can try
          it: sign in on the phone, log a sale and watch the leaderboard move. Then try to break the rules. A real
          PostgreSQL database runs in your browser, and it says no.
        </p>
      </section>

      <main className="mx-auto grid max-w-[1400px] items-start gap-6 px-4 pb-20 md:px-8 lg:grid-cols-[390px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6">
          <PhoneFrame>
            {screen}
            {saved && <SavedSheet saved={saved} onClose={() => setSaved(null)} />}
          </PhoneFrame>
        </div>
        <div className="space-y-6">
          <Leaderboard rows={board} me={session?.role === "seller" ? session.name : null} />
          <RecentFeed recent={recent} />
          <TeamPanel rows={board} split={split} />
        </div>
        <div className="space-y-6 lg:col-start-2 xl:col-start-auto">
          <BreakIt disabled={!visitorToken.current} onAttempt={attempt} />
          <QueryConsole logs={logs} />
        </div>
      </main>

      <footer className="mx-auto max-w-[1400px] border-t border-line px-4 py-10 text-[13px] text-ash md:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          <p>
            <strong className="text-bone">The database owns the rules.</strong> The page runs as a Postgres role that can only call
            functions and read views. It can't touch a table, set a price or read a PIN.
          </p>
          <p>
            <strong className="text-bone">PINs are bcrypt hashes.</strong> Five wrong tries in five minutes lock a seller out, and
            that counter survives the failed sign-in instead of being rolled back with it.
          </p>
          <p>
            <strong className="text-bone">Built by Magnus Kaur</strong> with TypeScript, React, Vite and PGlite (PostgreSQL 18 in
            WebAssembly). All names, products and numbers are made up.
          </p>
        </div>
      </footer>
    </div>
  );
}
