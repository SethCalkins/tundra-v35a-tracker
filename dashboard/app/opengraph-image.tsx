import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Tundra V35A Tracker — engine reliability & recall analytics";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0a0a0a",
          color: "#fff",
          padding: "72px",
          fontFamily: "Helvetica",
          position: "relative",
        }}
      >
        {/* Red bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 12,
            background: "#EB0A1E",
            display: "flex",
          }}
        />

        {/* Logo + brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 56 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              border: "4px solid #EB0A1E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 900,
              fontStyle: "italic",
              color: "#EB0A1E",
              background: "#fff",
            }}
          >
            T
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              display: "flex",
              gap: 12,
            }}
          >
            <span>TUNDRA</span>
            <span style={{ color: "#EB0A1E" }}>V35A</span>
            <span>TRACKER</span>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 88,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            fontStyle: "italic",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span>The data Toyota</span>
          <span style={{ color: "#EB0A1E" }}>isn&apos;t showing you.</span>
        </div>

        {/* Subhead */}
        <div
          style={{
            marginTop: 36,
            fontSize: 30,
            color: "#a1a1aa",
            lineHeight: 1.35,
            display: "flex",
            maxWidth: 920,
          }}
        >
          Independent reliability &amp; recall analytics for the 3rd-gen Toyota
          Tundra V35A engine. NHTSA complaints, owner reports, recall status.
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            color: "#71717a",
          }}
        >
          <span>tundrav35a.com</span>
          <span style={{ display: "flex", gap: 24 }}>
            <span>24V381</span>
            <span>•</span>
            <span>25V767</span>
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
