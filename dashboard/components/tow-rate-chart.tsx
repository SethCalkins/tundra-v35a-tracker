"use client";

import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { TowRateBucket } from "@/lib/queries";

/**
 * Share of engine complaints in each mileage bucket where the truck had to be
 * towed. Higher = catastrophic failure mode rather than gradual decline.
 */
export function TowRateChart({ data }: { data: TowRateBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="bucket_label" stroke="#71717a" />
        <YAxis
          stroke="#71717a"
          allowDecimals={false}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: "#1f1f1f", border: "none", borderRadius: 0, color: "#fafafa", fontSize: 12 }}
          cursor={{ fill: "rgba(235, 10, 30, 0.08)" }}
          formatter={(value, _name, item) => {
            const v = typeof value === "number" ? value : Number(value);
            const total = (item?.payload as TowRateBucket | undefined)?.total ?? 0;
            const towed = (item?.payload as TowRateBucket | undefined)?.towed ?? 0;
            return [`${v}% (${towed} of ${total})`, "Towed share"];
          }}
        />
        <Bar dataKey="tow_rate" name="Towed share" fill="#EB0A1E" />
      </BarChart>
    </ResponsiveContainer>
  );
}
