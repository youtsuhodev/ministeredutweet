/** Squelette de chargement imitant la structure d'un PostCard. */
export default function PostSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-[var(--border-color)]">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-3 w-20 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 w-full rounded bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-3.5 w-5/6 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-3.5 w-4/6 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
          <div className="flex justify-between max-w-xs pt-1">
            <div className="h-3.5 w-8 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-3.5 w-8 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-3.5 w-8 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-3.5 w-8 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
