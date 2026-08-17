# Tax Rules Governance

How statutory tables and **legal rule packs** stay accurate, how releases are cut when laws change, and how users get fresh calculations.

## Executable regra-matriz catalog

First executable incidence rule: **`BR-IRPF-EXT-001`** (IRPF on foreign-source income of a Brazilian tax resident).

| Piece | Path |
|-------|------|
| Engine | `packages/rules/src/legal/matriz/br-irpf-ext-001.ts` → `applyBrIrpfExt001` |
| FX | `BR-CAMBIO-001` in `br-cambio-001.ts` |
| Foreign credit | `BR-CRED-EXT-001` in `br-cred-ext-001.ts` |
| Monthly table (vigência 2025-05-01) | `tables/br-irpf-mensal-2025-05.ts` |
| Regression fixtures | Cases A–E in `br-irpf-ext-001.test.ts` |
| Public-case fixtures | `packages/rules/src/legal/cases/` + `public-cases.test.ts` |

Contested exclusions (moléstia grave / over-65 on foreign pensions) never pick a side: dual scenarios + `revisao_profissional_obrigatoria`. Pre-residency income returns `fora_do_campo` (distinct from `isento`). Parameters (tables, PTAX, thresholds) must be SME-confirmed before production.

### Public-case fixtures

Cited replays of official RFB worked examples and anonymized CARF fact patterns. They validate Twin → Impact Assessment structure and, where the source publishes numbers, `BR-CAMBIO-001` / `BR-CRED-EXT-001`. They do **not** reproduce an auto de infração, penalties, or a full historical DIRPF.

| Case | Source | Asserted | Not asserted |
|------|--------|----------|--------------|
| `rfb-pr-irpf-2026-q140-ex1-germany` | [RFB P&R IRPF 2026 Q140](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf) Ex. 1 | FX US$ 10,000 × 5.2695 → R$ 52,695; full FTC R$ 5,269.50 (limit R$ 13,100); Twin IRPF + carnê-leão; gross To Be tax on converted BRL via 2026 annual table | RFB annual with/without R$ 32,100 / R$ 19,000 as engine output (other BR income); 2023 DAA |
| `rfb-pr-irpf-2026-q140-ex2-france` | Same Q140 Ex. 2 | FX US$ 4,400 × 5.2468 → R$ 23,085.92; FTC capped at R$ 3,900 | Twin report (legal-only) |
| `carf-2201-011-434-paraguay-vital-interests` | CARF Acórdão 2201-011.434 (public commentary) | `vital_interests_brazil` risk; additional review; IRPF + carnê-leão under residency hypothesis | Auto de infração / penalties (~R$ 1.6M); automatic `already_resident` holding |

## Legal Rules Engine (Impact Assessment)

Impact Assessment conclusions must be traceable to a normative source—not bare rate lookups. Each legal rule in `packages/rules/src/legal/` carries:

- sources (lei, IN, COSIT, treaty, jurisprudence)
- `effectiveFrom` / `repealedOn`
- hypothesis, exceptions, requirements
- `certaintyTier` (`very_high` | `high` | `medium` | `low` | `contested`)
- `dependsOnCosit` when the answer hinges on administrative interpretation

Rate data packs (`src/data/{br,us}/`) remain the numeric layer; legal packs explain *when* and *why* those rates apply. Normative monitoring (Congresso, RFB, DOU, CARF, IRS…) is Phase 3; until then packs are updated via SME review + `RuleOverride` / pack bumps. Freshness: `GET /api/tax-rules/freshness` and `GET /api/normative-monitor/status`.

## SME review process (before production)

Every data pack in `packages/rules/src/data/{br,us}/` must be signed off by a **tax subject-matter expert (SME)** before production use. The LLM chat layer never computes tax; only these packs and the deterministic engines do.

### Review checklist (per jurisdiction / tax year)

1. **Source documents** — Compare every bracket, rate, threshold, and deduction against the official publication (RFB for Brazil, IRS Rev. Proc. / Publication 17 for US). Record URLs in the pack's `*_DATA_PACK_META.sources`.
2. **Scope** — Confirm which income types, capital-gain regimes, and monthly vs annual tables the pack covers match product scope.
3. **Working estimates** — If CY tables are not yet published, document the proxy year used (e.g. "RFB 2024 monthly table until CY2026 published") in pack comments and meta.
4. **Patch keys** — Confirm `RuleOverride` keys in `merge-rule-data.ts` cover parameters likely to change mid-year without a deploy.
5. **Golden tests** — Run `pnpm --filter @tax-platform/rules test` and verify `golden-fixtures.test.ts` expected values against SME spreadsheet.
6. **Sign-off** — Set `lastValidatedAt` and `validatedBy` in the pack meta (or record in your internal compliance tracker). Do **not** deploy to production with `smeReviewRequired: true` and empty validation fields unless explicitly accepted as pilot-only.

### Current packs

| Pack ID | File | Tax year | SME status |
|---------|------|----------|------------|
| `br-2026-1` | `packages/rules/src/data/br/2026.ts` | 2026 | Review required before production |
| `us-2026-1` | `packages/rules/src/data/us/2026.ts` | 2026 | Review required before production |

## Release checklist when laws change

### Minor mid-year fix (no algorithm change)

1. SME validates the new value(s).
2. Insert or update rows in `RuleOverride` for `(jurisdiction, taxYear, key)` — see supported keys in `packages/rules/src/merge-rule-data.ts`.
3. Use admin API: `POST /api/admin/rule-overrides` (requires `ADMIN_TOKEN` + `x-admin-token`).
4. Optionally run `POST /api/admin/rules/recompute-sessions` with `{ "taxYear": 2026 }` to refresh open sessions.
5. Notify users that saved reports may show **rules outdated** until regenerated.

### Major change or new tax year

1. SME validates all affected tables.
2. Add or update data pack file(s), e.g. `packages/rules/src/data/br/2027.ts`.
3. Register the year in `packages/rules/src/data/registry.ts`.
4. Bump `DATA_PACK_*` id in `packages/shared/src/constants.ts` (e.g. `br-2026-1` → `br-2026-2`) or `ENGINE_VERSION` if calculation logic changed.
5. Extend `merge-rule-data.ts` if new overridable keys are needed.
6. Update unit and golden tests; run full rules test suite.
7. Deploy API (bundles `@tax-platform/rules`).
8. Run admin bulk recompute if needed.
9. Communicate to users to regenerate reports.

## Version stamps

Persisted on every calculation and report as `ruleVersion`:

```
engine@<ENGINE_VERSION>+data@<dataPackId>[+overrides@<fingerprint>]
```

Dual-residence reports combine BR and US stamps. Compare stored stamps to `GET /api/tax-rules/freshness?taxYear=` to detect outdated results.

## User recompute

After any rule update, users must refresh calculations:

- **Chat workflow** — advance through monthly calc or say regenerate report; pipeline runs `recomputeMonthlyTax` + `estimateAnnualTax`.
- **API** — `POST /api/monthly-tax/recompute`, `POST /api/tax-calculation/estimate`, `POST /api/report`.
- **UI** — Chat and report pages show a banner when `isRulesOutdated` is true from the freshness endpoint.

Existing rows keep their old `ruleVersion` until recomputed; this is intentional for audit trail.
