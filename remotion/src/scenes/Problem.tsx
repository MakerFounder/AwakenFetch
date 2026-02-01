import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { fontFamily } from "../fonts";
import { theme } from "../theme";

const badRows = [
  { date: "2024-01-15", type: "???", amount: "-500 TAO", note: "Wrong format" },
  { date: "15/01/2024", type: "unknown", amount: "0.5 KAS", note: "Missing fields" },
  { date: "Jan 15", type: "", amount: "ERR", note: "Parse error" },
  { date: "2024/1/15", type: "transfer?", amount: "100", note: "No currency" },
];

export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineProgress = spring({ frame, fps, delay: 5, config: { damping: 200 } });
  const headlineOpacity = interpolate(headlineProgress, [0, 1], [0, 1]);
  const headlineY = interpolate(headlineProgress, [0, 1], [30, 0]);

  const shakeIntensity = interpolate(frame, [80, 90, 100], [0, 4, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const shakeX = Math.sin(frame * 2) * shakeIntensity;

  const redPulse = interpolate(frame, [85, 95, 105], [0, 0.04, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        justifyContent: "center",
        alignItems: "center",
        fontFamily,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, backgroundColor: theme.error, opacity: redPulse }} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
          transform: `translateX(${shakeX}px)`,
        }}
      >
        <div style={{ opacity: headlineOpacity, transform: `translateY(${headlineY}px)`, textAlign: "center" }}>
          <div style={{ fontSize: 64, fontWeight: 900, color: theme.foreground, lineHeight: 1.2 }}>
            Your chain isn't on{" "}
            <span style={{ color: theme.accent }}>Awaken Tax</span>?
          </div>
          <div style={{ fontSize: 30, color: theme.muted, marginTop: 16 }}>
            Manual CSV formatting is a nightmare.
          </div>
        </div>

        {/* Broken spreadsheet */}
        <div
          style={{
            width: 1000,
            borderRadius: 20,
            border: `1px solid ${theme.error}40`,
            backgroundColor: theme.surface,
            overflow: "hidden",
            boxShadow: `0 4px 40px ${theme.error}10, 0 1px 4px rgba(0,0,0,0.08)`,
          }}
        >
          <div
            style={{
              display: "flex",
              borderBottom: `1px solid ${theme.border}`,
              backgroundColor: `${theme.error}08`,
              padding: "14px 24px",
            }}
          >
            {["Date", "Type", "Amount", "Status"].map((h) => (
              <div
                key={h}
                style={{
                  flex: 1,
                  fontSize: 14,
                  fontWeight: 700,
                  color: theme.error,
                  textTransform: "uppercase" as const,
                  letterSpacing: 1.5,
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {badRows.map((row, i) => {
            const rowProgress = spring({ frame, fps, delay: 20 + i * 8, config: { damping: 200 } });
            const rowOpacity = interpolate(rowProgress, [0, 1], [0, 1]);
            const rowX = interpolate(rowProgress, [0, 1], [100, 0]);

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  padding: "14px 24px",
                  borderBottom: i < badRows.length - 1 ? `1px solid ${theme.border}` : "none",
                  opacity: rowOpacity,
                  transform: `translateX(${rowX}px)`,
                  backgroundColor: i % 2 === 0 ? "transparent" : theme.surface,
                }}
              >
                <div style={{ flex: 1, fontSize: 17, fontFamily: "monospace", color: theme.foreground }}>{row.date}</div>
                <div style={{ flex: 1, fontSize: 17, fontFamily: "monospace", color: theme.warning }}>{row.type}</div>
                <div style={{ flex: 1, fontSize: 17, fontFamily: "monospace", color: theme.error }}>{row.amount}</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.error }} />
                  <span style={{ fontSize: 15, color: theme.error }}>{row.note}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* X marks */}
        {[0, 1, 2].map((i) => {
          const xProgress = spring({ frame, fps, delay: 60 + i * 6, config: { damping: 8, stiffness: 200 } });
          const xScale = interpolate(xProgress, [0, 1], [0, 1]);
          const positions = [
            { top: "30%", left: "10%" },
            { top: "50%", right: "8%" },
            { top: "72%", left: "18%" },
          ];
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                ...positions[i],
                transform: `scale(${xScale}) rotate(${-15 + i * 10}deg)`,
                fontSize: 64,
                fontWeight: 900,
                color: theme.error,
                opacity: 0.45,
              }}
            >
              ✕
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
