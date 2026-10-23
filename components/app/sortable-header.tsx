import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { hrefWith } from "./pagination";

export function SortableHeader({
  label,
  field,
  pathname,
  params,
  sort,
  dir,
  className,
}: {
  label: string;
  field: string;
  pathname: string;
  params: Record<string, string | undefined>;
  sort: string;
  dir: "asc" | "desc";
  className?: string;
}) {
  const active = sort === field;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={hrefWith(pathname, params, { sort: field, dir: nextDir, page: undefined })}
        className={cn("hover:text-foreground inline-flex items-center gap-1", active && "text-foreground")}
      >
        {label}
        <Icon className="size-3" aria-hidden />
      </Link>
    </TableHead>
  );
}
