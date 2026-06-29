import { Star } from "lucide-react";

export function ApplicationRatingStars({
  applicationId: _applicationId,
  rating,
  onRate,
  disabled,
  size = "sm",
}: {
  applicationId: string;
  rating: number | null | undefined;
  onRate: (rating: number | null) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const value = rating != null && rating >= 1 && rating <= 5 ? rating : 0;
  const starClass = size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onRate(value === n ? null : n)}
          className="p-0.5 rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:pointer-events-none text-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-label={`Rate ${n} out of 5`}
          title={`${value === n ? "Clear rating" : `Rate ${n}`}`}
        >
          <Star className={`${starClass} ${n <= value ? "fill-amber-500 text-amber-500" : "text-muted-foreground/35"}`} />
        </button>
      ))}
      {value > 0 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRate(null)}
          className="ml-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Clear
        </button>
      )}
    </span>
  );
}
