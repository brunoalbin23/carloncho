import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';

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
  orden?: number;
  created_at?: string;
};

export function EndScreen({ navigation, route }: Props) {
  const { salaId, jugadorId, playerName } = route.params;
  const [jugadores, setJugadores] = useState<JugadorFinal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [fallbackHostId, setFallbackHostId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const inviteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: players }, { data: sala }] = await Promise.all([
        supabase
          .from('jugadores')
          .select('id, nombre, balance, orden, created_at')
          .eq('sala_id', salaId)
          .order('balance', { ascending: false }),
        supabase.from('salas').select('*').eq('id', salaId).single(),
      ]);

      setJugadores(players ?? []);
      setHostId((sala?.host_id as string | null) ?? null);

      if (!sala?.host_id && players?.length) {
        const sortedByJoin = [...players].sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        });
        setFallbackHostId(sortedByJoin[0]?.id ?? null);
      } else {
        setFallbackHostId(null);
      }

      setIsLoading(false);
    };

    load();
  }, [salaId]);

  const isHost = useMemo(() => {
    if (!jugadorId) return false;
    if (hostId) return hostId === jugadorId;
    return fallbackHostId === jugadorId;
  }, [fallbackHostId, hostId, jugadorId]);

  useEffect(() => {
    const channel = supabase
      .channel(`sala-reinicio-${salaId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'salas',
          filter: `id=eq.${salaId}`,
        },
        (payload) => {
          const oldSala = payload.old as { estado?: string };
          const newSala = payload.new as { estado?: string };

          if (!isHost && oldSala.estado === 'terminada' && newSala.estado === 'jugando') {
            setShowInvite(true);
            if (inviteTimerRef.current) clearTimeout(inviteTimerRef.current);
            inviteTimerRef.current = setTimeout(() => {
              setShowInvite(false);
              navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'Home' }],
                })
              );
            }, 30000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (inviteTimerRef.current) {
        clearTimeout(inviteTimerRef.current);
        inviteTimerRef.current = null;
      }
    };
  }, [isHost, navigation, salaId]);

  const winner = jugadores[0];

  const canRestartRound = Boolean(isHost && jugadorId && playerName);

  const handleRestartRound = async () => {
    if (!jugadorId || !playerName) {
      setError('No se encontro contexto del jugador para reiniciar la ronda.');
      return;
    }

    setIsRestarting(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('reiniciar-sala', {
        body: {
          sala_id: salaId,
          jugador_id: jugadorId,
        },
      });

      if (invokeError) {
        setError(invokeError.message || 'No se pudo reiniciar la ronda');
        setIsRestarting(false);
        return;
      }

      if (!data || (typeof data === 'object' && 'error' in data && data.error)) {
        const maybeError = typeof data === 'object' && data && 'error' in data ? String(data.error) : '';
        setError(maybeError || 'No se pudo reiniciar la ronda');
        setIsRestarting(false);
        return;
      }

      navigation.replace('Game', {
        salaId,
        jugadorId,
        playerName,
      });
    } catch {
      setError('Error de conexion al reiniciar la ronda');
      setIsRestarting(false);
    }
  };

  const handleAcceptInvite = () => {
    if (!jugadorId || !playerName) {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        })
      );
      return;
    }

    if (inviteTimerRef.current) {
      clearTimeout(inviteTimerRef.current);
      inviteTimerRef.current = null;
    }
    setShowInvite(false);

    navigation.replace('Game', {
      salaId,
      jugadorId,
      playerName,
    });
  };

  const handleDeclineInvite = () => {
    if (inviteTimerRef.current) {
      clearTimeout(inviteTimerRef.current);
      inviteTimerRef.current = null;
    }
    setShowInvite(false);
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      })
    );
  };

  return (
    <ScreenShell title="Fin de partida" subtitle="Ranking final por ganancias netas de la partida">
      {isLoading ? (
        <ActivityIndicator color={AppColors.accent} size="large" style={styles.loader} />
      ) : showInvite ? (
        <View style={styles.inviteCard}>
          <Text style={styles.inviteTitle}>El anfitrion quiere jugar otra ronda</Text>
          <Text style={styles.inviteText}>Tienes 30 segundos para responder.</Text>
          <View style={styles.actions}>
            <ActionButton label="ACEPTAR" onPress={handleAcceptInvite} />
            <ActionButton label="SALIR" onPress={handleDeclineInvite} variant="secondary" />
          </View>
        </View>
      ) : (
        <>
          {winner ? (
            <View style={styles.winnerCard}>
              <Text style={styles.winnerEyebrow}>Ganador</Text>
              <Text style={styles.winnerName}>{winner.nombre}</Text>
              <Text style={styles.winnerBalance}>Ganancias netas: ${winner.balance}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ranking de ganancias netas</Text>
            <View style={styles.rankingList}>
              {jugadores.map((player, index) => (
                <View key={player.id} style={styles.rankingRow}>
                  <Text style={styles.position}>{index + 1}</Text>
                  <View style={styles.playerBlock}>
                    <Text style={styles.playerName}>{player.nombre}</Text>
                    <Text style={styles.playerStack}>
                      {player.balance >= 0 ? 'Gano' : 'Perdio'} ${Math.abs(player.balance)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!showInvite ? (
        <View style={styles.actions}>
          {isHost ? (
            <ActionButton
              label={isRestarting ? 'Reiniciando...' : 'Nueva ronda'}
              onPress={handleRestartRound}
              disabled={!canRestartRound || isRestarting}
              variant="secondary"
            />
          ) : null}
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
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginTop: AppSpacing.xl,
  },
  inviteCard: {
    backgroundColor: AppColors.secondary,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.lg,
    gap: AppSpacing.md,
  },
  inviteTitle: {
    color: AppColors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  inviteText: {
    color: AppColors.mutedText,
    fontSize: 14,
  },
  winnerCard: {
    backgroundColor: AppColors.secondary,
    borderRadius: AppRadius.lg,
    gap: AppSpacing.sm,
    padding: AppSpacing.lg,
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
  actions: {
    gap: AppSpacing.sm,
  },
  errorText: {
    color: AppColors.accent,
    fontSize: 14,
    textAlign: 'center',
  },
});
