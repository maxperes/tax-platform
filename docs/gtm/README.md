# VIA — navigable prototype

A demo-only MVP for user testing. It has no backend, no database, no
authentication, no payments, no OCR and no file upload. Nothing is calculated and
nothing leaves the browser.

## Requirements

- Node.js 18.17 or newer
- npm 9 or newer

## Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```

## Routes

| Route | Screen |
|---|---|
| `/` | Landing page |
| `/start` | Assessment overview and demo warning |
| `/assessment` | Six-step questionnaire with summary |
| `/documents` | Document checklist, uploads disabled |
| `/dashboard` | Preliminary tax map |
| `/report` | Preliminary report and review request |

## How data moves

One key in `localStorage`, `gtm.demo.v1`, holds a `DemoRecord`
(`lib/types.ts`). `context/DemoDataProvider.tsx` hydrates it in `useEffect` — never
during render, so server and client markup match — and writes back on change with a
250 ms debounce.

The dashboard and report hold no state of their own. They call pure functions in
`lib/derive.ts` over the record. When the record is empty, `lib/fallback.ts`
supplies an invented profile and the screen says so.

`Clear demo data` in the footer removes the key and resets the in-memory state.

## Structure

```
app/                    routes; (assessment) group shares the internal nav
components/layout/      Header, Footer, AssessmentNav, ClearDemoDataButton
components/ui/          buttons, ProgressBar, StatusBadge, cards, ReviewModal
components/form/        Field, RadioGroup, MultiSelectGrid, NotSureToggle
components/assessment/  StepRenderer, AssessmentSummary
components/dashboard/   ResidencyTimeline, CountryCard, FindingRow, AnalysisAreaCard
context/                DemoDataProvider
lib/                    types, options, questions, storage, fallback, derive
```

The questionnaire is data-driven: `lib/questions.ts` defines the six steps and
their fields, and `StepRenderer` renders whatever is there. Adding or reordering a
question is an edit to that one file.

## Deploying the prototype

**Vercel** — push the repository, import it at vercel.com, accept the detected
Next.js settings, deploy. No environment variables are needed.

**Netlify** — new site from Git, build command `npm run build`, and install the
Next.js runtime plugin when prompted.

**Any Node host** — `npm run build`, then `npm run start` behind a reverse proxy on
port 3000.

Since testers will reach a public URL, put it behind a password or a link only
given to the five testers. `robots` is already set to `noindex`.

## Safety rules built in

- No CPF, passport or bank numbers are requested anywhere.
- File upload is disabled; the drop zone is inert and says so on drag.
- No external API calls, no analytics, no marketing cookies.
- Every screen states that the data is fictitious and that this is not advice.
- Residency is never concluded. Findings use "potential" and "requires analysis".

## What to watch in testing

Run each of the five testers through the flow without helping. Note where they
stop, which questions they misread, which documents they cannot identify, whether
they grasp the difference between a preliminary map and a professional review, what
they expected the dashboard to show, whether they would trust it, what they would
pay, and whether they would pay before or after the first analysis.
