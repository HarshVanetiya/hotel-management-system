import { cn } from "@/lib/utils";
import { formatCents, formatMoney, toCents } from "@/lib/utils/money";

/** Renders a decimal amount (NUMERIC string) in the hotel currency. */
export function Money({
  value,
  currency,
  className,
  emphasizeBalance = false,
}: {
  value: string | number;
  currency: string;
  className?: string;
  /** Colours positive amounts as owed and negative as credit. */
  emphasizeBalance?: boolean;
}) {
  const cents = toCents(value);
  return (
    <span
      className={cn(
        "tabular-nums",
        emphasizeBalance && cents > 0 && "font-medium text-rose-700",
        emphasizeBalance && cents < 0 && "font-medium text-violet-700",
        className,
      )}
    >
      {formatMoney(value, currency)}
    </span>
  );
}

export function MoneyCents({ cents, currency, className }: { cents: number; currency: string; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatCents(cents, currency)}</span>;
}
