import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ActionButton } from '@/components/action-button';
import { ScreenShell } from '@/components/screen-shell';
import { AppColors, AppRadius, AppSpacing } from '@/constants/app-theme';
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
  const { outcome, playerName, salaId, jugadorId, finPartida } = route.params;
  const [showThirdCard, setShowThirdCard] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;

  const variation = useMemo(() => {
    if (outcome.resolution === 'pass') return 0;
    if (outcome.resolution === 'win') return outcome.betAmount;
    if (outcome.resolution === 'double-loss') return -(outcome.betAmount * 2);
    return -outcome.betAmount;
  }, [outcome.betAmount, outcome.resolution]);

  useEffect(() => {
    if (!outcome.cards[2]) return;

    setShowThirdCard(false);
    reveal.setValue(0);
    Animated.sequence([
      Animated.delay(250),
      Animated.timing(reveal, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setShowThirdCard(true));
  }, [reveal, outcome.cards]);

  const thirdCardScale = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });

  const thirdCardOpacity = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });

  const isWin = outcome.resolution === 'win';
  const isLoss = outcome.resolution === 'loss' || outcome.resolution === 'double-loss';
  const thirdCard = outcome.cards[2];

  return (
    <ScreenShell title="Resultado del turno" subtitle="Resumen de cartas, variacion neta y pozo actualizado">
      <View style={styles.heroCard}>
        <Text style={styles.headline}>{getHeadline(outcome.resolution)}</Text>
        <Text style={styles.summary}>{outcome.summary}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cartas mostradas</Text>
        {(isWin || isLoss) && outcome.cards[0] && outcome.cards[1] && thirdCard ? (
          <View style={styles.cardRow}>
            <View key={`${outcome.cards[0].suit}-${outcome.cards[0].value}`} style={styles.playingCard}>
              <Text style={styles.cardValue}>{outcome.cards[0].value}</Text>
              <Text style={styles.cardSuit}>{outcome.cards[0].suit}</Text>
            </View>
            <Animated.View
              style={[
                styles.playingCard,
                styles.thirdCard,
                { opacity: thirdCardOpacity, transform: [{ scale: thirdCardScale }] },
              ]}>
              {showThirdCard ? (
                <>
                  <Text style={styles.cardValue}>{thirdCard.value}</Text>
                  <Text style={styles.cardSuit}>{thirdCard.suit}</Text>
                </>
              ) : (
                <Text style={styles.cardBackText}>?</Text>
              )}
            </Animated.View>
            <View key={`${outcome.cards[1].suit}-${outcome.cards[1].value}`} style={styles.playingCard}>
              <Text style={styles.cardValue}>{outcome.cards[1].value}</Text>
              <Text style={styles.cardSuit}>{outcome.cards[1].suit}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.infoLine}>Sin cartas para mostrar en este turno.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Impacto en el pozo</Text>
        <Text style={styles.infoLine}>Apuesta del turno: ${outcome.betAmount}</Text>
        <Text style={styles.infoLine}>Pozo despues del turno: ${outcome.potAfterTurn}</Text>
        {outcome.resolution === 'win' ? (
          <Text style={[styles.variation, styles.variationPositive]}>Ganancia: +${outcome.betAmount}</Text>
        ) : outcome.resolution === 'loss' ? (
          <Text style={[styles.variation, styles.variationNegative]}>Perdida: -${outcome.betAmount}</Text>
        ) : outcome.resolution === 'double-loss' ? (
          <Text style={[styles.variation, styles.variationNegative]}>
            Perdida: -${outcome.betAmount * 2}
          </Text>
        ) : (
          <Text style={[styles.variation, styles.infoLine]}>Pasaste el turno</Text>
        )}
      </View>

      <View style={styles.actions}>
        {finPartida ? (
          <ActionButton
            label="Ver resultados finales"
            onPress={() => navigation.replace('End', { salaId, jugadorId, playerName })}
          />
        ) : (
          <ActionButton
            label="Siguiente turno"
            onPress={() => navigation.replace('Game', { playerName, salaId, jugadorId })}
          />
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: AppColors.secondary,
    borderRadius: AppRadius.lg,
    gap: AppSpacing.sm,
    padding: AppSpacing.lg,
  },
  headline: {
    color: AppColors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  summary: {
    color: AppColors.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: AppRadius.lg,
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
  },
  sectionTitle: {
    color: AppColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  cardRow: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  playingCard: {
    backgroundColor: AppColors.background,
    borderRadius: AppRadius.md,
    borderWidth: 1,
    borderColor: AppColors.border,
    flex: 1,
    minHeight: 120,
    padding: AppSpacing.md,
    justifyContent: 'space-between',
  },
  thirdCard: {
    borderColor: AppColors.accent,
  },
  cardBackText: {
    color: AppColors.warning,
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardValue: {
    color: AppColors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  cardSuit: {
    color: AppColors.accent,
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  infoLine: {
    color: AppColors.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
  variation: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: AppSpacing.xs,
  },
  variationPositive: {
    color: AppColors.success,
  },
  variationNegative: {
    color: '#ff4d4d',
  },
  actions: {
    gap: AppSpacing.sm,
  },
});