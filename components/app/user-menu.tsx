"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2" aria-label="Account menu">
          <span className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-full text-xs font-semibold">
            {initials}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium">{name}</span>
            <span className="text-muted-foreground block text-[11px]">{roleLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block">{name}</span>
          <span className="text-muted-foreground block text-xs font-normal">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
