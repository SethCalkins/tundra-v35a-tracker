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
          contentStyle={{ background: "#1f1f1f", border: "none", borderRadius: 0, color: "#fafafa", fontSize: 12 }}
          cursor={{ fill: "rgba(235, 10, 30, 0.08)" }}
        />
        <Legend />
        <Bar dataKey="total_complaints" name="All complaints" fill="#a1a1aa" />
        <Bar dataKey="engine_complaints" name="Engine component" fill="#F08585" />
        <Bar dataKey="stall_mentions" name='Mentions "stall"' fill="#EB0A1E" />
      </BarChart>
    </ResponsiveContainer>
  );
}
