"use client";

import {
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MileageVsAgePoint } from "@/lib/queries";

interface Props {
  data: MileageVsAgePoint[];
}

interface DiagonalRefProps {
  milesPerYear: number;
  label: string;
  maxAgeMonths: number;
}

/**
 * Recharts doesn't have a true diagonal reference line, so emit a tiny
 * dashed Scatter "series" that connects (0,0) to (maxAge, maxAge*mpy/12).
 * Visually it draws the m/y trajectory.
 */
function diagonalRefSeries({ milesPerYear, maxAgeMonths }: DiagonalRefProps) {
  return [
    { age_months: 0, mileage: 0 },
    { age_months: maxAgeMonths, mileage: Math.round((maxAgeMonths * milesPerYear) / 12) },
  ];
}

export function MileageVsAgeChart({ data }: Props) {
  const openRecall = data.filter((d) => d.has_open_recall);
  const noOpenRecall = data.filter((d) => !d.has_open_recall);

  const maxAge = Math.max(60, ...data.map((d) => d.age_months));
  const ref10k = diagonalRefSeries({ milesPerYear: 10000, label: "10k/yr", maxAgeMonths: maxAge });
  const ref15k = diagonalRefSeries({ milesPerYear: 15000, label: "15k/yr", maxAgeMonths: maxAge });
  const ref20k = diagonalRefSeries({ milesPerYear: 20000, label: "20k/yr", maxAgeMonths: maxAge });

  return (
    <ResponsiveContainer width="100%" height={420}>
      <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis
          type="number"
          dataKey="age_months"
          name="Age"
          unit=" mo"
          stroke="#71717a"
          domain={[0, maxAge]}
        />
        <YAxis
          type="number"
          dataKey="mileage"
          name="Mileage"
          stroke="#71717a"
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
          contentStyle={{ background: "#27272a", border: "none", borderRadius: 6, color: "#fafafa", fontSize: 12 }}
          formatter={(v: number, name: string) => {
            if (name === "Mileage") return [`${v.toLocaleString()} mi`, name];
            if (name === "Age") return [`${v} mo`, name];
            return [v, name];
          }}
        />
        <Legend />

        {/* Reference trajectories drawn as faint scatter lines */}
        <Scatter
          name="10k mi/yr"
          data={ref10k}
          line={{ stroke: "#a1a1aa", strokeDasharray: "4 4", strokeWidth: 1 }}
          shape={() => <></>}
          legendType="line"
        />
        <Scatter
          name="15k mi/yr"
          data={ref15k}
          line={{ stroke: "#a1a1aa", strokeDasharray: "4 4", strokeWidth: 1 }}
          shape={() => <></>}
          legendType="line"
        />
        <Scatter
          name="20k mi/yr"
          data={ref20k}
          line={{ stroke: "#a1a1aa", strokeDasharray: "4 4", strokeWidth: 1 }}
          shape={() => <></>}
          legendType="line"
        />

        <Scatter name="No open engine recall" data={noOpenRecall} fill="#10b981" />
        <Scatter name="Open engine recall" data={openRecall} fill="#f59e0b" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
