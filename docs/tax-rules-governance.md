# Tax Rules Governance

How statutory tables stay accurate, how releases are cut when laws change, and how users get fresh calculations.

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
