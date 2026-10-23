import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Params = Record<string, string | undefined>;

export function hrefWith(pathname: string, params: Params, patch: Params): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function Pagination({
  pathname,
  params,
  page,
  pageCount,
  total,
  pageSize,
}: {
  pathname: string;
  params: Params;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="flex items-center justify-between gap-2 border-t px-3 py-2 text-sm" aria-label="Pagination">
      <p className="text-muted-foreground">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Link
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
          href={hrefWith(pathname, params, { page: String(page - 1) })}
        >
          <ChevronLeft /> Previous
        </Link>
        <span className="text-muted-foreground px-2 tabular-nums">
          {page} / {pageCount}
        </span>
        <Link
          aria-disabled={page >= pageCount}
          tabIndex={page >= pageCount ? -1 : undefined}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            page >= pageCount && "pointer-events-none opacity-50",
          )}
          href={hrefWith(pathname, params, { page: String(page + 1) })}
        >
          Next <ChevronRight />
        </Link>
      </div>
    </nav>
  );
}
