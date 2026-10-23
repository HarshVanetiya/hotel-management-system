import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "good" | "warn" | "bad" | "info";
}) {
  const toneClass = {
    default: "text-muted-foreground bg-muted",
    good: "text-emerald-700 bg-emerald-50",
    warn: "text-amber-700 bg-amber-50",
    bad: "text-rose-700 bg-rose-50",
    info: "text-blue-700 bg-blue-50",
  }[tone];
  return (
    <div className="bg-card rounded-lg border p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        {Icon ? (
          <span className={cn("flex size-7 items-center justify-center rounded-md", toneClass)}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}
