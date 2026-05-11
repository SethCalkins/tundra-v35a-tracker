"use client";

import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { FailurePhrase } from "@/lib/queries";

export function FailurePhrasesChart({ data }: { data: FailurePhrase[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, 30 * data.length)}>
      <BarChart layout="vertical" data={data} margin={{ top: 5, right: 30, left: 100, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
        <XAxis type="number" stroke="#71717a" allowDecimals={false} />
        <YAxis type="category" dataKey="phrase" stroke="#71717a" width={140} fontSize={12} />
        <Tooltip
          contentStyle={{ background: "#1f1f1f", border: "none", borderRadius: 0, color: "#fafafa", fontSize: 12 }}
          cursor={{ fill: "rgba(235, 10, 30, 0.08)" }}
          formatter={(value) => {
            const n = typeof value === "number" ? value : Number(value);
            return [`${n} complaints`, "Mentions"];
          }}
        />
        <Bar dataKey="count" fill="#EB0A1E" />
      </BarChart>
    </ResponsiveContainer>
  );
}
