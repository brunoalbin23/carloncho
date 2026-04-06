import { CommonActions } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ActionButton } from '@/components/action-button';
import { ScreenShell } from '@/components/screen-shell';
import { AppColors, AppRadius, AppSpacing } from '@/constants/app-theme';
import { supabase } from '@/lib/supabase';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'End'>;

type JugadorFinal = {
  id: string;
  nombre: string;
  balance: number;
};

export function EndScreen({ navigation, route }: Props) {
  const { salaId, jugadorId, playerName } = route.params;
  const [jugadores, setJugadores] = useState<JugadorFinal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: players, error: playersError } = await supabase
          .from('jugadores')
          .select('id, nombre, balance')
          .eq('sala_id', salaId)
          .order('balance', { ascending: false });

        if (playersError) {
          throw playersError;
        }

        setJugadores(players ?? []);
      } catch {
        setError('No se pudo cargar el ranking final');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [salaId]);

  const winner = jugadores[0];

  const canRestartRound = Boolean(jugadorId && playerName);

  const handleRestartRound = async () => {
    if (!jugadorId || !playerName) {
      setError('No se encontro contexto del jugador para reiniciar la ronda.');
      return;
    }

    setIsRestarting(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('nueva-ronda', {
        body: {
          sala_id: salaId,
          jugador_id: jugadorId,
        },
      });

      if (invokeError) {
        setError(invokeError.message || 'No se pudo crear la nueva ronda');
        setIsRestarting(false);
        return;
      }

      if (!data || (typeof data === 'object' && 'error' in data && data.error)) {
        const maybeError = typeof data === 'object' && data && 'error' in data ? String(data.error) : '';
        setError(maybeError || 'No se pudo crear la nueva ronda');
        setIsRestarting(false);
        return;
      }

      if (typeof data !== 'object' || !data || !('sala' in data) || !('jugador' in data)) {
        setError('No se recibio contexto valido para la nueva ronda');
        setIsRestarting(false);
        return;
      }

      navigation.replace('Lobby', {
        salaId: data.sala.id as string,
        jugadorId: data.jugador.id as string,
        playerName,
      });
    } catch {
      setError('Error de conexion al crear la nueva ronda');
      setIsRestarting(false);
    }
  };

  return (
    <ScreenShell title="Fin de partida" subtitle="Ranking final por ganancias netas de la partida">
      {isLoading ? (
        <ActivityIndicator color={AppColors.accent} size="large" style={styles.loader} />
      ) : (
        <>
          {winner ? (
            <View style={styles.podiumCard}>
              <Text style={styles.winnerEyebrow}>Podio final</Text>
              <View style={styles.podiumRow}>
                <View style={[styles.podiumItem, styles.podiumSecond]}>
                  <Text style={styles.podiumPlace}>2</Text>
                  <Text style={styles.podiumName}>{jugadores[1]?.nombre ?? '-'}</Text>
                </View>
                <View style={[styles.podiumItem, styles.podiumFirst]}>
                  <Text style={styles.podiumCrown}>👑</Text>
                  <Text style={styles.podiumPlace}>1</Text>
                  <Text style={styles.podiumName}>{winner.nombre}</Text>
                </View>
                <View style={[styles.podiumItem, styles.podiumThird]}>
                  <Text style={styles.podiumPlace}>3</Text>
                  <Text style={styles.podiumName}>{jugadores[2]?.nombre ?? '-'}</Text>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ranking de ganancias netas</Text>
            <View style={styles.rankingList}>
              {jugadores.map((player, index) => (
                <Animated.View
                  key={player.id}
                  style={styles.rankingRow}
                  entering={FadeInDown.delay(index * 90).duration(280)}>
                  <Text style={styles.position}>{index + 1}</Text>
                  <View style={styles.playerBlock}>
                    <Text style={styles.playerName}>{player.nombre}</Text>
                    <Text style={[
                      styles.playerStack,
                      player.balance > 0 ? styles.stackWin : player.balance < 0 ? styles.stackLoss : null,
                    ]}>
                      {player.balance > 0
                        ? `Gano $${player.balance}`
                        : player.balance < 0
                          ? `Perdio $${Math.abs(player.balance)}`
                          : 'Sin cambios'}
                    </Text>
                  </View>
                  {player.balance !== 0 ? (
                    <Image
                      source={
                        player.balance > 0
                          ? require('../img/ganador.png')
                          : require('../img/perdedor.png')
                      }
                      style={styles.resultBadge}
                      resizeMode="contain"
                    />
                  ) : null}
                </Animated.View>
              ))}
            </View>
          </View>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.actions}>
        <ActionButton
          label={isRestarting ? 'Creando nueva ronda...' : 'Nueva ronda'}
          onPress={handleRestartRound}
          disabled={!canRestartRound || isRestarting}
          variant="secondary"
        />
        <ActionButton
          label="Nueva partida"
          onPress={() =>
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              })
            )
          }
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginTop: AppSpacing.xl,
  },
  podiumCard: {
    backgroundColor: AppColors.secondary,
    borderRadius: AppRadius.lg,
    gap: AppSpacing.sm,
    padding: AppSpacing.lg,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: AppColors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    justifyContent: 'center',
    padding: 8,
  },
  podiumFirst: {
    minHeight: 108,
    borderColor: '#d4af37',
  },
  podiumSecond: {
    minHeight: 82,
  },
  podiumThird: {
    minHeight: 70,
  },
  podiumCrown: {
    fontSize: 18,
  },
  podiumPlace: {
    color: AppColors.text,
    fontWeight: '800',
    fontSize: 16,
  },
  podiumName: {
    color: AppColors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  winnerEyebrow: {
    color: AppColors.warning,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  winnerName: {
    color: AppColors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  winnerBalance: {
    color: AppColors.mutedText,
    fontSize: 15,
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
  rankingList: {
    gap: AppSpacing.sm,
  },
  rankingRow: {
    alignItems: 'center',
    backgroundColor: AppColors.background,
    borderRadius: AppRadius.md,
    flexDirection: 'row',
    gap: AppSpacing.md,
    padding: AppSpacing.md,
  },
  position: {
    color: AppColors.accent,
    fontSize: 26,
    fontWeight: '800',
    width: 24,
  },
  playerBlock: {
    gap: 2,
  },
  playerName: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  playerStack: {
    color: AppColors.mutedText,
    fontSize: 14,
  },
  stackWin: {
    color: '#27AE60',
    fontWeight: '700',
  },
  stackLoss: {
    color: '#E74C3C',
    fontWeight: '700',
  },
  resultBadge: {
    width: 36,
    height: 36,
    marginLeft: 'auto',
  },
  actions: {
    gap: AppSpacing.sm,
  },
  errorText: {
    color: AppColors.accent,
    fontSize: 14,
    textAlign: 'center',
  },
});
