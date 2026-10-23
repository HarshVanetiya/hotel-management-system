"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/** Explains a permission redirect (`?denied=1`) and then removes the flag from the URL. */
export function DeniedToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const denied = params.get("denied") === "1";
  useEffect(() => {
    if (!denied) return;
    toast.error("You don't have access to that page.");
    router.replace(pathname);
  }, [denied, router, pathname]);
  return null;
}
