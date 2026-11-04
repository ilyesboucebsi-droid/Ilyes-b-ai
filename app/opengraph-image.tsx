import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ILYES AI - AI chat and academic research";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 76px",
          color: "#eaf3ff",
          background: "linear-gradient(130deg, #07111f 0%, #102b45 52%, #172653 100%)",
          fontFamily: "Arial, sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 62, height: 62, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#36c6e8,#668cff)", color: "#061321", fontSize: 30, fontWeight: 900 }}>
            IB
          </div>
          <div style={{ display: "flex", fontSize: 27, fontWeight: 800, letterSpacing: 1 }}>
            ILYES.B <span style={{ color: "#57d7ef", marginLeft: 8 }}>AI</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 940 }}>
          <div style={{ display: "flex", color: "#57d7ef", fontSize: 19, fontWeight: 800, letterSpacing: 5 }}>
            KNOWLEDGE · RESEARCH · AI
          </div>
          <div style={{ display: "flex", fontSize: 64, lineHeight: 1.12, fontWeight: 800 }}>
            Think deeper. Research smarter.
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#b5c9dc" }}>
            AI conversation and academic discovery in one place
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #45617b", paddingTop: 22, color: "#9bb2c9", fontSize: 19 }}>
          <span>ilyes-b-ai.vercel.app</span>
          <span>Arabic · English</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
