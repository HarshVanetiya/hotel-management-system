"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ApiError, apiRequest } from "@/lib/api-client";

type Options<T> = {
  successMessage?: string | ((result: T) => string);
  onSuccess?: (result: T) => void;
  onError?: (error: ApiError) => void;
  /** Refresh server components after success (default true). */
  refresh?: boolean;
};

/** Runs an API mutation with pending state, toasts and a router refresh. */
export function useApiAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T = unknown>(
      url: string,
      body: unknown,
      options: Options<T> & { method?: "POST" | "PATCH" } = {},
    ): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await apiRequest<T>(url, { method: options.method ?? "POST", body });
        const msg = typeof options.successMessage === "function" ? options.successMessage(result) : options.successMessage;
        if (msg) toast.success(msg);
        options.onSuccess?.(result);
        if (options.refresh !== false) router.refresh();
        return result;
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : new ApiError("Something went wrong.", 0, "error", null);
        if (options.onError) options.onError(apiErr);
        else toast.error(apiErr.message);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending };
}
