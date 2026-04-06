import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    Extrapolation,
    interpolate,
    type SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

type Piece = {
  id: number;
  left: number;
  size: number;
  delay: number;
  color: string;
  drift: number;
};

type Props = {
  count?: number;
  durationMs?: number;
};

const COLORS = ['#e94560', '#ffd166', '#3ddc97', '#6ecbff', '#f7f7fb'];

export function ConfettiRain({ count = 12, durationMs = 2000 }: Props) {
  const progress = useSharedValue(0);

  const pieces = useMemo<Piece[]>(() => {
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: (i * 29) % 100,
      size: 6 + ((i * 7) % 8),
      delay: (i % 5) * 70,
      color: COLORS[i % COLORS.length],
      drift: (i % 2 === 0 ? 1 : -1) * (8 + (i % 4) * 4),
    }));
  }, [count]);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: durationMs });
  }, [durationMs, progress]);

  return (
    <View pointerEvents="none" style={styles.root}>
      {pieces.map((p) => (
        <PieceDot key={p.id} piece={p} progress={progress} />
      ))}
    </View>
  );
}

function PieceDot({ piece, progress }: { piece: Piece; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: interpolate(t, [0, 0.1, 0.85, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(t, [0, 1], [-40 - piece.delay, 360 + piece.delay], Extrapolation.CLAMP) },
        { translateX: interpolate(t, [0, 1], [0, piece.drift], Extrapolation.CLAMP) },
        { rotate: `${interpolate(t, [0, 1], [0, 360], Extrapolation.CLAMP)}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.dot,
        style,
        {
          left: `${piece.left}%`,
          width: piece.size,
          height: piece.size,
          backgroundColor: piece.color,
          borderRadius: piece.size / 2,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  dot: {
    position: 'absolute',
    top: -30,
  },
});
