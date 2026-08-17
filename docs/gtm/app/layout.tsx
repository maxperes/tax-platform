import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { DemoDataProvider } from "@/context/DemoDataProvider";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VIA — demo prototype",
  description:
    "VIA maps your tax life so you can move forward with clarity and confidence. Demonstration prototype with fictitious data only.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={display.variable}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <DemoDataProvider>{children}</DemoDataProvider>
      </body>
    </html>
  );
}
