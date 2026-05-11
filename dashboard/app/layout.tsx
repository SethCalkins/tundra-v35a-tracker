import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = "https://tundrav35a.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tundra V35A Tracker — engine reliability & recall analytics",
    template: "%s — Tundra V35A Tracker",
  },
  description:
    "Independent reliability dashboard for the 3rd-gen Toyota Tundra V35A engine recalls (24V381 / 25V767). Real failure data, owner complaints, and third-party inventory analysis.",
  keywords: [
    "Toyota Tundra V35A",
    "V35A engine recall",
    "24V381",
    "25V767",
    "3rd gen Tundra reliability",
    "Tundra engine failure",
    "Tundra engine replacement",
    "i-FORCE MAX recall",
    "Lexus LX600 V35A",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Tundra V35A Tracker",
    description:
      "Reliability & recall analytics for 3rd-gen Toyota Tundras (2022+). NHTSA complaints, owner reports, and recall status.",
    url: SITE_URL,
    siteName: "Tundra V35A Tracker",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tundra V35A Tracker",
    description:
      "Independent reliability & recall analytics for 3rd-gen Toyota Tundras.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  category: "automotive",
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Tundra V35A Tracker",
      description:
        "Independent reliability dashboard for the 3rd-gen Toyota Tundra V35A engine recalls.",
      inLanguage: "en-US",
    },
    {
      "@type": "Dataset",
      "@id": `${SITE_URL}/#dataset`,
      name: "Toyota Tundra V35A engine recall and reliability dataset",
      description:
        "Aggregated NHTSA complaint records, recall status snapshots, owner reports, and third-party used-vehicle inventory listings for 2022+ Toyota Tundras with the V35A engine.",
      keywords: ["Toyota Tundra", "V35A", "24V381", "25V767", "engine recall", "vehicle reliability"],
      creator: { "@type": "Organization", name: "Tundra V35A Tracker" },
      isAccessibleForFree: true,
      url: SITE_URL,
    },
  ],
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/lifespan", label: "Reliability" },
  { href: "/failures", label: "Recall Status" },
  { href: "/vins", label: "Inventory" },
];

const NAV_CTA = { href: "/submit", label: "Report your engine" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {/* Red accent strip */}
        <div className="h-1 w-full bg-[#EB0A1E]" aria-hidden />

        <header className="sticky top-1 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
            <Link href="/" className="group flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#EB0A1E] bg-white text-[#EB0A1E] transition-transform group-hover:scale-105 dark:bg-zinc-950">
                <span className="text-lg font-bold italic tracking-tighter">T</span>
              </div>
              <div className="leading-tight">
                <div className="text-base font-bold tracking-tight">
                  TUNDRA <span className="text-[#EB0A1E]">V35A</span> TRACKER
                </div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Independent reliability data
                </div>
              </div>
            </Link>
            <nav className="ml-auto flex items-center gap-1 text-sm font-medium">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hidden rounded-sm px-3 py-2 text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-[#EB0A1E] dark:text-zinc-300 dark:hover:bg-zinc-800 sm:inline-block"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href={NAV_CTA.href}
                className="ml-2 inline-flex items-center bg-[#EB0A1E] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#c00917]"
              >
                {NAV_CTA.label}
              </Link>
            </nav>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="mt-auto border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto max-w-6xl space-y-3 px-6 py-10 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
            <p className="text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Disclaimer
            </p>
            <p>
              Independent owner-research project. <strong>Not affiliated with, endorsed by,
              or sponsored by</strong> Toyota Motor Corporation, Toyota Motor North
              America, or Lexus. The Toyota and Lexus names, logos, and trademarks
              are the property of their respective owners.
            </p>
            <p>
              Data sourced from public NHTSA recall and complaints databases,
              third-party used-vehicle inventory listings, and the publicly-accessible
              Carfax free preview.
            </p>
            <p>
              This site is research only — not legal, financial, or mechanical advice.
              If you believe your vehicle is unsafe, contact a Toyota dealer or file
              with NHTSA at{" "}
              <a
                href="https://www.nhtsa.gov/report-a-safety-problem"
                className="font-medium text-[#EB0A1E] underline-offset-2 hover:underline"
              >
                nhtsa.gov/report-a-safety-problem
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
