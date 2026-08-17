# Tax Platform — Tax Residency Impact Assessment

Strategic **Tax Residency Impact Assessment** for families considering Brazilian tax residency—not a DIRPF filing product.

The product answers: *If I become a Brazilian tax resident on date D, what changes in my financial, wealth, and tax life—and what can I do today to prepare?*

## Product layers

| Layer | Name | Purpose |
|-------|------|---------|
| 1 | **As Is** | Structured inventory of the family’s current tax posture (no recommendations) |
| 2 | **To Be** | Simulate Brazilian tax residency from a hypothesis date |
| 3 | **Planning** | Pre-move levers and action plan (Pro) |

## Plan tiers

| Tier | Access |
|------|--------|
| **Basic** | As Is + To Be (gross BR impact; no exemptions/credits/deductions applied); executive report sections 1–2; planning teaser |
| **Pro** | Planning Engine, relief application, multi-scenario compare, continuous Twin refresh |

Architecture: **Facts Engine** → **Legal Rules Engine** (cite-backed, reliability index) → **Planning Engine**. LLM extracts facts only; it never computes tax. See [documentation.md](./documentation.md) and [docs/tax-rules-governance.md](docs/tax-rules-governance.md).

Legacy conversational RF-001–RF-017 intake remains available alongside the Impact Assessment flow.

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

5. Run API and web:

   ```bash
   pnpm dev
   ```

- API: http://localhost:4000  
- Web: http://localhost:5173  

Database schema lives in [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma).

## Tax Residency Impact Assessment

| Layer | API / UI |
|-------|----------|
| As Is (Twin) | `POST /api/twins/ensure`, `PUT /api/twins`, web `/impact` |
| To Be + report | `POST /api/impact-assessments/run` |
| Documents | `POST /api/documents/upload`, `POST /api/documents/:id/confirm` |
| Planning (Pro) | Included in assessment `planningJson`; reliefs require `User.plan=pro` |
| Normative monitor | `GET /api/normative-monitor/status` (scaffold) |

Engines: Facts / Legal Rules / Planning in [`packages/rules/src/engines`](packages/rules/src/engines). Legal rule packs in [`packages/rules/src/legal`](packages/rules/src/legal).

## Tax calculation engine (BR + US, 2026)

- **Where the math lives:** deterministic code in [`packages/rules`](packages/rules) — data tables in `src/data/br/2026.ts` and `src/data/us/2026.ts`, engines in `src/engines/`. The LLM does **not** compute taxes.
- **Versioning:** `ENGINE_VERSION` is **1.2.0** in [`packages/shared/src/constants.ts`](packages/shared/src/constants.ts). Persisted on all calculations and reports via `ruleVersion` / `dataPackVersion`. See [docs/tax-rules-governance.md](docs/tax-rules-governance.md) for SME review and release process.
- **Fiscal profile routing:** `resident_brazil` / `non_resident_brazil` / `undetermined` → BR estimates + Carnê-Leão monthly; `resident_usa` → US annual estimate; `dual_residence` → both (flagged for review).
- **US capital gains:** 0/15/20% by holding period (long-term ≥ 365 days). Short-term flagged for review.
- **Exemptions & deductions:** applied in annual and monthly Carnê-Leão paths.
- **Capital gains:** merged into annual estimate totals per jurisdiction.
- **Structured reports:** `TaxReportSection` / `TaxReportItem` populated on report generation; HTML export available.

Confirm all statutory rates with a tax SME before production use.

## Domain modules (V1)

| Module | API | Workflow step |
|--------|-----|---------------|
| Patrimony (RF-007) | `POST/GET /api/assets` | `patrimony` |
| International transfers (RF-008) | `POST/GET /api/transfers` | `transfers` |
| Trust registry (RF-009/010) | `POST/GET /api/trusts` | `trust_registry` |
| PF vs PJ simulation (RF-013) | `POST/GET /api/entity-simulations` | `entity_simulation` |
| Exemptions | `POST/GET /api/exemptions` | via deductions step |
| Data change history (RF-014) | `GET /api/data-changes?taxYear=` | automatic on edits |

## Production deployment

Set in production:

- `JWT_SECRET` — strong random value (required)
- `ADMIN_TOKEN` — for script/API provisioning and rule-override routes
- `REGISTRATION_ENABLED=false` — optional; when unset, self-service signup is open. Set to `false` to disable public registration entirely.

### User registration and approval

When registration is enabled, new signups create a **pending** account. Users cannot sign in until an administrator approves them at `/admin/users` in the web app.

Bootstrap the first admin (approved immediately):

```bash
pnpm --filter @tax-platform/api create-user -- admin@example.com 'secure-password' --admin
```

For invite-only pilots (no public signup), set `REGISTRATION_ENABLED=false` and provision accounts:

```bash
pnpm --filter @tax-platform/api create-user -- email@example.com 'secure-password'
```

Admin-created accounts are **approved** automatically and skip the review queue.

## Main API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/config` | Public auth flags |
| POST | `/api/auth/register` | Register (creates pending account; 403 when registration disabled) |
| POST | `/api/auth/login` | Login (403 while pending or rejected) |
| POST | `/api/sessions` | Create conversation session |
| GET | `/api/sessions/:id` | Session + messages |
| POST | `/api/sessions/:id/messages` | Send chat message |
| POST | `/api/sessions/:id/messages/stream` | SSE stream |
| POST | `/api/sessions/:id/advance` | Advance workflow state |
| POST | `/api/incomes` | Add classified income |
| POST | `/api/deductions` | Add deduction |
| POST | `/api/exemptions` | Add exemption |
| POST | `/api/capital-gains` | Add capital gain |
| POST | `/api/assets` | Register asset / patrimony |
| POST | `/api/transfers` | Register international transfer |
| POST | `/api/trusts` | Register trust structure |
| POST | `/api/entity-simulations` | Run PF vs PJ simulation |
| GET | `/api/data-changes?taxYear=` | Data change audit log |
| POST | `/api/events/sync` | Rebuild taxable events |
| POST | `/api/monthly-tax/recompute` | Carnê-Leão monthly aggregation |
| POST | `/api/tax-calculation/estimate` | Annual estimate |
| POST | `/api/report` | Generate report |
| GET | `/api/report/latest?taxYear=` | Latest report metadata |
| GET | `/api/report/:id` | Fetch report with sections |
| GET | `/api/report/:id/download` | Download JSON |
| GET | `/api/report/:id/download.html` | Download printable HTML |
| GET | `/api/me/data-export` | Full account data export |
| POST | `/api/me/delete-account` | Delete account |
| POST | `/api/admin/users` | Create approved user (admin token) |
| GET | `/api/admin/users?status=` | List users (admin JWT) |
| POST | `/api/admin/users/:id/approve` | Approve pending user (admin JWT) |
| POST | `/api/admin/users/:id/reject` | Reject user (admin JWT) |
| PATCH | `/api/admin/users/:id` | Set `isAdmin` (admin JWT) |
| GET | `/api/tax-rules/freshness?taxYear=` | Compare stored calculations to active rule stamp |
| POST | `/api/admin/rule-overrides` | Upsert rule override (admin token) |
| PATCH | `/api/admin/rule-overrides/:id` | Update override value |
| DELETE | `/api/admin/rule-overrides/:id` | Remove override |
| POST | `/api/admin/rules/recompute-sessions` | Bulk recompute open sessions for tax year |
| GET | `/api/admin/rule-overrides` | List rule overrides |

## Scripts

- `pnpm build` – build all workspaces  
- `pnpm test` – run tests  
- `pnpm lint` – lint all packages  
