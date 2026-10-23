"use client";

import { useState } from "react";
import { Hotel, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavItem } from "@/lib/navigation";
import { SidebarNav } from "./sidebar-nav";

export function MobileNav({ sections, hotelName }: { sections: { title?: string; items: NavItem[] }[]; hotelName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-sidebar w-72 p-0">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <Hotel className="text-primary size-5" aria-hidden />
          <SheetTitle className="truncate text-sm">{hotelName}</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
        </div>
        <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
