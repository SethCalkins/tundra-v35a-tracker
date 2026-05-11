"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { RecallRemediationRow } from "@/lib/queries";

/**
 * Cumulative remedy % per quarter, by recall.
 * Source: NHTSA §573 quarterly filings (FLAT_RCL_Qrtly_Rpts).
 */
export function RecallRemediationChart({ data }: { data: RecallRemediationRow[] }) {
  // Pivot: { quarter, "24V381": pct, "25V767": pct }
  const quarters = Array.from(new Set(data.map((r) => r.quarter))).sort();
  const pivot = quarters.map((q) => {
    const row: Record<string, number | string | null> = { quarter: q };
    for (const r of data) {
      if (r.quarter === q) row[r.recall_id] = r.pct_remedied;
    }
    return row;
  });

  const series = Array.from(new Set(data.map((r) => r.recall_id))).sort();
  const COLORS: Record<string, string> = {
    "24V381": "#EB0A1E",
    "25V767": "#a1a1aa",
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={pivot} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="quarter" stroke="#71717a" />
        <YAxis
          stroke="#71717a"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          label={{ value: "% remedied", angle: -90, position: "insideLeft", fill: "#71717a", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{ background: "#1f1f1f", border: "none", borderRadius: 0, color: "#fafafa", fontSize: 12 }}
          formatter={(v) => (typeof v === "number" ? `${v}%` : String(v))}
        />
        <Legend wrapperStyle={{ paddingTop: 8 }} />
        {series.map((s) => (
          <Line
            key={s}
            type="monotone"
            dataKey={s}
            name={s}
            stroke={COLORS[s] ?? "#52525b"}
            strokeWidth={2.5}
            dot={{ r: 4, fill: COLORS[s] ?? "#52525b" }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
