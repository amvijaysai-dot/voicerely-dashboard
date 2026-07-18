// components/calls/SentimentBadge.tsx
//
// Sentiment pill for the client call-history table. Maps a sentiment label to
// the Voicerely palette: Positive -> success green, Neutral -> Electric Amber,
// Negative -> danger red. Styled to match CallStatusBadge conventions.

export type Sentiment = "Positive" | "Neutral" | "Negative";

const STYLES: Record<Sentiment, { wrap: string; dot: string }> = {
  Positive: { wrap: "bg-success/10 text-success", dot: "bg-success" },
  Neutral: { wrap: "bg-accent/10 text-accent", dot: "bg-accent" },
  Negative: { wrap: "bg-danger/10 text-danger", dot: "bg-danger" },
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const s = STYLES[sentiment];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.wrap}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {sentiment}
    </span>
  );
}
