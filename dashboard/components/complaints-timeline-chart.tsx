"use client";

import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { ComplaintsByMonth } from "@/lib/queries";

export function ComplaintsTimelineChart({ data }: { data: ComplaintsByMonth[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
        <YAxis stroke="#71717a" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#1f1f1f", border: "none", borderRadius: 0, color: "#fafafa", fontSize: 12 }}
          cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
        />
        <Legend wrapperStyle={{ paddingTop: 8 }} />
        <Area type="monotone" dataKey="total" name="All complaints" stroke="#71717a" fill="#71717a" fillOpacity={0.18} />
        <Area type="monotone" dataKey="engine" name="Engine component" stroke="#F08585" fill="#F08585" fillOpacity={0.4} />
        <Area type="monotone" dataKey="with_tow" name="Engine + towed" stroke="#EB0A1E" fill="#EB0A1E" fillOpacity={0.55} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
