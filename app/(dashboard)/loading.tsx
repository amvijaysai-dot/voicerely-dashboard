// app/(dashboard)/loading.tsx
// Shown instantly by Next.js during navigation while the page fetches.
// Matches the Overview layout grid so there's no layout shift on load.

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-2xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="h-3 w-24 animate-pulse rounded bg-surface-hover" />
        <div className="h-4 w-4 animate-pulse rounded bg-surface-hover" />
      </div>
      <div className="h-8 w-32 animate-pulse rounded bg-surface-hover mb-2" />
      <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page title skeleton */}
      <div>
        <div className="h-7 w-40 animate-pulse rounded bg-surface-hover mb-2" />
        <div className="h-4 w-64 animate-pulse rounded bg-surface-hover" />
      </div>

      {/* Metric cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Chart area */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-hover mb-6" />
        <div className="h-48 w-full animate-pulse rounded-xl bg-surface-hover" />
      </div>

      {/* Recent calls skeleton */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-hover" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-6 py-4 border-b border-border last:border-0 flex gap-4">
            <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-20 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-32 animate-pulse rounded bg-surface-hover ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}