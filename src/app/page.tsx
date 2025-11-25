import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
      <h1 className="text-4xl font-semibold">
        Upload console lives at <span className="text-emerald-300">/upload</span>
      </h1>
      <p className="mt-4 max-w-xl text-white/70">
        Jump into the new ingestion flow to inspect Excel workbooks, toggle the
        rows you trust, and commit to Supabase with confidence.
      </p>
      <Link
        href="/upload"
        className="mt-8 rounded-2xl bg-emerald-500 px-6 py-3 text-lg font-semibold text-emerald-950 transition hover:bg-emerald-400"
      >
        Go to Upload Console
      </Link>
    </main>
  );
}
