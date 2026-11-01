# FlagSales Live

**Log a sale. Try to cheat.** A rebuilt, try-it-yourself version of the sales app I built for a field-sales team, with made-up people and products.

**Try it:** https://magnus.is-a.dev/flagsales-live/

## The story

A field-sales team of about 20 counted its sales by reading a WhatsApp chat: someone scrolled through every message to work out who sold what and for how much. I built them an app where each seller signs in with a name and PIN and logs each sale from a product list. They used it every day for over a year. This repository is a clean rebuild for my portfolio: none of the original code or data is in it.

## What makes it interesting

A real **PostgreSQL 18** database runs in your browser through [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly), and the database, not the UI, owns the rules:

- **The app is just a role.** After setup the page runs `set role app`. That role can call a handful of functions and read a few views. It cannot select, insert or update a single table. Try "Insert a sale directly" on the page: `permission denied for table sales`.
- **Prices come from the database.** `log_sales` takes product ids and quantities only and reads points and euros from `products`. "Send my own price" passes `euros: 999`; the sale is recorded at the real 45 €.
- **PINs are bcrypt hashes** (`pgcrypto`), unreadable even to the app role. Five wrong PINs in five minutes lock a seller out.
- **A bug the tests caught:** the first version raised an exception on a wrong PIN, which rolled back the failed-attempt row along with it, so the lockout could never trigger. `sign_in` now returns the failure instead of raising.
- **Only team leads void sales**, checked inside `void_sale`, not in the UI.
- **Everything is visible.** The "Under the hood" panel shows each query and Postgres's exact answer.

Teammates are simulated: they sign in through the same `sign_in` function and log sales through the same `log_sales` every few seconds, so the leaderboard moves while you watch.

## Stack

TypeScript, React 19, Vite, Tailwind CSS v4, PGlite (PostgreSQL 18 + pgcrypto), Vitest.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173/flagsales-live/
npm test         # the rules, tested against real Postgres
npm run verify   # typecheck + tests + production build
```

The schema is one file: [`src/db/schema.sql`](src/db/schema.sql).

Built by [Magnus Kaur](https://magnus.is-a.dev).
