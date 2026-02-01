import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

type AnimatedTextProps = {
  text: string;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  delay?: number;
  style?: React.CSSProperties;
};

export const FadeUpText: React.FC<AnimatedTextProps> = ({
  text,
  fontSize = 48,
  color = "#f0f0f5",
  fontWeight = 700,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    delay,
    config: { damping: 200 },
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const translateY = interpolate(progress, [0, 1], [30, 0]);

  return (
    <div
      style={{
        fontSize,
        fontWeight,
        color,
        opacity,
        transform: `translateY(${translateY}px)`,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

export const ScaleInText: React.FC<AnimatedTextProps> = ({
  text,
  fontSize = 48,
  color = "#f0f0f5",
  fontWeight = 700,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    delay,
    config: { damping: 20, stiffness: 200 },
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.5, 1]);

  return (
    <div
      style={{
        fontSize,
        fontWeight,
        color,
        opacity,
        transform: `scale(${scale})`,
        ...style,
      }}
    >
      {text}
    </div>
  );
};
