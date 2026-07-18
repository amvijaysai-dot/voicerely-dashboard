"use client";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-5 text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-danger" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h1>
          <p className="text-sm text-muted leading-relaxed">
            An unexpected error occurred. Your data is safe — this is a temporary issue.
          </p>
          {error.digest && (
            <p className="text-xs text-muted mt-2 font-mono">Error ID: {error.digest}</p>
          )}
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent text-black font-medium text-sm rounded-lg hover:opacity-90 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  );
}