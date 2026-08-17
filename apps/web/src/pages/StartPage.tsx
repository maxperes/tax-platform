import { FileStack, Globe2, UserRound } from "lucide-react";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SecondaryButton } from "../components/ui/SecondaryButton";
import { DisclaimerBox } from "../components/ui/DisclaimerBox";

const CARDS = [
  {
    icon: UserRound,
    title: "About you",
    body: "Citizenship, residence, family situation and your history of entering and leaving Brazil.",
    detail: "Around 12 questions"
  },
  {
    icon: Globe2,
    title: "International finances",
    body: "The categories of income you receive and the assets you hold, in Brazil and elsewhere.",
    detail: "Selection plus details only where needed"
  },
  {
    icon: FileStack,
    title: "Documents and tax history",
    body: "Where you have filed, what tax you have already paid abroad, and which papers you can find.",
    detail: "Checklist with optional upload"
  }
];

export function StartPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header signedIn />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-3xl px-5 py-14 lg:px-8">
          <p className="eyebrow">Before you begin</p>
          <h1 className="mt-3 font-display text-3xl leading-tight text-navy sm:text-4xl">
            A structured look at your Brazilian tax position
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate">
            The assessment takes about fifteen minutes. You can leave any question blank, and every
            legal or tax question has an option for saying you are not sure — that answer is useful
            in itself. Prefer conversation? Start with the AI copilot from home — it builds the same
            360° map.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {CARDS.map((card) => (
              <section key={card.title} className="rounded-xl border border-surface-border bg-white p-5 shadow-card">
                <card.icon className="h-5 w-5 text-accent" aria-hidden="true" />
                <h2 className="mt-4 font-display text-base text-navy">{card.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate">{card.body}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-navy-500">{card.detail}</p>
              </section>
            ))}
          </div>

          <div className="mt-10">
            <DisclaimerBox variant="critical" title="Not tax advice">
              The software organises facts and runs a rules engine. It does not decide residency or
              replace a qualified professional.
            </DisclaimerBox>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryButton href="/impact">Begin assessment</PrimaryButton>
            <SecondaryButton href="/sessions">Back to home</SecondaryButton>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
