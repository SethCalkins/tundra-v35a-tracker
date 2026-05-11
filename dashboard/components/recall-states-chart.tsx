"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { RecallStateByCohort } from "@/lib/queries";

export function RecallStatesChart({ data }: { data: RecallStateByCohort[] }) {
  const reshaped = data.map((d) => ({
    label: `${d.year} ${d.hybrid ? "i-FORCE MAX" : "non-hybrid"}`,
    open: d.open,
    pending: d.pending,
    unknown: d.unknown,
  }));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={reshaped} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="label" stroke="#71717a" angle={-15} textAnchor="end" height={60} fontSize={11} />
        <YAxis stroke="#71717a" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#1f1f1f", border: "none", borderRadius: 0, color: "#fafafa", fontSize: 12 }}
          cursor={{ fill: "rgba(235, 10, 30, 0.08)" }}
        />
        <Legend wrapperStyle={{ paddingTop: 10 }} />
        <Bar dataKey="open" name="Engine recall OPEN" stackId="s" fill="#EB0A1E" />
        <Bar dataKey="pending" name="Pending remedy" stackId="s" fill="#F08585" />
        <Bar dataKey="unknown" name="Unknown / out of scope" stackId="s" fill="#a1a1aa" />
      </BarChart>
    </ResponsiveContainer>
  );
}
