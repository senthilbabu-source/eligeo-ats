/**
 * Usage meter progress bar for seats and AI credits.
 * D03 §10: UsageMeter component.
 */

interface UsageMeterProps {
  label: string;
  used: number;
  limit: number;
  unit?: string;
}

export function UsageMeter({ label, used, limit, unit }: UsageMeterProps) {
  const isUnlimited = limit === -1;
  const percent = isUnlimited ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isWarning = percent >= 80 && percent < 100;
  const isDanger = percent >= 100;

  const barColor = isDanger
    ? "bg-destructive"
    : isWarning
      ? "bg-amber-500"
      : "bg-primary";

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used.toLocaleString()}
          {isUnlimited ? "" : ` / ${limit.toLocaleString()}`}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      {!isUnlimited && (
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {isUnlimited && (
        <p className="mt-1 text-xs text-muted-foreground">Unlimited</p>
      )}
    </div>
  );
}
