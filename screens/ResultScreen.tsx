import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { AppColors, AppRadius, AppSpacing } from '@/constants/app-theme';
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
  const [showThirdCard, setShowThirdCard] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;

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
  const resultColor = isWin ? AppColors.success : isLoss ? '#ff4d4d' : AppColors.warning;

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
      <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.headline}>{getHeadline(outcome.resolution)}</Text>
      </View>

      <View style={styles.card}>
        {(isWin || isLoss) && outcome.cards[0] && outcome.cards[1] && thirdCard ? (
          <View style={styles.cardRow}>
            <View key={`${outcome.cards[0].suit}-${outcome.cards[0].value}`} style={[styles.playingCard, { borderColor: resultColor }]}>
              <Text style={styles.cardValue}>{outcome.cards[0].value}</Text>
              <Text style={styles.cardSuit}>{outcome.cards[0].suit}</Text>
            </View>
            <Animated.View
              style={[
                styles.playingCard,
                { borderColor: resultColor },
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
            <View key={`${outcome.cards[1].suit}-${outcome.cards[1].value}`} style={[styles.playingCard, { borderColor: resultColor }]}>
              <Text style={styles.cardValue}>{outcome.cards[1].value}</Text>
              <Text style={styles.cardSuit}>{outcome.cards[1].suit}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.infoLine}>Sin cartas para mostrar en este turno.</Text>
        )}
      </View>

      <View style={[styles.card, styles.impactCard]}>
        <Text style={styles.infoLine}>Apuesta: ${outcome.betAmount}</Text>
        <Text style={styles.infoLine}>Pozo: ${outcome.potAfterTurn}</Text>
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

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.actions}>
        {isContinuing ? <ActivityIndicator color={AppColors.accent} /> : null}
        <ActionButton
          label={finPartida ? 'Ver resultados finales' : 'Siguiente turno'}
          onPress={handleContinue}
          disabled={isContinuing}
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
    padding: AppSpacing.lg,
    gap: AppSpacing.md,
  },
  heroCard: {
    backgroundColor: AppColors.secondary,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.md,
  },
  headline: {
    color: AppColors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: AppRadius.lg,
    gap: AppSpacing.sm,
    padding: AppSpacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  playingCard: {
    backgroundColor: AppColors.background,
    borderRadius: AppRadius.md,
    borderWidth: 1,
    borderColor: AppColors.accent,
    flex: 1,
    minHeight: 110,
    padding: AppSpacing.sm,
    justifyContent: 'space-between',
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
  impactCard: {
    gap: AppSpacing.xs,
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
    marginTop: 'auto',
  },
  errorText: {
    color: AppColors.accent,
    fontSize: 14,
    textAlign: 'center',
  },
});