import { AbsoluteFill, staticFile, useVideoConfig, interpolate, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";

import { Hook } from "./scenes/Hook";
import { Problem } from "./scenes/Problem";
import { Solution } from "./scenes/Solution";
import { HowItWorks } from "./scenes/HowItWorks";
import { ChainShowcase } from "./scenes/ChainShowcase";
import { Outro } from "./scenes/Outro";

export const AwakenFetchVideo: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const t = (seconds: number) => Math.round(seconds * fps);

  return (
    <AbsoluteFill>
      {/* Background music with fade in/out */}
      <Audio
        src={staticFile("product-tutorial-background-clean-tech-459161.mp3")}
        volume={(f) => {
          const fadeIn = interpolate(f, [0, 1 * fps], [0, 0.4], { extrapolateRight: "clamp" });
          const fadeOut = interpolate(f, [durationInFrames - 2 * fps, durationInFrames], [0.4, 0], { extrapolateLeft: "clamp" });
          return Math.min(fadeIn, fadeOut);
        }}
      />

    <TransitionSeries>
      {/* 1. Hook -- logo + orbiting chains */}
      <TransitionSeries.Sequence durationInFrames={t(4)}>
        <Hook />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: t(0.6) })}
      />

      {/* 2. Problem -- broken CSV nightmare */}
      <TransitionSeries.Sequence durationInFrames={t(5)}>
        <Problem />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: t(0.5) })}
      />

      {/* 3. Solution -- AwakenFetch does it */}
      <TransitionSeries.Sequence durationInFrames={t(4.5)}>
        <Solution />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: t(0.5) })}
      />

      {/* 4. Demo -- real screen recording (proof) */}
      <TransitionSeries.Sequence durationInFrames={t(7.5)}>
        <HowItWorks />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: t(0.5) })}
      />

      {/* 5. Chain Showcase -- breadth of support */}
      <TransitionSeries.Sequence durationInFrames={t(4)}>
        <ChainShowcase />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: t(0.6) })}
      />

      {/* 6. Outro -- CTA */}
      <TransitionSeries.Sequence durationInFrames={t(5)}>
        <Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    </AbsoluteFill>
  );
};
