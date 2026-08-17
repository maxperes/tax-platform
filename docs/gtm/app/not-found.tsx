import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PrimaryButton from "@/components/ui/PrimaryButton";
import SecondaryButton from "@/components/ui/SecondaryButton";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex flex-1 items-center">
        <div className="mx-auto max-w-xl px-5 py-20 text-center lg:px-8">
          <p className="eyebrow">Page not found</p>
          <h1 className="mt-3 font-display text-3xl text-navy">
            That page is not part of the prototype
          </h1>
          <p className="mt-3 text-base text-navy-700/80">
            The demo has six screens. Start from the beginning or jump straight to
            the sample report.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <PrimaryButton href="/start">Start assessment</PrimaryButton>
            <SecondaryButton href="/report">View demo report</SecondaryButton>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
