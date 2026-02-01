import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { fontFamily } from "../fonts";
import { theme } from "../theme";

export const Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineProgress = spring({ frame, fps, delay: 0, config: { damping: 12, stiffness: 120 } });
  const headlineScale = interpolate(headlineProgress, [0, 1], [1.3, 1]);
  const headlineOpacity = interpolate(headlineProgress, [0, 1], [0, 1]);

  const descProgress = spring({ frame, fps, delay: 15, config: { damping: 200 } });
  const descOpacity = interpolate(descProgress, [0, 1], [0, 1]);
  const descY = interpolate(descProgress, [0, 1], [30, 0]);

  const checks = [
    "Awaken Tax-ready CSV format",
    "All transactions fetched automatically",
    "12+ blockchains supported",
  ];

  const glowScale = interpolate(frame, [0, 60, 120], [0.9, 1.1, 0.9], { extrapolateRight: "extend" });

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
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.accent}18 0%, transparent 60%)`,
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${glowScale})`,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 44,
          zIndex: 1,
        }}
      >
        <div style={{ opacity: headlineOpacity, transform: `scale(${headlineScale})`, textAlign: "center" }}>
          <div style={{ fontSize: 76, fontWeight: 900, color: theme.foreground, lineHeight: 1.15 }}>
            <span style={{ color: theme.accent }}>AwakenFetch</span>
            <br />
            does it for you.
          </div>
        </div>

        <div
          style={{
            opacity: descOpacity,
            transform: `translateY(${descY}px)`,
            fontSize: 30,
            color: theme.muted,
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Fetch on-chain transactions. Generate import-ready CSVs.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 12 }}>
          {checks.map((check, i) => {
            const checkProgress = spring({ frame, fps, delay: 30 + i * 10, config: { damping: 200 } });
            const checkOpacity = interpolate(checkProgress, [0, 1], [0, 1]);
            const checkX = interpolate(checkProgress, [0, 1], [-40, 0]);

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  opacity: checkOpacity,
                  transform: `translateX(${checkX}px)`,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${theme.success}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                    <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke={theme.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ fontSize: 28, fontWeight: 500, color: theme.foreground }}>
                  {check}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
