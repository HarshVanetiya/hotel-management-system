"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { formatMoney } from "@/lib/utils/money";

const SERIES = "#2f5fb3"; // single-hue series colour (validated against the light surface)
const GRID = "#e6e8ec";
const AXIS_TEXT = "#6b7280";

type OccupancyPoint = { date: string; occupied: number; rate: number; forecast: boolean };
type RevenuePoint = { date: string; collected: number };

const shortDate = (d: string) => format(parseISO(d), "dd MMM");

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="bg-popover rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {lines.map((l) => (
        <p key={l} className="text-muted-foreground">
          {l}
        </p>
      ))}
    </div>
  );
}

export function OccupancyChart({ data, today }: { data: OccupancyPoint[]; today: string }) {
  return (
    <figure>
      <div className="h-56 w-full" role="img" aria-label="Occupancy rate per night for the last 14 nights and the next 7 nights">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={2}>
            <defs>
              <pattern id="forecast-texture" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#ffffff" />
                <rect width="3" height="6" fill={SERIES} />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(47,95,179,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as OccupancyPoint;
                return (
                  <TooltipBox
                    title={`${format(parseISO(p.date), "EEE dd MMM")}${p.date === today ? " (tonight)" : p.forecast ? " (on the books)" : ""}`}
                    lines={[`${p.rate}% occupancy`, `${p.occupied} room${p.occupied === 1 ? "" : "s"} sold`]}
                  />
                );
              }}
            />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.date} fill={d.forecast ? "url(#forecast-texture)" : SERIES} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-muted-foreground mt-2 flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: SERIES }} aria-hidden /> Past nights &amp; tonight
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <rect width="10" height="10" fill="url(#forecast-texture)" />
          </svg>
          Next 7 nights (on the books)
        </span>
      </figcaption>
      <ChartTable
        caption="Occupancy by night"
        headers={["Night", "Rooms sold", "Occupancy"]}
        rows={data.map((d) => [d.date, String(d.occupied), `${d.rate}%`])}
      />
    </figure>
  );
}

export function RevenueChart({ data, currency }: { data: RevenuePoint[]; currency: string }) {
  const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
  return (
    <figure>
      <div className="h-56 w-full" role="img" aria-label="Net cash collected per day for the last 14 days">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(v) => compact.format(v)}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(47,95,179,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as RevenuePoint;
                return (
                  <TooltipBox
                    title={format(parseISO(p.date), "EEE dd MMM")}
                    lines={[`${formatMoney(p.collected.toFixed(2), currency)} net collected`]}
                  />
                );
              }}
            />
            <Bar dataKey="collected" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        caption="Net cash collected by day"
        headers={["Date", "Net collected"]}
        rows={data.map((d) => [d.date, formatMoney(d.collected.toFixed(2), currency)])}
      />
    </figure>
  );
}

function ChartTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer select-none">View as table</summary>
      <div className="mt-2 max-h-48 overflow-auto rounded-md border">
        <table className="w-full">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-2 py-1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t">
                {r.map((c, i) => (
                  <td key={i} className="px-2 py-1 tabular-nums">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
