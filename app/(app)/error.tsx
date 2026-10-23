"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <CircleAlert className="text-destructive size-8" aria-hidden />
      <h1 className="text-lg font-semibold">This page could not be loaded</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        An unexpected error occurred. Try again; if it persists, contact an administrator
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
