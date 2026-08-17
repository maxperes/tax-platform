import Link from "next/link";
import {
  Banknote,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Coins,
  FileSearch,
  Globe2,
  Home,
  Landmark,
  Laptop,
  Lock,
  PiggyBank,
  Plane,
  ScrollText,
  ShieldCheck,
  TrendingUp,
  Users,
  UserCheck,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PrimaryButton from "@/components/ui/PrimaryButton";
import SecondaryButton from "@/components/ui/SecondaryButton";
import DisclaimerBox from "@/components/ui/DisclaimerBox";

const STEPS = [
  {
    title: "Tell us about your international life",
    body: "Citizenship, time in Brazil, where you file, what you earn and what you own. Plain questions, with room to say you are not sure.",
  },
  {
    title: "Organise your documents",
    body: "Work through a checklist of the paperwork a Brazilian analysis usually needs, and mark what you already have.",
  },
  {
    title: "Receive your 360° tax map",
    body: "See your income, assets, filings and gaps laid out country by country, with the points that need a closer look.",
  },
  {
    title: "Request professional review",
    body: "Hand the whole picture to a tax professional, who works from an organised file instead of a blank page.",
  },
];

const FEATURES = [
  {
    icon: CalendarClock,
    title: "Tax residency timeline",
    body: "Entries, exits and filings placed on one timeline, so the periods that matter are visible.",
  },
  {
    icon: Globe2,
    title: "Global asset mapping",
    body: "Accounts, property and holdings grouped by country rather than scattered across statements.",
  },
  {
    icon: FileSearch,
    title: "Foreign income classification",
    body: "Each income category flagged for the classification questions it tends to raise in Brazil.",
  },
  {
    icon: Coins,
    title: "Foreign tax credit screening",
    body: "Where tax was already paid abroad, an early view of what a credit analysis would need.",
  },
  {
    icon: PiggyBank,
    title: "Retirement income assessment",
    body: "Pensions and social security separated by legal nature, because the treatment can differ.",
  },
  {
    icon: ShieldCheck,
    title: "Risk and inconsistency alerts",
    body: "Points where your answers pull in different directions, surfaced instead of buried.",
  },
  {
    icon: ClipboardCheck,
    title: "Filing preparation",
    body: "A running list of what is still missing before anything could be filed.",
  },
  {
    icon: UserCheck,
    title: "Professional review workflow",
    body: "One structured handover, so the first professional hour is spent on analysis, not intake.",
  },
];

const AUDIENCES = [
  { icon: Plane, label: "American retirees in Brazil" },
  { icon: Laptop, label: "Digital nomads" },
  { icon: TrendingUp, label: "International investors" },
  { icon: Home, label: "Foreign property owners" },
  { icon: Building2, label: "Business owners" },
  { icon: Users, label: "Dual-resident families" },
  { icon: Briefcase, label: "Executives with equity compensation" },
  { icon: Landmark, label: "Brazilians returning from abroad" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-surface-border bg-surface-muted">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            aria-hidden="true"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 80% 50% at 90% 10%, rgba(255,90,54,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 10% 90%, rgba(17,27,39,0.06), transparent 50%)",
            }}
          />
          <div className="relative mx-auto max-w-content px-5 py-16 lg:px-8 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-center">
              <div>
                <p className="font-display text-4xl leading-none tracking-tight text-navy sm:text-5xl">
                  VIA
                  <span
                    className="ml-1 inline-block h-2.5 w-2.5 -translate-y-3 rounded-full bg-accent align-middle sm:h-3 sm:w-3 sm:-translate-y-4"
                    aria-hidden="true"
                  />
                </p>
                <p className="mt-3 text-sm font-medium uppercase tracking-[0.22em] text-accent">
                  Know where you are. Know where you&apos;re going.
                </p>
                <h1 className="mt-6 font-display text-3xl leading-[1.15] tracking-tight text-navy sm:text-4xl">
                  Maps your tax life so you can move forward with clarity and
                  confidence.
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate">
                  Map your international income, assets, tax residency and
                  documentation through a structured Brazilian tax assessment.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <PrimaryButton href="/start">Start your assessment</PrimaryButton>
                  <SecondaryButton href="/report">View demo report</SecondaryButton>
                </div>
                <div className="mt-8 max-w-xl">
                  <DisclaimerBox variant="warning">
                    Demo environment. Do not upload real or sensitive documents.
                  </DisclaimerBox>
                </div>
              </div>

              <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
                <p className="eyebrow">Sample tax map</p>
                <p className="mt-2 text-sm text-slate">
                  What the assessment assembles, using invented answers.
                </p>
                <div className="mt-5 flex items-center gap-2" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                  <span className="h-px flex-1 bg-gradient-to-r from-accent to-surface-border" />
                  <span className="h-2 w-2 rounded-full border-2 border-accent bg-white" />
                  <span className="h-px flex-1 bg-surface-border" />
                  <span className="h-2 w-2 rounded-full border border-surface-border bg-surface-border" />
                </div>
                <dl className="mt-6 divide-y divide-surface-border border-y border-surface-border">
                  {[
                    { country: "United States", detail: "Pension, dividends, brokerage", state: "Foreign tax reported" },
                    { country: "Brazil", detail: "Presence over 183 days", state: "Residency under review" },
                    { country: "Portugal", detail: "Rental property", state: "Document missing" },
                  ].map((row) => (
                    <div
                      key={row.country}
                      className="flex items-start justify-between gap-4 py-4"
                    >
                      <div>
                        <dt className="font-display text-base text-navy">
                          {row.country}
                        </dt>
                        <dd className="mt-0.5 text-xs text-slate">
                          {row.detail}
                        </dd>
                      </div>
                      <dd className="shrink-0 text-right text-xs font-medium text-navy-700">
                        {row.state}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-xs text-slate">
                  Illustration only. No calculation is performed in this prototype.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="border-b border-surface-border">
          <div className="mx-auto max-w-content px-5 py-16 lg:px-8">
            <h2 className="max-w-3xl font-display text-3xl leading-tight text-navy">
              International financial lives do not fit into ordinary tax forms.
            </h2>
            <div className="mt-8 grid gap-6 text-base leading-relaxed text-slate md:grid-cols-2">
              <p>
                You might draw a pension in one country, hold a brokerage account in
                another, own an apartment in a third and spend half the year in
                Brazil. Each of those facts sits in a different statement, in a
                different language, under a different set of rules.
              </p>
              <p>
                Ordinary forms ask you to declare the answer. They do not help you
                work out what the answer is. Residency, classification of foreign
                income, credits for tax already paid and reporting duties for
                companies or trusts all have to be established first.
              </p>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                "Income earned in more than one country",
                "Bank and brokerage accounts held abroad",
                "Pensions and social security from a former employer or state",
                "Property in one country, residence in another",
                "Companies, partnerships or trusts you hold an interest in",
                "Years where two countries could both claim you",
              ].map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-surface-border bg-white px-4 py-3 text-sm text-navy-700"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-b border-surface-border bg-white">
          <div className="mx-auto max-w-content px-5 py-16 lg:px-8">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 font-display text-3xl text-navy">
              Four stages, in order
            </h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="rounded-xl border border-surface-border bg-surface-muted p-6"
                >
                  <span className="font-display text-sm font-semibold text-accent-dark">
                    Stage {index + 1}
                  </span>
                  <h3 className="mt-3 font-display text-lg leading-snug text-navy">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-b border-surface-border">
          <div className="mx-auto max-w-content px-5 py-16 lg:px-8">
            <p className="eyebrow">Features</p>
            <h2 className="mt-3 font-display text-3xl text-navy">
              What the assessment covers
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-xl border border-surface-border bg-white p-6 shadow-card"
                >
                  <feature.icon
                    className="h-5 w-5 text-accent"
                    aria-hidden="true"
                  />
                  <h3 className="mt-4 font-display text-base leading-snug text-navy">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate">
                    {feature.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Audiences */}
        <section className="border-b border-surface-border bg-white">
          <div className="mx-auto max-w-content px-5 py-16 lg:px-8">
            <p className="eyebrow">Who it is for</p>
            <h2 className="mt-3 font-display text-3xl text-navy">
              Built for people whose money crosses borders
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map((audience) => (
                <li
                  key={audience.label}
                  className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-muted px-4 py-4"
                >
                  <audience.icon
                    className="h-4 w-4 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-navy">
                    {audience.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="border-b border-surface-border">
          <div className="mx-auto max-w-content px-5 py-16 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <p className="eyebrow">Security</p>
                <h2 className="mt-3 font-display text-3xl text-navy">
                  What this prototype does with your answers
                </h2>
                <p className="mt-4 text-base leading-relaxed text-slate">
                  Nothing you type leaves your browser. There is no account, no
                  server, no database and no analytics behind this demo. Answers stay
                  in local storage on this device until you clear them, which you can
                  do from the footer at any time.
                </p>
              </div>
              <ul className="grid gap-3 self-start">
                {[
                  { icon: Lock, text: "File upload is disabled — the document screen only records what you have." },
                  { icon: ShieldCheck, text: "No CPF, passport or bank numbers are ever requested." },
                  { icon: ScrollText, text: "No data is sent to external APIs, and no marketing cookies are set." },
                  { icon: Banknote, text: "No payment is taken and no tax calculation is performed." },
                ].map((item) => (
                  <li
                    key={item.text}
                    className="flex items-start gap-3 rounded-lg border border-surface-border bg-white px-4 py-4"
                  >
                    <item.icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-navy-700">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Professional review */}
        <section
          id="professional-review"
          className="border-b border-surface-border bg-white"
        >
          <div className="mx-auto max-w-content px-5 py-16 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="eyebrow">Professional review</p>
                <h2 className="mt-3 font-display text-3xl text-navy">
                  Where the software stops and a professional starts
                </h2>
                <p className="mt-4 text-base leading-relaxed text-slate">
                  The assessment organises facts and flags questions. It does not
                  decide your residency, calculate what you owe, or tell you a credit
                  is available. Those are judgements, and they belong to a qualified
                  professional who can look at your documents and the treaty position.
                </p>
                <div className="mt-8">
                  <SecondaryButton href="/report">
                    See how a review request works
                  </SecondaryButton>
                </div>
              </div>
              <div className="rounded-xl border border-surface-border bg-surface-muted p-6">
                <h3 className="font-display text-base text-navy">
                  What the reviewer receives
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-slate">
                  {[
                    "Your answers, with everything you marked as uncertain",
                    "The document checklist and its gaps",
                    "Countries, income categories and asset categories identified",
                    "The points the assessment flagged for closer analysis",
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-navy">
          <div className="mx-auto max-w-content px-5 py-16 text-center lg:px-8 lg:py-20">
            <h2 className="mx-auto max-w-2xl font-display text-3xl leading-tight text-white sm:text-4xl">
              Know where you are. Know where you&apos;re going.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/75">
              Around fifteen minutes, no account, no documents.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/start"
                className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Start demo assessment
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
