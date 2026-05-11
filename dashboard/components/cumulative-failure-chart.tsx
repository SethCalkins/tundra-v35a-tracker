"use client";

import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { FailureCurvePoint } from "@/lib/queries";

/**
 * Per-bucket bars + cumulative line: by what mileage have N% of reported
 * V35A engine failures occurred?
 */
export function CumulativeFailureChart({ data }: { data: FailureCurvePoint[] }) {
  const total = data.reduce((s, p) => s + p.per_bucket, 0);
  const enriched = data.map((p) => ({
    ...p,
    cumulative_pct: total > 0 ? Math.round((p.cumulative_failures / total) * 100) : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={enriched} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="bucket_label" stroke="#71717a" />
        <YAxis
          yAxisId="count"
          stroke="#71717a"
          allowDecimals={false}
          label={{ value: "Per bucket", angle: -90, position: "insideLeft", fill: "#71717a", fontSize: 11 }}
        />
        <YAxis
          yAxisId="pct"
          orientation="right"
          stroke="#EB0A1E"
          allowDecimals={false}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: "#1f1f1f", border: "none", borderRadius: 0, color: "#fafafa", fontSize: 12 }}
          cursor={{ fill: "rgba(235, 10, 30, 0.08)" }}
        />
        <Legend wrapperStyle={{ paddingTop: 8 }} />
        <Bar yAxisId="count" dataKey="per_bucket" name="Engine failures (this bucket)" fill="#a1a1aa" />
        <Area
          yAxisId="pct"
          type="monotone"
          dataKey="cumulative_pct"
          name="Cumulative %"
          stroke="#EB0A1E"
          fill="#EB0A1E"
          fillOpacity={0.18}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
