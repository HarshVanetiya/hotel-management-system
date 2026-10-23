import { NotFoundError } from "@/lib/errors";
import { apiRoute } from "@/server/api";
import { exportReportCsv, REPORT_TYPES, type ReportType } from "@/server/services/reports";

export const GET = apiRoute(
  async ({ actor, params, searchParams }) => {
    if (!REPORT_TYPES.includes(params.type as ReportType)) throw new NotFoundError("Report");
    const { filename, csv } = await exportReportCsv(actor, params.type as ReportType, searchParams);
    // UTF-8 BOM so spreadsheet apps detect the encoding.
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
  { permission: "reports:export", rateLimit: { bucket: "exports", limit: 30, windowSeconds: 300 } },
);
