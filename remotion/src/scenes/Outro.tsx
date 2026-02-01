import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { fontFamily } from "../fonts";
import { theme } from "../theme";

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fileProgress = spring({ frame, fps, delay: 0, config: { damping: 15, stiffness: 120 } });
  const fileY = interpolate(fileProgress, [0, 1], [-100, 0]);
  const fileOpacity = interpolate(fileProgress, [0, 1], [0, 1]);
  const fileScale = interpolate(fileProgress, [0, 1], [0.5, 1]);

  const checkProgress = spring({ frame, fps, delay: 18, config: { damping: 12, stiffness: 150 } });
  const checkScale = interpolate(checkProgress, [0, 1], [0, 1]);

  const textProgress = spring({ frame, fps, delay: 25, config: { damping: 200 } });
  const textOpacity = interpolate(textProgress, [0, 1], [0, 1]);
  const textY = interpolate(textProgress, [0, 1], [25, 0]);

  const awakenProgress = spring({ frame, fps, delay: 35, config: { damping: 200 } });
  const awakenOpacity = interpolate(awakenProgress, [0, 1], [0, 1]);

  const ctaProgress = spring({ frame, fps, delay: 45, config: { damping: 200 } });
  const ctaOpacity = interpolate(ctaProgress, [0, 1], [0, 1]);
  const ctaY = interpolate(ctaProgress, [0, 1], [15, 0]);

  const particles = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const dist = interpolate(checkProgress, [0, 1], [0, 70]);
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      opacity: interpolate(checkProgress, [0, 0.5, 1], [0, 1, 0]),
    };
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
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.accent}15 0%, transparent 60%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 36,
          zIndex: 1,
        }}
      >
        {/* CSV file icon */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              opacity: fileOpacity,
              transform: `translateY(${fileY}px) scale(${fileScale})`,
              width: 130,
              height: 156,
              borderRadius: 16,
              backgroundColor: "white",
              border: `2px solid ${theme.accent}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: `0 12px 40px ${theme.accent}20, 0 2px 10px rgba(0,0,0,0.08)`,
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 800, color: theme.accent, letterSpacing: 2 }}>CSV</span>
            {[0, 1, 2].map((r) => (
              <div key={r} style={{ width: 80, height: 4, borderRadius: 2, backgroundColor: theme.border }} />
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              bottom: -12,
              right: -12,
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.success,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${checkScale})`,
              boxShadow: `0 0 24px ${theme.success}40`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {particles.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                bottom: -12 + p.y,
                right: -12 + p.x,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.accent,
                opacity: p.opacity,
              }}
            />
          ))}
        </div>

        {/* Logo */}
        <div style={{ opacity: textOpacity, transform: `translateY(${textY}px)`, display: "flex", alignItems: "center", gap: 16 }}>
          <Img
            src={staticFile("icon.png")}
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              boxShadow: `0 0 36px ${theme.accent}30`,
            }}
          />
          <div style={{ display: "flex" }}>
            <span style={{ fontSize: 52, fontWeight: 900, color: theme.foreground, letterSpacing: -1 }}>Awaken</span>
            <span style={{ fontSize: 52, fontWeight: 900, color: theme.accent, letterSpacing: -1 }}>Fetch</span>
          </div>
        </div>

        {/* Built for */}
        <div style={{ opacity: awakenOpacity, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20, color: theme.muted }}>Built for</span>
          <Img src={staticFile("Awaken_Large.png")} style={{ height: 40, objectFit: "contain" }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: theme.foreground }}>Awaken Tax</span>
        </div>

        {/* CTA */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            padding: "22px 64px",
            borderRadius: 18,
            backgroundColor: theme.accent,
            fontSize: 32,
            fontWeight: 700,
            color: "white",
            boxShadow: `0 6px 30px ${theme.accent}40`,
          }}
        >
          awakenfetch.xyz
        </div>
      </div>
    </AbsoluteFill>
  );
};
