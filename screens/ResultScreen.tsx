import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { ConfettiRain } from '@/components/ConfettiRain';
import { SpanishCard } from '@/components/SpanishCard';
import { AppColors, AppRadius, AppSpacing } from '@/constants/app-theme';
import { playSound } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

function getHeadline(resolution: Props['route']['params']['outcome']['resolution']) {
  switch (resolution) {
    case 'pass':
      return 'Pasaste la mano';
    case 'win':
      return 'Ganaste la apuesta';
    case 'loss':
      return 'Perdiste la apuesta';
    case 'double-loss':
      return 'Perdiste el doble';
  }
}

export function ResultScreen({ navigation, route }: Props) {
  const { outcome, playerName, salaId, jugadorId, turnoId, finPartida } = route.params;
  const [isContinuing, setIsContinuing] = useState(false);
  const [canContinue, setCanContinue] = useState(outcome.resolution !== 'win');
  const [error, setError] = useState<string | null>(null);
  const resultY = useSharedValue(-140);
  const resultScale = useSharedValue(0.8);
  const resultShake = useSharedValue(0);
  const [flipFaceDown, setFlipFaceDown] = useState(true);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    resultY.value = withSpring(0, { damping: 16, stiffness: 140 });
    setFlipFaceDown(true);

    void playSound('card_flip');
    const flipTimer = setTimeout(() => {
      setFlipFaceDown(false);
    }, 220);

    if (outcome.resolution === 'win') {
      resultScale.value = withSequence(
        withDelay(200, withTiming(1.12, { duration: 260 })),
        withTiming(1, { duration: 180 })
      );
      void playSound('win');
      unlockTimerRef.current = setTimeout(() => setCanContinue(true), 1500);
    } else if (outcome.resolution === 'loss' || outcome.resolution === 'double-loss') {
      resultShake.value = withSequence(
        withTiming(-14, { duration: 45 }),
        withTiming(14, { duration: 45 }),
        withTiming(-10, { duration: 45 }),
        withTiming(10, { duration: 45 }),
        withTiming(0, { duration: 45 })
      );
      resultScale.value = withTiming(1, { duration: 220 });
      void playSound('lose');
    }

    return () => {
      clearTimeout(flipTimer);
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
    };
  }, [outcome.resolution, resultScale, resultShake, resultY]);

  const isWin = outcome.resolution === 'win';
  const isLoss = outcome.resolution === 'loss' || outcome.resolution === 'double-loss';
  const thirdCard = outcome.cards[2];
  const tintStyle = isWin ? styles.winTint : isLoss ? styles.lossTint : null;
  const resultAmount = isWin
    ? `+$${outcome.betAmount}`
    : outcome.resolution === 'double-loss'
      ? `-$${outcome.betAmount * 2}`
      : `-$${outcome.betAmount}`;

  const resultAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: resultY.value }, { scale: resultScale.value }, { translateX: resultShake.value }],
  }));

  const handleContinue = async () => {
    if (finPartida) {
      navigation.replace('End', { salaId, jugadorId, playerName });
      return;
    }

    setIsContinuing(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('confirmar-turno-resultado', {
        body: {
          sala_id: salaId,
          jugador_id: jugadorId,
          turno_id: turnoId,
        },
      });

      if (invokeError) {
        setError(invokeError.message || 'No se pudo continuar al siguiente turno');
        setIsContinuing(false);
        return;
      }

      if (!data || (typeof data === 'object' && 'error' in data && data.error)) {
        const maybeError = typeof data === 'object' && data && 'error' in data ? String(data.error) : '';
        setError(maybeError || 'No se pudo continuar al siguiente turno');
        setIsContinuing(false);
        return;
      }

      navigation.replace('Game', { playerName, salaId, jugadorId });
    } catch {
      setError('Error de conexion al continuar');
      setIsContinuing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {isWin ? <ConfettiRain count={14} durationMs={2000} /> : null}
      <View style={styles.container}>
      <Pressable style={[styles.heroCard, tintStyle]} onPress={() => setCanContinue(true)}>
        <Text style={[styles.headline, isWin ? styles.winText : isLoss ? styles.lossText : null]}>
          {isWin ? '¡GANASTE!' : isLoss ? 'PERDISTE' : getHeadline(outcome.resolution)}
        </Text>
        {(isWin || isLoss) ? (
          <Image
            source={isWin ? require('../img/ganoronda.png') : require('../img/perdioronda.png')}
            style={styles.resultImg}
            resizeMode="contain"
          />
        ) : null}
        <Text style={[styles.amount, isWin ? styles.winText : styles.lossText]}>{resultAmount}</Text>
        <Text style={styles.potText}>Pozo actualizado: ${outcome.potAfterTurn}</Text>
      </Pressable>

      {isWin && outcome.cards[0] && outcome.cards[1] && thirdCard ? (
        <View style={styles.cardsWrapWin}>
          <SpanishCard card={outcome.cards[0]} size={1.02} variant="normal" />
          <Animated.View style={resultAnimStyle}>
            <SpanishCard
              card={thirdCard}
              size={1.08}
              variant="highlighted"
              faceDown={flipFaceDown}
              animateFlip
            />
          </Animated.View>
          <SpanishCard card={outcome.cards[1]} size={1.02} variant="normal" />
        </View>
      ) : isLoss && outcome.cards[0] && outcome.cards[1] && thirdCard ? (
        <View style={styles.cardsWrapLoss}>
          <SpanishCard card={outcome.cards[0]} size={1.02} variant="normal" />
          <Animated.View style={resultAnimStyle}>
            <SpanishCard
              card={thirdCard}
              size={1.14}
              variant="losing"
              faceDown={flipFaceDown}
              animateFlip
            />
          </Animated.View>
          <SpanishCard card={outcome.cards[1]} size={1.02} variant="normal" />
        </View>
      ) : (
        <View style={styles.cardFallback}>
          <Text style={styles.infoLine}>Sin cartas para mostrar en este turno.</Text>
        </View>
      )}

      {isLoss && outcome.resolution === 'double-loss' ? (
        <Text style={styles.doubleLossText}>¡CARTA IGUAL! -${outcome.betAmount * 2}</Text>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.actions}>
        {isContinuing ? <ActivityIndicator color={AppColors.accent} /> : null}
        <ActionButton
          label={finPartida ? 'Ver resultados finales' : canContinue ? 'Siguiente' : 'Siguiente (1.5s)'}
          onPress={handleContinue}
          disabled={isContinuing || (!canContinue && !finPartida)}
        />
      </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  container: {
    flex: 1,
    padding: AppSpacing.md,
    gap: AppSpacing.md,
  },
  heroCard: {
    backgroundColor: AppColors.secondary,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.md,
    alignItems: 'center',
    gap: 6,
  },
  winTint: {
    backgroundColor: 'rgba(39,174,96,0.22)',
  },
  lossTint: {
    backgroundColor: 'rgba(231,76,60,0.2)',
  },
  headline: {
    color: AppColors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  amount: {
    fontSize: 34,
    fontWeight: '800',
  },
  winText: {
    color: '#27AE60',
  },
  lossText: {
    color: '#E74C3C',
  },
  potText: {
    color: AppColors.mutedText,
    fontSize: 13,
    fontWeight: '400',
  },
  resultImg: {
    width: 88,
    height: 88,
  },
  cardsWrapWin: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    minHeight: 172,
  },
  cardsWrapLoss: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    minHeight: 172,
    gap: 10,
  },
  cardFallback: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.card,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.md,
  },
  infoLine: {
    color: AppColors.mutedText,
    fontSize: 14,
    fontWeight: '400',
  },
  doubleLossText: {
    color: '#E74C3C',
    fontSize: 16,
    fontWeight: '800',
  },
  actions: {
    marginTop: 'auto',
    gap: AppSpacing.sm,
  },
  errorText: {
    color: AppColors.accent,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '400',
  },
});