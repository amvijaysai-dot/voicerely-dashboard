"use client";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-danger" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Page failed to load</h2>
        <p className="text-sm text-muted max-w-xs leading-relaxed">
          We couldn't load this section. Your data is safe.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent text-black font-medium text-sm rounded-lg hover:opacity-90 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 border border-border text-foreground text-sm rounded-lg hover:bg-surface-hover transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Overview
        </Link>
      </div>
    </div>
  );
}