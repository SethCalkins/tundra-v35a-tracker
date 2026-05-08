"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface MileageDatum {
  model_year: number;
  hybrid_median: number | null;
  nonhybrid_median: number | null;
}

export function MileageByYearChart({ data }: { data: MileageDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="model_year" stroke="#71717a" />
        <YAxis stroke="#71717a" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(v: number) => `${v.toLocaleString()} mi`}
          contentStyle={{ background: "#27272a", border: "none", borderRadius: 6, color: "#fafafa" }}
          cursor={{ fill: "rgba(63, 63, 70, 0.1)" }}
        />
        <Legend />
        <Bar dataKey="nonhybrid_median" name="i-FORCE (non-hybrid)" fill="#0284c7" radius={[3, 3, 0, 0]} />
        <Bar dataKey="hybrid_median" name="i-FORCE MAX (hybrid)" fill="#0d9488" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
