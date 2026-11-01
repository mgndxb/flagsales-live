import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeEach, describe, expect, it } from "vitest";

import { LEAD, TEAMMATES, VISITOR } from "../db/seed";
import { minutesSinceTen, SalesDb } from "./db";

const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

let db: SalesDb;

beforeEach(async () => {
  // 13:00 Helsinki: three hours of seeded history for the teammates.
  db = await SalesDb.open(new PGlite({ extensions: { pgcrypto } }), schema, new Date("2026-11-01T11:00:00Z"));
});

describe("signing in", () => {
  it("accepts the right PIN and refuses a wrong one", async () => {
    await expect(db.signIn(VISITOR.name, VISITOR.pin, "Stand A")).resolves.toMatch(/^[0-9a-f-]{36}$/);
    await expect(db.signIn(VISITOR.name, "0000", "Stand A")).rejects.toThrow("Wrong PIN");
  });

  it("locks a seller out after five wrong PINs", async () => {
    for (let i = 0; i < 5; i++) await expect(db.signIn("Aino", "0000", "Stand A")).rejects.toThrow("Wrong PIN");
    await expect(db.signIn("Aino", TEAMMATES[0]!.pin, "Stand A")).rejects.toThrow("Too many wrong PINs");
  });
});

describe("logging sales", () => {
  it("prices the basket from the products table, not the client", async () => {
    const token = await db.signIn(VISITOR.name, VISITOR.pin, "Stand A");
    const totals = await db.logSales(token, [
      { productId: 1, quantity: 2 }, // 24-month fixed: 2 p, 45 €
      { productId: 8, quantity: 1 }, // contract type change: 0.25 p, 10 €
    ]);
    expect(totals).toEqual({ points: 4.25, euros: 100 });
    const day = await db.myDay(token);
    expect(day).toMatchObject({ name: "You", points: 4.25, euros: 100, sold: 3 });
  });

  it("refuses sales without a session", async () => {
    await expect(db.logSales("00000000-0000-0000-0000-000000000000", [{ productId: 1, quantity: 1 }])).rejects.toThrow(
      "Not signed in",
    );
  });

  it("puts the seller on the leaderboard and keeps the rank in the database", async () => {
    const token = await db.signIn(VISITOR.name, VISITOR.pin, "Stand A");
    await db.logSales(token, [{ productId: 1, quantity: 20 }]); // 40 points, more than any seeded morning
    const board = await db.leaderboard();
    expect(board[0]).toMatchObject({ name: "You", rank: 1, points: 40 });
    expect(board.map((row) => row.name)).not.toContain(LEAD.name); // leads don't compete
  });
});

describe("the app role", () => {
  it("cannot touch tables directly", async () => {
    await expect(db.run("insert into sales (seller_id, product_id, quantity, points, euros) values (1, 1, 1, 99, 999)")).rejects.toThrow(
      "permission denied for table sales",
    );
    await expect(db.run("select pin_hash from sellers")).rejects.toThrow("permission denied for table sellers");
    await expect(db.run("update products set euros = 0")).rejects.toThrow("permission denied for table products");
  });

  it("only lets a team lead void a sale", async () => {
    const seller = await db.signIn(VISITOR.name, VISITOR.pin, "Stand A");
    await db.logSales(seller, [{ productId: 3, quantity: 1 }]);
    const [sale] = await db.recentSales();
    await expect(db.voidSale(seller, sale!.id)).rejects.toThrow("Only a team lead can void sales");

    const lead = await db.signIn(LEAD.name, LEAD.pin, "Office");
    await db.voidSale(lead, sale!.id);
    expect((await db.recentSales())[0]).toMatchObject({ id: sale!.id, voided: true });
    expect((await db.myDay(seller)).points).toBe(0);
  });
});

describe("activities", () => {
  it("counts up and never goes below zero", async () => {
    const token = await db.signIn(VISITOR.name, VISITOR.pin, "Stand A");
    expect(await db.logActivity(token, "encounter", 1)).toBe(1);
    expect(await db.logActivity(token, "encounter", -1)).toBe(0);
    expect(await db.logActivity(token, "encounter", -1)).toBe(0);
    expect((await db.myDay(token)).encounters).toBe(0);
  });
});

describe("the query log", () => {
  it("records what ran and what Postgres answered", async () => {
    const entries: { sql: string; ok: boolean; result: string }[] = [];
    db.onQuery((entry) => entries.push(entry));
    await expect(db.signIn(VISITOR.name, "0000", "Stand A")).rejects.toThrow();
    expect(entries.at(-1)).toMatchObject({ ok: false, result: "Wrong PIN" });
    expect(entries.at(-1)!.sql).toContain("sign_in('You', '0000'");
  });
});

describe("minutesSinceTen", () => {
  it("uses Helsinki time", () => {
    expect(minutesSinceTen(new Date("2026-11-01T08:00:00Z"))).toBe(0); // 10:00 in Helsinki (UTC+2)
    expect(minutesSinceTen(new Date("2026-07-01T07:30:00Z"))).toBe(30); // 10:30 in summer (UTC+3)
  });
});
