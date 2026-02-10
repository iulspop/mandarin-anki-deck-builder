import type { WordWithTracking } from "~/lib/types";

export function TrackCell({
  word,
  onToggle,
}: {
  word: WordWithTracking;
  onToggle: (wordId: string) => void;
}) {
  return (
    <button
      aria-label={
        word.isTracked ? `Untrack ${word.character}` : `Track ${word.character}`
      }
      className={`track-btn ${word.isTracked ? "tracked" : ""}`}
      onClick={() => onToggle(word.id)}
      type="button"
    >
      {word.isTracked ? "✓" : "○"}
    </button>
  );
}
