# Tax Platform (MVP)

Conversational tax intake (Brazil–US oriented) with a deterministic rules layer. See [documentation.md](./documentation.md) for requirements.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL)

## Setup

1. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

2. Copy environment file and set secrets:

   ```bash
   cp .env.example .env
   ```

   The database scripts load variables from this root `.env` file.

3. Install dependencies and generate Prisma client:

   ```bash
   pnpm install
   pnpm db:generate
   ```

4. Apply database schema:

   ```bash
   pnpm db:push
   ```

   After pulling changes, run **`pnpm db:push`** again if Prisma errors mention a missing column (for example `MonthlyTaxCalculation.jurisdiction`). For an **empty** database you can use **`pnpm db:migrate`** instead; if `migrate deploy` reports the database is not empty (P3005), keep using **`pnpm db:push`** for local dev or follow [Prisma baselining](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining-a-database).

5. Run API and web:

   ```bash
   pnpm dev
   ```

- API: http://localhost:4000  
- Web: http://localhost:5173  

LLM in `.env` (defaults):

- **No `OPENAI_API_KEY`**: the API targets **local Ollama** at `http://localhost:11434/v1` by default, with model **`llama3.2`** unless you set `OPENAI_MODEL`. Leave `OPENAI_API_KEY` empty unless your local server checks it.
- **Hosted OpenAI**: set `OPENAI_API_KEY` and omit `OPENAI_BASE_URL` (defaults to OpenAI’s cloud endpoint). Default model is **`gpt-4o-mini`** unless you set `OPENAI_MODEL`.
- **Other local servers** (LM Studio, vLLM): set `OPENAI_BASE_URL` and `OPENAI_MODEL` to match that server.
- **Disable LLM** (template-only intake): set `OPENAI_BASE_URL=` to an empty value and do not set `OPENAI_API_KEY`.
- **Privacy policy link** (optional): set `PRIVACY_POLICY_URL` so trust questions like "Where is your privacy policy?" return the official URL.

Database schema lives in [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma).

## Tax calculation engine (BR + US, 2026)

- **Where the math lives:** deterministic code in [`packages/rules`](packages/rules) — data tables in `src/data/br/2026.ts` and `src/data/us/2026.ts`, engines in `src/engines/`. The LLM does **not** compute taxes.
- **Versioning:** [`packages/shared/src/constants.ts`](packages/shared/src/constants.ts) exports `ENGINE_VERSION`, `DATA_PACK_BR_2026`, `DATA_PACK_US_2026`, and `buildRuleVersionStamp()`. Persisted fields: `ruleVersion`, `jurisdiction`, `dataPackVersion` on `TaxCalculation`, `MonthlyTaxCalculation`, `CapitalGainCalculation`, and `TaxReport`.
- **Fiscal profile routing:** `resident_brazil` / `non_resident_brazil` / `undetermined` → BR estimates + Carnê-Leão monthly; `resident_usa` → US annual estimate (Carnê-Leão recompute skipped); `dual_residence` → both BR and US estimates (flagged for review).
- **FX:** [`packages/rules/src/fx.ts`](packages/rules/src/fx.ts) — missing FX on non-BRL income sets `requiresAdditionalReview` instead of silently using `1:1`.
- **Hotfixes without deploy:** optional `RuleOverride` rows in Postgres; merged at calculation time. List with `GET /api/admin/rule-overrides` (optional `?taxYear=&jurisdiction=`). If `ADMIN_TOKEN` is set in `.env`, send header `x-admin-token: <token>`.

Bump **`ENGINE_VERSION`** when algorithm code changes; bump **`DATA_PACK_*`** (and table contents) when statutory numbers change. Confirm all rates with a tax SME before production.

## Main API routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| POST | `/api/sessions` | Create conversation session |
| GET | `/api/sessions/:id` | Session + messages |
| POST | `/api/sessions/:id/messages` | Send chat message |
| POST | `/api/sessions/:id/messages/stream` | SSE stream (requires LLM: API key and/or `OPENAI_BASE_URL`) |
| POST | `/api/sessions/:id/advance` | Advance workflow state |
| POST | `/api/incomes` | Add classified income |
| POST | `/api/deductions` | Add deduction |
| POST | `/api/capital-gains` | Add capital gain |
| POST | `/api/events/sync` | Rebuild taxable events from incomes |
| POST | `/api/monthly-tax/recompute` | RF-017 monthly aggregation |
| POST | `/api/tax-calculation/estimate` | RF-005 annual estimate |
| POST | `/api/report` | RF-012 generate report |
| GET | `/api/report/latest?taxYear=` | Latest report id/title for the user and year |
| GET | `/api/report/:id` | Fetch report JSON |
| GET | `/api/report/:id/download` | Download report as JSON file |
| GET | `/api/admin/rule-overrides` | List merged rule overrides (optional `ADMIN_TOKEN` + `x-admin-token`) |

## Scripts

- `pnpm build` – build all workspaces  
- `pnpm test` – run tests (rules package)  
- `pnpm lint` – lint all packages  
