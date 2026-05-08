"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface Datum {
  bucket_label: string;
  total_complaints: number;
  engine_complaints: number;
  stall_mentions: number;
}

export function FailureMileageChart({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="bucket_label" stroke="#71717a" />
        <YAxis stroke="#71717a" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#27272a", border: "none", borderRadius: 6, color: "#fafafa", fontSize: 12 }}
          cursor={{ fill: "rgba(63, 63, 70, 0.1)" }}
        />
        <Legend />
        <Bar dataKey="total_complaints" name="All complaints" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
        <Bar dataKey="engine_complaints" name="Engine component" fill="#f59e0b" radius={[3, 3, 0, 0]} />
        <Bar dataKey="stall_mentions" name='Mentions "stall"' fill="#dc2626" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
