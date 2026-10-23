import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="text-muted-foreground max-w-sm text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
