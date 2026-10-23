import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="text-lg font-semibold">Record not found</h1>
      <p className="text-muted-foreground max-w-sm text-sm">It may have been removed or you may not have access to it.</p>
      <Button asChild>
        <Link href="/">Back to the app</Link>
      </Button>
    </div>
  );
}
