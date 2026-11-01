import type { PGlite } from "@electric-sql/pglite";

import { seedSql } from "../db/seed";

export interface QueryLog {
  id: number;
  sql: string;
  ok: boolean;
  /** Rows returned, or the database's own error message. */
  result: string;
  ms: number;
}

export interface Day {
  name: string;
  points: number;
  euros: number;
  sold: number;
  rank: number;
  sellers: number;
  goal: number;
  encounters: number;
  assessments: number;
  offers: number;
  signedInAt: Date;
}

export interface LeaderRow {
  name: string;
  points: number;
  euros: number;
  sold: number;
  rank: number;
  lastSaleAt: Date | null;
}

export interface Product {
  id: number;
  name: string;
  points: number;
  euros: number;
}

export interface RecentSale {
  id: number;
  seller: string;
  product: string;
  quantity: number;
  points: number;
  euros: number;
  createdAt: Date;
  voided: boolean;
}

export type ActivityKind = "encounter" | "assessment" | "offer";

/** Minutes since 10:00 Helsinki time, so the seeded morning matches the clock. */
export function minutesSinceTen(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return Number(parts.hour) * 60 + Number(parts.minute) - 10 * 60;
}

const num = (value: unknown) => Number(value ?? 0);

/**
 * Every call goes through `run`, which records the SQL and what Postgres said,
 * so the page can show exactly what happened behind each tap.
 */
export class SalesDb {
  private logId = 0;
  private listeners = new Set<(entry: QueryLog) => void>();

  private constructor(private readonly pg: PGlite) {}

  static async open(pg: PGlite, schema: string, now = new Date()): Promise<SalesDb> {
    await pg.exec(schema);
    await pg.exec(seedSql(minutesSinceTen(now)));
    // From here on the app is just `app`: functions and views, no tables.
    await pg.exec("set role app");
    return new SalesDb(pg);
  }

  onQuery(listener: (entry: QueryLog) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Runs any SQL as the app role and logs it. Used by the "try to break it" panel too. */
  async run<T = Record<string, unknown>>(sql: string, params: unknown[] = [], options: { log?: boolean } = {}): Promise<T[]> {
    const started = performance.now();
    const shown = params.reduce<string>((text, value, i) => text.replace(`$${i + 1}`, typeof value === "string" ? `'${value}'` : String(value)), sql);
    try {
      const result = await this.pg.query<T>(sql, params);
      if (options.log !== false) this.emit({ sql: shown, ok: true, result: `${result.rows.length} row${result.rows.length === 1 ? "" : "s"}`, ms: performance.now() - started });
      return result.rows;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.log !== false) this.emit({ sql: shown, ok: false, result: message, ms: performance.now() - started });
      throw new Error(message);
    }
  }

  private emit(entry: Omit<QueryLog, "id">) {
    const full = { ...entry, id: ++this.logId };
    for (const listener of this.listeners) listener(full);
  }

  async signIn(name: string, pin: string, location: string, options?: { log?: boolean }): Promise<string> {
    const started = performance.now();
    const [row] = await this.run<{ session_token: string | null; error: string | null }>(
      "select * from sign_in($1, $2, $3)",
      [name, pin, location],
      { log: false },
    );
    const token = row?.session_token ?? null;
    if (options?.log !== false) {
      this.emit({
        sql: `select * from sign_in('${name}', '${pin}', '${location}')`,
        ok: token !== null,
        result: token ? "Signed in" : (row?.error ?? "Refused"),
        ms: performance.now() - started,
      });
    }
    if (!token) throw new Error(row?.error ?? "Sign-in refused");
    return token;
  }

  async logSales(token: string, items: { productId: number; quantity: number }[], options?: { log?: boolean }) {
    const payload = JSON.stringify(items.map((item) => ({ product_id: item.productId, quantity: item.quantity })));
    const [row] = await this.run<{ points: string; euros: number }>("select * from log_sales($1, $2::jsonb)", [token, payload], options);
    return { points: num(row?.points), euros: num(row?.euros) };
  }

  async logActivity(token: string, kind: ActivityKind, delta: 1 | -1): Promise<number> {
    const [row] = await this.run<{ total: number }>("select log_activity($1, $2, $3) as total", [token, kind, delta]);
    return num(row?.total);
  }

  async voidSale(token: string, saleId: number) {
    await this.run("select void_sale($1, $2)", [token, saleId]);
  }

  async myDay(token: string): Promise<Day> {
    const [row] = await this.run<Record<string, unknown>>("select * from my_day($1)", [token], { log: false });
    return {
      name: String(row!.name),
      points: num(row!.points),
      euros: num(row!.euros),
      sold: num(row!.sold),
      rank: num(row!.rank),
      sellers: num(row!.sellers),
      goal: num(row!.goal),
      encounters: num(row!.encounters),
      assessments: num(row!.assessments),
      offers: num(row!.offers),
      signedInAt: new Date(row!.signed_in_at as string),
    };
  }

  async leaderboard(): Promise<LeaderRow[]> {
    const rows = await this.run<Record<string, unknown>>("select * from leaderboard_today order by rank, name", [], { log: false });
    return rows.map((row) => ({
      name: String(row.name),
      points: num(row.points),
      euros: num(row.euros),
      sold: num(row.sold),
      rank: num(row.rank),
      lastSaleAt: row.last_sale_at ? new Date(row.last_sale_at as string) : null,
    }));
  }

  async products(): Promise<Product[]> {
    const rows = await this.run<Record<string, unknown>>("select * from product_list", [], { log: false });
    return rows.map((row) => ({ id: num(row.id), name: String(row.name), points: num(row.points), euros: num(row.euros) }));
  }

  async productSplit(): Promise<{ name: string; sold: number; euros: number }[]> {
    const rows = await this.run<Record<string, unknown>>("select * from product_split_today", [], { log: false });
    return rows.map((row) => ({ name: String(row.name), sold: num(row.sold), euros: num(row.euros) }));
  }

  async recentSales(): Promise<RecentSale[]> {
    const rows = await this.run<Record<string, unknown>>("select * from recent_sales", [], { log: false });
    return rows.map((row) => ({
      id: num(row.id),
      seller: String(row.seller),
      product: String(row.product),
      quantity: num(row.quantity),
      points: num(row.points),
      euros: num(row.euros),
      createdAt: new Date(row.created_at as string),
      voided: Boolean(row.voided),
    }));
  }
}
