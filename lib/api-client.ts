"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown> | null,
  ) {
    super(message);
  }

  get fieldErrors(): Record<string, string> {
    const fe = this.details?.fieldErrors;
    return fe && typeof fe === "object" ? (fe as Record<string, string>) : {};
  }
}

/** JSON fetch against our Route Handlers. Throws ApiError with the server's safe message. */
export async function apiRequest<T = unknown>(
  url: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("Network error. Check your connection and try again.", 0, "network_error", null);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    if (res.status === 401) {
      window.location.href = "/login";
    }
    throw new ApiError(e?.message ?? `Request failed (${res.status})`, res.status, e?.code ?? "error", e?.details ?? null);
  }
  return data as T;
}
