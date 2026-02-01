import { Composition } from "remotion";
import { AwakenFetchVideo } from "./AwakenFetchVideo";

// Scene durations: 4 + 5 + 4.5 + 7.5 + 4 + 5 = 30s
// Transitions: 5 x ~0.54s avg = 2.7s overlap
// Net: ~27.3s
const FPS = 30;
const DURATION_FRAMES = Math.round(27.3 * FPS);

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AwakenFetchVideo"
      component={AwakenFetchVideo}
      durationInFrames={DURATION_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
