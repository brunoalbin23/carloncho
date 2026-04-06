import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import type { SpanishCard } from '@/types/game';

export type SpanishCardVariant = 'normal' | 'highlighted' | 'winning' | 'losing';

type Props = {
  card?: SpanishCard | null;
  size?: number;
  faceDown?: boolean;
  variant?: SpanishCardVariant;
  animateFlip?: boolean;
};

const BASE_WIDTH = 80;
const BASE_HEIGHT = 120;

function suitColor(suit: SpanishCard['suit']) {
  if (suit === 'espada') return '#111111';
  if (suit === 'basto') return '#5a3a22';
  if (suit === 'copa') return '#7c1f1f';
  return '#B8860B';
}

function SuitIcon({ suit, color, size }: { suit: SpanishCard['suit']; color: string; size: number }) {
  if (suit === 'espada') {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d="M50 10 L58 28 L54 28 L54 70 L46 70 L46 28 L42 28 Z" fill={color} />
        <Rect x="34" y="30" width="32" height="6" rx="3" fill={color} />
        <Rect x="42" y="70" width="16" height="12" rx="3" fill={color} />
      </Svg>
    );
  }

  if (suit === 'basto') {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Rect x="45" y="16" width="10" height="56" rx="5" fill={color} />
        <Circle cx="50" cy="16" r="10" fill={color} />
        <Rect x="38" y="72" width="24" height="10" rx="4" fill={color} />
      </Svg>
    );
  }

  if (suit === 'copa') {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d="M26 24 H74 C74 44 64 58 50 58 C36 58 26 44 26 24 Z" fill={color} />
        <Rect x="45" y="58" width="10" height="16" rx="3" fill={color} />
        <Rect x="32" y="74" width="36" height="10" rx="4" fill={color} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50 14 L80 50 L50 86 L20 50 Z" fill="none" stroke={color} strokeWidth="8" />
      <Path d="M50 28 L66 50 L50 72 L34 50 Z" fill="none" stroke={color} strokeWidth="5" />
    </Svg>
  );
}

function BackPattern({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x="0" y="0" width={width} height={height} fill="#16213e" />
      {Array.from({ length: 7 }).map((_, i) => (
        <Path
          key={`d-${i}`}
          d={`M${8 + i * 11} 8 L${12 + i * 11} 14 L${8 + i * 11} 20 L${4 + i * 11} 14 Z`}
          fill="#1a1a2e"
        />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <Line
          key={`l-${i}`}
          x1={8}
          y1={26 + i * 18}
          x2={width - 8}
          y2={26 + i * 18}
          stroke="#1a1a2e"
          strokeWidth="2"
        />
      ))}
    </Svg>
  );
}

export function SpanishCard({
  card,
  size = 1,
  faceDown = false,
  variant = 'normal',
  animateFlip = false,
}: Props) {
  const width = BASE_WIDTH * size;
  const height = BASE_HEIGHT * size;
  const iconSize = Math.max(18, 24 * size);
  const centerSize = Math.max(28, 44 * size);
  const suit = card?.suit ?? 'espada';
  const value = String(card?.value ?? '?');
  const color = suitColor(suit);

  const rotate = useSharedValue(faceDown ? 180 : 0);

  const flipStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${rotate.value}deg` }],
  }));

  useEffect(() => {
    if (!animateFlip) {
      rotate.value = faceDown ? 180 : 0;
      return;
    }

    const target = faceDown ? 180 : 0;
    rotate.value = withSequence(
      withTiming(90, { duration: 200, easing: Easing.inOut(Easing.cubic) }),
      withTiming(target, { duration: 200, easing: Easing.inOut(Easing.cubic) })
    );
  }, [animateFlip, faceDown, rotate]);

  const cardStyle = useMemo(() => {
    if (variant === 'highlighted') {
      return {
        borderColor: '#d4af37',
        transform: [{ scale: 1.05 }],
      };
    }
    if (variant === 'winning') {
      return { borderColor: '#27AE60' };
    }
    if (variant === 'losing') {
      return { borderColor: '#E74C3C' };
    }
    return { borderColor: '#d7dbe9' };
  }, [variant]);

  return (
    <Animated.View
      style={[
        styles.card,
        flipStyle,
        {
          width,
          height,
          borderRadius: 8 * size,
        },
        cardStyle,
      ]}>
      {faceDown ? (
        <View style={[styles.face, styles.backFace]}>
          <BackPattern width={width - 6} height={height - 6} />
        </View>
      ) : (
        <View style={styles.face}>
          <View style={[styles.cornerTop, { top: 6 * size, left: 6 * size }]}>
            <Text style={[styles.value, { color, fontSize: 15 * size }]}>{value}</Text>
            <SuitIcon suit={suit} color={color} size={iconSize} />
          </View>

          <View style={styles.centerIcon}>
            <SuitIcon suit={suit} color={color} size={centerSize} />
          </View>

          <View style={[styles.cornerBottom, { bottom: 6 * size, right: 6 * size }]}>
            <Text style={[styles.value, { color, fontSize: 15 * size }]}>{value}</Text>
            <SuitIcon suit={suit} color={color} size={iconSize} />
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1.4,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  face: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backFace: {
    borderColor: '#d4af37',
    borderWidth: 1,
    backgroundColor: '#16213e',
    padding: 2,
  },
  cornerTop: {
    position: 'absolute',
    alignItems: 'center',
    gap: 2,
  },
  cornerBottom: {
    position: 'absolute',
    alignItems: 'center',
    gap: 2,
    transform: [{ rotate: '180deg' }],
  },
  value: {
    fontWeight: '800',
  },
  centerIcon: {
    opacity: 0.95,
  },
});
