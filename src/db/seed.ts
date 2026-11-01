/** Made-up people and products. Nothing here comes from the real FlagSales system. */

export interface DemoSeller {
  name: string;
  pin: string;
  role: "seller" | "lead";
}

export const VISITOR: DemoSeller = { name: "You", pin: "1234", role: "seller" };
export const LEAD: DemoSeller = { name: "Leena", pin: "9999", role: "lead" };
export const TEAMMATES: DemoSeller[] = [
  { name: "Aino", pin: "1111", role: "seller" },
  { name: "Eetu", pin: "2222", role: "seller" },
  { name: "Sara", pin: "3333", role: "seller" },
  { name: "Mikko", pin: "4444", role: "seller" },
  { name: "Noora", pin: "5555", role: "seller" },
];

export const PRODUCTS: { name: string; points: number; euros: number }[] = [
  { name: "24-month fixed", points: 2, euros: 45 },
  { name: "24-month fixed, promo", points: 2, euros: 30 },
  { name: "12-month fixed", points: 1, euros: 25 },
  { name: "6-month fixed", points: 1, euros: 10 },
  { name: "Campaign fixed", points: 1, euros: 20 },
  { name: "Spot price", points: 1, euros: 15 },
  { name: "Spot price, promo", points: 1, euros: 10 },
  { name: "Contract type change", points: 0.25, euros: 10 },
  { name: "Renewable add-on", points: 0.25, euros: 10 },
];

/** Popular products come up more often, like in real life. */
export const PRODUCT_WEIGHTS = [5, 6, 4, 2, 2, 4, 2, 2, 3];

export function pickProduct(random: () => number): number {
  const total = PRODUCT_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let i = 0; i < PRODUCT_WEIGHTS.length; i++) {
    roll -= PRODUCT_WEIGHTS[i]!;
    if (roll <= 0) return i + 1;
  }
  return 1;
}

/** Small deterministic generator, so the seeded history looks the same on every load. */
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function quote(text: string) {
  return `'${text.replaceAll("'", "''")}'`;
}

/**
 * SQL that fills the database. Teammates get a believable morning: sales spread
 * over the time since 10:00 Helsinki, a few each hour, never in the future.
 */
export function seedSql(minutesSinceTen: number): string {
  const people = [VISITOR, ...TEAMMATES, LEAD];
  const lines = [
    `insert into sellers (name, pin_hash, role) values ${people
      .map((p) => `(${quote(p.name)}, crypt(${quote(p.pin)}, gen_salt('bf', 6)), ${quote(p.role)})`)
      .join(", ")};`,
    `insert into products (name, points, euros, sort) values ${PRODUCTS.map(
      (p, i) => `(${quote(p.name)}, ${p.points}, ${p.euros}, ${i + 1})`,
    ).join(", ")};`,
  ];

  const random = seeded(20261101);
  const values: string[] = [];
  const span = Math.max(0, Math.min(minutesSinceTen, 9 * 60));
  TEAMMATES.forEach((_, index) => {
    const sellerId = index + 2; // the visitor is seller 1
    const pace = 0.5 + random(); // sales per hour differ per person
    const count = Math.round((span / 60) * pace);
    for (let i = 0; i < count; i++) {
      const productId = pickProduct(random);
      const product = PRODUCTS[productId - 1]!;
      const minutesAgo = Math.floor(random() * span);
      values.push(
        `(${sellerId}, ${productId}, 1, ${product.points}, ${product.euros}, now() - interval '${minutesAgo} minutes')`,
      );
    }
  });
  if (values.length) {
    lines.push(`insert into sales (seller_id, product_id, quantity, points, euros, created_at) values ${values.join(", ")};`);
  }
  return lines.join("\n");
}
