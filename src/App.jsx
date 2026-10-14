/**
 * LiveVox root component (M0 scaffold shell).
 *
 * The full layout (control column + transcript panel + banners) is assembled
 * progressively across milestones as the pipeline hooks and components land.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 font-semibold">
          <span aria-hidden className="flex items-end gap-0.5">
            <span className="h-2 w-1 rounded-sm bg-violet-500" />
            <span className="h-3.5 w-1 rounded-sm bg-violet-500" />
            <span className="h-5 w-1 rounded-sm bg-violet-400" />
            <span className="h-3.5 w-1 rounded-sm bg-violet-500" />
            <span className="h-2 w-1 rounded-sm bg-violet-500" />
          </span>
          LiveVox
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Real-time video translator — pipeline modules land in milestones M1…M9.
        </p>
      </main>
    </div>
  );
}
