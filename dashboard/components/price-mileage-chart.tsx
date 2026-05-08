"use client";

import {
  CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";

import type { PriceMileagePoint } from "@/lib/queries";

export function PriceMileageChart({ data }: { data: PriceMileagePoint[] }) {
  const hybrid = data.filter((d) => d.is_hybrid === true);
  const nonhybrid = data.filter((d) => d.is_hybrid === false);

  const maxMileage = data.length ? Math.max(...data.map((d) => d.mileage)) : 100000;
  const maxPrice = data.length ? Math.max(...data.map((d) => d.price)) : 80000;

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis
          type="number"
          dataKey="mileage"
          name="Mileage"
          stroke="#71717a"
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          domain={[0, Math.ceil(maxMileage / 10000) * 10000]}
        />
        <YAxis
          type="number"
          dataKey="price"
          name="Price"
          stroke="#71717a"
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          domain={[0, Math.ceil(maxPrice / 10000) * 10000]}
        />
        <ZAxis type="number" range={[40, 40]} />
        <Tooltip
          cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
          contentStyle={{ background: "#27272a", border: "none", borderRadius: 6, color: "#fafafa", fontSize: 12 }}
          formatter={(v: number, name: string) => {
            if (name === "Price") return [`$${v.toLocaleString()}`, name];
            if (name === "Mileage") return [`${v.toLocaleString()} mi`, name];
            return [v, name];
          }}
        />
        <Legend />
        <Scatter name="i-FORCE (non-hybrid)" data={nonhybrid} fill="#0284c7" />
        <Scatter name="i-FORCE MAX (hybrid)" data={hybrid} fill="#0d9488" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
