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
  { id: "bittensor", name: "Bittensor", ticker: "TAO" },
  { id: "kaspa", name: "Kaspa", ticker: "KAS" },
  { id: "injective", name: "Injective", ticker: "INJ" },
  { id: "hedera", name: "Hedera", ticker: "HBAR" },
  { id: "multiversx", name: "MultiversX", ticker: "EGLD" },
  { id: "radix", name: "Radix", ticker: "XRD" },
  { id: "ergo", name: "Ergo", ticker: "ERG" },
  { id: "polkadot", name: "Polkadot", ticker: "DOT" },
  { id: "osmosis", name: "Osmosis", ticker: "OSMO" },
  { id: "ronin", name: "Ronin", ticker: "RON" },
  { id: "variational", name: "Variational", ticker: "PERPS" },
  { id: "extended", name: "Extended", ticker: "PERPS" },
];

export const ChainShowcase: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({ frame, fps, delay: 0, config: { damping: 200 } });
  const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);
  const titleY = interpolate(titleProgress, [0, 1], [25, 0]);

  const counterProgress = spring({ frame, fps, delay: 5, config: { damping: 200 } });
  const counterValue = Math.round(interpolate(counterProgress, [0, 1], [0, 12]));

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
      {/* Subtle grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${theme.border}30 1px, transparent 1px), linear-gradient(90deg, ${theme.border}30 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          opacity: 0.5,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 52,
          zIndex: 1,
        }}
      >
        <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)`, textAlign: "center" }}>
          <div style={{ fontSize: 68, fontWeight: 900, color: theme.foreground }}>
            <span style={{ color: theme.accent, fontSize: 80 }}>{counterValue}+</span> chains supported
          </div>
          <div style={{ fontSize: 24, color: theme.muted, marginTop: 12 }}>
            Chains not natively supported by Awaken Tax
          </div>
        </div>

        {/* Chain grid -- 4 cols x 3 rows, bigger cards */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 20,
            maxWidth: 1200,
          }}
        >
          {chains.map((chain, i) => {
            const row = Math.floor(i / 4);
            const col = i % 4;
            const delay = 12 + row * 6 + col * 3;

            const cardProgress = spring({ frame, fps, delay, config: { damping: 15, stiffness: 180 } });
            const cardOpacity = interpolate(cardProgress, [0, 1], [0, 1]);
            const cardY = interpolate(cardProgress, [0, 1], [50, 0]);
            const cardScale = interpolate(cardProgress, [0, 1], [0.8, 1]);

            return (
              <div
                key={chain.id}
                style={{
                  opacity: cardOpacity,
                  transform: `translateY(${cardY}px) scale(${cardScale})`,
                  width: 270,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 20px",
                  borderRadius: 16,
                  backgroundColor: "white",
                  border: `1px solid ${theme.border}`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <Img
                  src={staticFile(`chains/${chain.id}.png`)}
                  style={{ width: 52, height: 52, borderRadius: 14, objectFit: "contain" }}
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: theme.foreground }}>{chain.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: theme.muted }}>{chain.ticker}</span>
                </div>
              </div>
            );
          })}
        </div>

        {(() => {
          const moreProgress = spring({ frame, fps, delay: 60, config: { damping: 200 } });
          return (
            <div style={{ opacity: interpolate(moreProgress, [0, 1], [0, 1]), fontSize: 22, fontWeight: 600, color: `${theme.accent}bb` }}>
              + more coming soon
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};
