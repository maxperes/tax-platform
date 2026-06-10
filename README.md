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
   pnpm db:migrate:deploy
   ```

   For local iteration you can still use **`pnpm db:push`** instead. Production (Docker / Railway) runs **`prisma migrate deploy`** on startup via `docker-entry.sh`.

   **Existing local DB created with `db push`?** Either keep using **`pnpm db:push`**, or baseline migrations: `pnpm db:migrate:deploy` on an empty DB, or mark migrations applied with `prisma migrate resolve --applied <name>` — see [Prisma baselining](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining-a-database).

   **Railway deploy failed with P3009 / missing tables?** On startup, `docker-entry.sh` auto-marks failed migrations as rolled back and retries. If deploy still fails, reset the Postgres service (pilot has no data to keep) and redeploy.

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

**US estimate MVP simplifications:** annual US estimates currently assume `filingStatus: "single"`, default FEIE/NIIT inputs to zero, and use a flat 15% capital-gains rate. Expand these when the US filing path goes live.

## Private launch (Shopify)

For an invite-only pilot linked from a Shopify store, deploy the app to a stable URL (e.g. `https://tax.yourbrand.com`) with `WEB_DIST` set so the UI and API share one origin. In production, set:

- `REGISTRATION_ENABLED=false` — blocks public signup (default is **closed** when `NODE_ENV=production` and the variable is unset)
- `JWT_SECRET` — strong random value (required in production)
- `ADMIN_TOKEN` — strong random value (required for `POST /api/admin/users`)

**Provision accounts** (share credentials with invited users out-of-band):

```bash
pnpm --filter @tax-platform/api create-user -- email@example.com 'secure-password'
```

Or via HTTP (no user JWT required; admin token only):

```bash
curl -X POST https://tax.yourbrand.com/api/admin/users \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"email":"email@example.com","password":"secure-password"}'
```

**Shopify setup:** In Shopify admin → Online Store → Navigation, add a menu item pointing to `https://tax.yourbrand.com/login`. Optionally create a store page with a button linking to the same URL.

The login URL is public; access control comes from only provisioning accounts you intend to invite. When you are ready to open self-service signup, set `REGISTRATION_ENABLED=true`.

## Main API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/config` | Public auth flags (`registrationEnabled`, `privacyPolicyUrl`) |
| POST | `/api/auth/register` | Register (403 when registration disabled) |
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
| GET | `/api/me/data-export` | Download full account data export (JSON) |
| POST | `/api/me/delete-account` | Delete account and all data (`password`, `confirm: "DELETE"`) |
| POST | `/api/admin/users` | Create user (`ADMIN_TOKEN` + `x-admin-token`; no user JWT) |
| DELETE | `/api/admin/users/:id` | Delete user (`ADMIN_TOKEN` + `x-admin-token`) |
| GET | `/api/admin/rule-overrides` | List merged rule overrides (optional `ADMIN_TOKEN` + `x-admin-token`) |

## Scripts

- `pnpm build` – build all workspaces  
- `pnpm test` – run tests (rules package)  
- `pnpm lint` – lint all packages  
