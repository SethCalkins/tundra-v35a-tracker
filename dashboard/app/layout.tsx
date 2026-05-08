import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tundra V35A Tracker — engine-recall & mileage analytics",
  description:
    "Real-time analytics on the 3rd-gen Toyota Tundra V35A engine recalls (24V381 / 25V767), failure mileage distribution, and Carvana inventory tracking. An independent research project, no affiliation with Toyota or Carvana.",
  openGraph: {
    title: "Tundra V35A Tracker",
    description:
      "Engine-recall & mileage analytics for 3rd-gen Toyota Tundras (2022+).",
    type: "website",
  },
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/failures", label: "Engine Recalls" },
  { href: "/lifespan", label: "Lifespan" },
  { href: "/mileage", label: "Mileage" },
  { href: "/vins", label: "Inventory" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gradient-to-b from-zinc-50 to-white text-zinc-900 dark:from-zinc-950 dark:to-zinc-950 dark:text-zinc-100">
        <header className="sticky top-0 z-20 border-b border-zinc-200/60 bg-white/75 backdrop-blur-md supports-[backdrop-filter]:bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-950/75 dark:supports-[backdrop-filter]:bg-zinc-950/60">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
            <Link href="/" className="group flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-sm transition-transform group-hover:scale-105">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
                  <path
                    d="M4 16h16M6 16v-4a4 4 0 014-4h4a4 4 0 014 4v4M9 8V5a1 1 0 011-1h4a1 1 0 011 1v3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="8" cy="18.5" r="1.5" fill="currentColor" />
                  <circle cx="16" cy="18.5" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-tight">Tundra V35A Tracker</div>
                <div className="text-[11px] text-zinc-500">recall & mileage analytics</div>
              </div>
            </Link>
            <nav className="ml-auto flex gap-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="mt-auto border-t border-zinc-200/60 bg-white/40 dark:border-zinc-800/60 dark:bg-zinc-950/40">
          <div className="mx-auto max-w-6xl space-y-3 px-6 py-8 text-xs text-zinc-500">
            <p>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Independent research project.
              </span>{" "}
              Carvana inventory + NHTSA recalls{" "}
              <span className="font-mono text-amber-700 dark:text-amber-400">24V381</span>
              {" / "}
              <span className="font-mono text-amber-700 dark:text-amber-400">25V767</span>{" "}
              + NHTSA owner complaints. Read-only; no affiliation with Toyota, Lexus, or Carvana.
            </p>
            <p>
              Data refreshed nightly. Methodology and source code on{" "}
              <a
                href="https://github.com/sethcalkins/tundra-tracker"
                className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                GitHub
              </a>
              . This site is not legal, financial, or mechanical advice.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
