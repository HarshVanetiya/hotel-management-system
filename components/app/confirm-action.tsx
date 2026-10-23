"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useApiAction } from "@/hooks/use-api-action";

/** A button that asks for confirmation, then POSTs to an API endpoint. */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  url,
  body = {},
  successMessage,
  destructive = false,
  onDone,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  url: string;
  body?: unknown;
  successMessage: string;
  destructive?: boolean;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useApiAction();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Back</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={async () => {
              const result = await run(url, body, { successMessage });
              if (result !== undefined) {
                setOpen(false);
                onDone?.();
              }
            }}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
