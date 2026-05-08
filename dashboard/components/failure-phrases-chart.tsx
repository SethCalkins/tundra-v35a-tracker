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
          contentStyle={{ background: "#27272a", border: "none", borderRadius: 6, color: "#fafafa", fontSize: 12 }}
          cursor={{ fill: "rgba(63, 63, 70, 0.1)" }}
          formatter={(v: number) => [`${v} complaints`, "Mentions"]}
        />
        <Bar dataKey="count" fill="#f59e0b" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
