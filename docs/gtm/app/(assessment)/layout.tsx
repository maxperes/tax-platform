import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AssessmentNav from "@/components/layout/AssessmentNav";

export default function AssessmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <AssessmentNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
