import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

interface StarDisplayProps {
  rating: number | null;
  count?: number;
  size?: "sm" | "md";
  className?: string;
}

export function StarDisplay({
  rating,
  count,
  size = "sm",
  className,
}: StarDisplayProps) {
  if (!rating) return null;

  const filled = Math.round(rating);
  const starClass = size === "sm" ? "size-3" : "size-4";

  return (
    <span className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            starClass,
            i < filled
              ? "fill-yellow-400 text-yellow-400"
              : "fill-muted text-muted-foreground/30"
          )}
        />
      ))}
      <span className="ml-1 text-xs font-medium">{rating.toFixed(1)}</span>
      {count !== undefined && count > 0 && (
        <span className="ml-0.5 text-xs text-muted-foreground">({count})</span>
      )}
    </span>
  );
}

interface StarInputProps {
  currentRating: number | null;
  onRate: (rating: number) => void;
  disabled?: boolean;
}

export function StarInput({
  currentRating,
  onRate,
  disabled = false,
}: StarInputProps) {
  const [hover, setHover] = useState<number | null>(null);
  const active = hover ?? currentRating ?? 0;

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onRate(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          className={cn(
            "p-0.5 transition-transform",
            !disabled && "cursor-pointer hover:scale-110"
          )}
          aria-label={`Rate ${n} star${n !== 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              "size-5",
              n <= active
                ? "fill-yellow-400 text-yellow-400"
                : "fill-muted text-muted-foreground/30"
            )}
          />
        </button>
      ))}
    </div>
  );
}
