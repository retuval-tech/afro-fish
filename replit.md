# Afro Fish

A local cash-in/cash-out fish arcade gaming platform with two games: Fish Hunter and Dragon King. Players buy in with cash (admin loads credits), play, and cash out locally. Designed for big-screen PC/TV deployment.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000/8080)
- `pnpm --filter @workspace/afro-fish run dev` — run the frontend (port varies)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `ADMIN_PIN` — default `1234` (4-digit admin passcode)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (canvas-based game engines)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for API contract
- `lib/db/src/schema/` — all 5 DB tables (players, sessions, transactions, gameSessions, gameConfig)
- `artifacts/api-server/src/routes/` — auth, game, admin route handlers
- `artifacts/afro-fish/src/pages/` — all frontend pages
- `artifacts/afro-fish/src/pages/FishHunterGame.tsx` — Fish Hunter canvas engine
- `artifacts/afro-fish/src/pages/DragonKingGame.tsx` — Dragon King canvas engine

## Architecture decisions

- Points-only economy (no crypto). Admin loads credits for cash; players cash out through admin panel.
- Session tokens are SHA256 hashes stored in `sessions` table. No JWT dependency.
- Admin key is SHA256(pin + "afrofish_admin") — sent as query param to all admin endpoints.
- Win rate is configurable per game per tier (bronze/silver/gold) via admin panel.
- Game bet = weaponMultiplier × tierMult (bronze=1, silver=10, gold=100). 

## Product

- **Player Login** (`/`): Name + 4-digit PIN login
- **Lobby** (`/lobby`): Game selection (Fish Hunter, Dragon King × 3 tiers) + leaderboard
- **Fish Hunter** (`/game/fish-hunter?tier=X`): Underwater canvas game, click fish to shoot
- **Dragon King** (`/game/dragon-king?tier=X`): Fantasy canvas game, click dragons to slay
- **Admin Panel** (`/admin`): PIN-protected dashboard, player management (create/reload/cashout/delete), transaction history, win rate config

## User preferences

- Big-screen PC/TV target — full-screen canvas games
- Local arcade hall deployment
- Cash in / cash out model (no online payments)

## Gotchas

- After schema changes, run `pnpm --filter @workspace/db run push` then restart the API server
- After OpenAPI changes, run `pnpm --filter @workspace/api-spec run codegen` then rebuild
- `ADMIN_PIN` defaults to `1234` if not set — change before production use
- Demo player: "Demo Player" / PIN 1234 / 1000 credits (seeded at setup)

## Desktop installer

The `artifacts/desktop` package wraps the whole stack (frontend + API + PGlite DB) in an Electron app so the arcade PC can run fully offline. Once a night it uploads a snapshot of the local DB to this Replit cloud deployment, viewable on **Admin → Backups**.

- `pnpm --filter @workspace/desktop run build` — bundle main process + frontend
- `pnpm --filter @workspace/desktop run dist:win|dist:mac|dist:linux` — produce installers (must run on a host with matching OS, or Wine for Windows)
- Local data lives in the OS user-data folder for "Afro Fish Arcade"
- See `artifacts/desktop/README.md` for the full guide

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
