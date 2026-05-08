"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { ComplaintsByState } from "@/lib/queries";

export function StateDistributionChart({ data }: { data: ComplaintsByState[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="state" stroke="#71717a" />
        <YAxis stroke="#71717a" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#27272a", border: "none", borderRadius: 6, color: "#fafafa", fontSize: 12 }}
          cursor={{ fill: "rgba(63, 63, 70, 0.1)" }}
        />
        <Legend wrapperStyle={{ paddingTop: 8 }} />
        <Bar dataKey="total" name="All Tundra complaints" fill="#a1a1aa" />
        <Bar dataKey="engine" name="Engine-component" fill="#f59e0b" />
      </BarChart>
    </ResponsiveContainer>
  );
}
