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

const chains = [
  "bittensor", "kaspa", "injective", "hedera", "multiversx", "radix",
  "ergo", "polkadot", "osmosis", "ronin", "variational", "extended",
];

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const iconProgress = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const iconScale = interpolate(iconProgress, [0, 1], [0, 1]);
  const iconRotate = interpolate(iconProgress, [0, 1], [-180, 0]);

  const titleProgress = spring({ frame, fps, delay: 8, config: { damping: 200 } });
  const titleX = interpolate(titleProgress, [0, 1], [-80, 0]);
  const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);

  const subProgress = spring({ frame, fps, delay: 18, config: { damping: 200 } });
  const subY = interpolate(subProgress, [0, 1], [30, 0]);
  const subOpacity = interpolate(subProgress, [0, 1], [0, 1]);

  const orbitAngle = frame * 0.8;

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
      {/* Warm radial glow */}
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 1200,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.accent}22 0%, ${theme.accent}08 40%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Orbiting chain logos */}
      {chains.map((chain, i) => {
        const angle = (i / chains.length) * Math.PI * 2 + (orbitAngle * Math.PI) / 180;
        const rx = 520;
        const ry = 280;
        const x = Math.cos(angle) * rx;
        const y = Math.sin(angle) * ry;
        const depth = Math.sin(angle);
        const chainEntrance = spring({
          frame, fps, delay: 5 + i * 2, config: { damping: 200 },
        });

        return (
          <div
            key={chain}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(${x - 32}px, ${y - 32}px)`,
              opacity: interpolate(depth, [-1, 0, 1], [0.08, 0.2, 0.4]) * chainEntrance,
              zIndex: depth > 0 ? 1 : 0,
            }}
          >
            <Img
              src={staticFile(`chains/${chain}.png`)}
              style={{ width: 64, height: 64, borderRadius: 16, objectFit: "contain" }}
            />
          </div>
        );
      })}

      {/* Center content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Img
            src={staticFile("icon.png")}
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              boxShadow: `0 0 80px ${theme.accent}40, 0 12px 40px rgba(0,0,0,0.15)`,
              transform: `scale(${iconScale}) rotate(${iconRotate}deg)`,
            }}
          />
          <div
            style={{
              display: "flex",
              opacity: titleOpacity,
              transform: `translateX(${titleX}px)`,
            }}
          >
            <span style={{ fontSize: 88, fontWeight: 900, color: theme.foreground, letterSpacing: -3 }}>
              Awaken
            </span>
            <span style={{ fontSize: 88, fontWeight: 900, color: theme.accent, letterSpacing: -3 }}>
              Fetch
            </span>
          </div>
        </div>

        <div
          style={{
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
            fontSize: 36,
            color: theme.muted,
            letterSpacing: 0.5,
          }}
        >
          Export your crypto transactions
        </div>

        <div
          style={{
            opacity: subOpacity,
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 8,
          }}
        >
          <div style={{ height: 1, width: 60, backgroundColor: theme.border }} />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 5, textTransform: "uppercase" as const, color: theme.accent }}>
            Free & Open Source
          </span>
          <div style={{ height: 1, width: 60, backgroundColor: theme.border }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
