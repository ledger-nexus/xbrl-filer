import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "xbrl-filer",
  description: "Deterministic XBRL instance generation on the ledger-core substrate",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="grid min-h-screen grid-cols-[240px_1fr] bg-ink-50">
          <aside className="border-r border-ink-200 bg-white p-5">
            <Link href="/" className="block">
              <div className="text-base font-semibold tracking-tight text-ink-900">xbrl-filer</div>
              <div className="text-[11px] uppercase tracking-wider text-ink-500">
                instance documents from the ledger
              </div>
            </Link>
            <nav className="mt-6 flex flex-col gap-1 text-sm">
              <Link href="/filings" className="rounded-md px-2 py-1.5 text-ink-700 hover:bg-ink-100">
                Filings
              </Link>
              <Link href="/filings/new" className="rounded-md px-2 py-1.5 text-ink-700 hover:bg-ink-100">
                New filing
              </Link>
            </nav>
          </aside>
          <main className="flex flex-col">
            <header className="border-b border-ink-200 bg-white px-8 py-3">
              <h1 className="text-lg font-semibold text-ink-900">XBRL filings</h1>
              <p className="text-xs text-ink-500">
                Deterministic reporting on the ledger — reads the GL, never writes it.
              </p>
            </header>
            <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
