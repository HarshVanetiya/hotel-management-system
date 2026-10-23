"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GuestForm, type GuestFormInitial } from "./guest-form";

export function EditGuestDialog({ guest }: { guest: GuestFormInitial }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil /> Edit guest
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit guest</DialogTitle>
          <DialogDescription>Changes are recorded in the audit log (field names only).</DialogDescription>
        </DialogHeader>
        <GuestForm initial={guest} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
