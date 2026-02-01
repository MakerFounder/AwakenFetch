import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { fontFamily } from "../fonts";
import { theme } from "../theme";

export const HowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const chromeProgress = spring({ frame, fps, delay: 0, config: { damping: 200 } });
  const chromeOpacity = interpolate(chromeProgress, [0, 1], [0, 1]);
  const chromeScale = interpolate(chromeProgress, [0, 1], [0.9, 1]);

  const labelProgress = spring({ frame, fps, delay: 5, config: { damping: 200 } });
  const labelOpacity = interpolate(labelProgress, [0, 1], [0, 1]);
  const labelY = interpolate(labelProgress, [0, 1], [15, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.accent}10 0%, transparent 60%)`,
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
          gap: 24,
          zIndex: 1,
        }}
      >
        {/* Label */}
        <div
          style={{
            opacity: labelOpacity,
            transform: `translateY(${labelY}px)`,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ height: 1, width: 50, backgroundColor: theme.border }} />
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const, color: theme.accent }}>
            See it in action
          </span>
          <div style={{ height: 1, width: 50, backgroundColor: theme.border }} />
        </div>

        {/* Browser window -- takes up most of the frame */}
        <div
          style={{
            opacity: chromeOpacity,
            transform: `scale(${chromeScale})`,
            borderRadius: 18,
            overflow: "hidden",
            border: `1px solid ${theme.border}`,
            boxShadow: `0 12px 60px rgba(0,0,0,0.12), 0 2px 10px rgba(0,0,0,0.06)`,
            width: 1720,
          }}
        >
          {/* Title bar */}
          <div
            style={{
              backgroundColor: theme.surface,
              borderBottom: `1px solid ${theme.border}`,
              padding: "12px 20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 7 }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#ff5f57" }} />
              <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#febc2e" }} />
              <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#28c840" }} />
            </div>
            <div
              style={{
                flex: 1,
                marginLeft: 16,
                backgroundColor: theme.bg,
                borderRadius: 10,
                padding: "8px 18px",
                fontSize: 14,
                color: theme.muted,
                fontFamily: "monospace",
              }}
            >
              awakenfetch.xyz
            </div>
          </div>

          {/* Screen recording */}
          <Video
            src={staticFile("screen_recording.mp4")}
            muted
            style={{ width: "100%", display: "block" }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
