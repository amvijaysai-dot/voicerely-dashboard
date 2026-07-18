// components/calls/CallStatusBadge.tsx
export function CallStatusBadge({ status }: { status: "Completed" | "Failed" }) {
  const isCompleted = status === "Completed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isCompleted ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? "bg-success" : "bg-danger"}`} />
      {status}
    </span>
  );
}
