import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "3rd Gen Tundra Tracker",
  description: "Engine-failure & mileage stats for 2022+ Toyota Tundras (V35A engine)",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/failures", label: "Engine Failures" },
  { href: "/lifespan", label: "Lifespan" },
  { href: "/mileage", label: "Mileage" },
  { href: "/vins", label: "VIN Explorer" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              3rd Gen Tundra Tracker
            </Link>
            <nav className="flex gap-6 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-zinc-200 px-6 py-6 text-xs text-zinc-500 dark:border-zinc-800">
          <div className="mx-auto max-w-6xl">
            Carvana inventory + NHTSA recall <span className="font-mono">25V767</span> /
            <span className="font-mono"> 24V381</span> as proxies for V35A engine replacement.
            Read-only research project, not affiliated with Toyota or Carvana.
          </div>
        </footer>
      </body>
    </html>
  );
}
