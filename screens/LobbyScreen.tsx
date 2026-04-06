import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { SlideInRight } from 'react-native-reanimated';

import { ActionButton } from '@/components/action-button';
import { ScreenShell } from '@/components/screen-shell';
import { AppColors, AppRadius, AppSpacing } from '@/constants/app-theme';
import { playSound } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Lobby'>;

type Jugador = {
  id: string;
  nombre: string;
  orden: number;
};

function hashColor(name: string) {
  const palette = ['#e94560', '#3ddc97', '#6ecbff', '#ffd166', '#ff9f68', '#8e7dff'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

export function LobbyScreen({ navigation, route }: Props) {
  const { salaId, jugadorId, playerName } = route.params;
  const hasNavigatedToGameRef = useRef(false);
  const [players, setPlayers] = useState<Jugador[]>([]);
  const [sala, setSala] = useState<{ id: string; codigo: string; pozo: number; apuesta_inicial?: number | null; host_id?: string | null } | null>(null);
  const [apuestaInicialInput, setApuestaInicialInput] = useState('10');
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Cargar sala
        const { data: salaData, error: salaError } = await supabase
          .from('salas')
          .select('*')
          .eq('id', salaId)
          .single();

        if (salaError) throw salaError;

        setSala(salaData);
        if (typeof salaData.apuesta_inicial === 'number' && salaData.apuesta_inicial > 0) {
          setApuestaInicialInput(String(salaData.apuesta_inicial));
        }

        if (salaData.estado === 'jugando' && !hasNavigatedToGameRef.current) {
          hasNavigatedToGameRef.current = true;
          navigation.replace('Game', {
            salaId,
            jugadorId,
            playerName,
          });
          return;
        }

        await loadPlayers();
      } catch (err) {
        console.error('Error cargando sala:', err);
        setError('Error al cargar la sala');
      } finally {
        setIsLoading(false);
      }
    };

    const loadPlayers = async () => {
      const { data: playersData, error: playersError } = await supabase
        .from('jugadores')
        .select('id, nombre, orden')
        .eq('sala_id', salaId)
        .order('orden', { ascending: true });

      if (playersError) throw playersError;

      setPlayers(playersData || []);
    };

    const refreshPlayersSafely = async () => {
      try {
        await loadPlayers();
      } catch (err) {
        console.error('Error actualizando jugadores de lobby:', err);
      }
    };

    loadData();

    // Suscribirse a cambios en jugadores y estado de sala
    const channel = supabase
      .channel(`jugadores-${salaId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jugadores',
          filter: `sala_id=eq.${salaId}`,
        },
        () => {
          // Reconsultar evita inconsistencias de payload en diferentes entornos Realtime.
          void refreshPlayersSafely();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'salas',
          filter: `id=eq.${salaId}`,
        },
        (payload) => {
          const nextSala = payload.new as {
            id: string;
            codigo: string;
            pozo: number;
            estado: string;
            apuesta_inicial?: number | null;
            host_id?: string | null;
          };
          setSala({
            id: nextSala.id,
            codigo: nextSala.codigo,
            pozo: nextSala.pozo,
            apuesta_inicial: nextSala.apuesta_inicial ?? null,
            host_id: nextSala.host_id ?? null,
          });

          if (typeof nextSala.apuesta_inicial === 'number' && nextSala.apuesta_inicial > 0) {
            setApuestaInicialInput(String(nextSala.apuesta_inicial));
          }

          if (nextSala.estado === 'jugando' && !hasNavigatedToGameRef.current) {
            hasNavigatedToGameRef.current = true;
            navigation.replace('Game', {
              salaId,
              jugadorId,
              playerName,
            });
          }
        }
      )
      .subscribe();

    // Fallback: refresco periódico por si Realtime no entrega eventos en el host.
    const pollId = setInterval(() => {
      void refreshPlayersSafely();
    }, 2500);

    return () => {
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [salaId, jugadorId, playerName, navigation]);

  const isHost = sala?.host_id ? sala.host_id === jugadorId : players.some((p) => p.id === jugadorId && p.orden === 0);
  const apuestaInicial = Math.max(1, Number(apuestaInicialInput.replace(/\D/g, '') || '0'));
  const pozoEstimado = apuestaInicial * players.length;

  useEffect(() => {
    if (!isHost || isLoading || isStarting || !sala?.id) return;
    if (sala.apuesta_inicial === apuestaInicial) return;

    const timeoutId = setTimeout(async () => {
      const { error: updateError } = await supabase
        .from('salas')
        .update({ apuesta_inicial: apuestaInicial })
        .eq('id', salaId);

      if (updateError) {
        console.error('Error actualizando aporte en sala:', updateError);
        setError('No se pudo sincronizar el aporte en tiempo real');
      } else {
        setError((prev) => (prev === 'No se pudo sincronizar el aporte en tiempo real' ? null : prev));
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [apuestaInicial, isHost, isLoading, isStarting, sala?.apuesta_inicial, sala?.id, salaId]);

  const handleStartGame = async () => {
    setIsStarting(true);
    setError(null);

    try {
      await playSound('shuffle');
      const { data, error: invokeError } = await supabase.functions.invoke('iniciar-partida', {
        body: JSON.stringify({
          sala_id: salaId,
          jugador_id: jugadorId,
          apuesta_inicial: apuestaInicial,
        }),
      });

      if (invokeError) {
        setError(invokeError.message || 'Error al iniciar partida');
        setIsStarting(false);
        return;
      }

      if (!data || (typeof data === 'object' && 'error' in data && data.error)) {
        const maybeError = typeof data === 'object' && data && 'error' in data ? String(data.error) : '';
        setError(maybeError || 'Error al iniciar partida');
        setIsStarting(false);
        return;
      }

      navigation.replace('Game', {
        salaId,
        jugadorId,
        playerName,
      });
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.');
      console.error('Error iniciando partida (invoke):', err);
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenShell title="Cargando sala..." subtitle="">
        <ActivityIndicator color={AppColors.accent} size="large" style={styles.loader} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={`Sala ${sala?.codigo}`}
      subtitle={`${players.length} jugadores conectados`}>
      <View style={styles.banner}>
        <Text style={styles.pozoTotal}>Pozo total: ${pozoEstimado}</Text>
        <Text style={styles.bannerTitle}>Aporte por jugador: ${apuestaInicial}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Jugadores en la sala</Text>
        {players.length === 0 ? (
          <Text style={styles.emptyText}>Esperando otros jugadores...</Text>
        ) : (
          <View style={styles.playerList}>
            {players.map((player) => (
              <Animated.View key={player.id} style={styles.playerRow} entering={SlideInRight.duration(260)}>
                <View style={[styles.avatar, { backgroundColor: hashColor(player.nombre) }]}>
                  <Text style={styles.avatarText}>{player.nombre.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{player.nombre}</Text>
                </View>
              </Animated.View>
            ))}
          </View>
        )}
      </View>

      {isHost ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Configuracion del anfitrion</Text>
          <Text style={styles.infoLine}>Aporte por jugador</Text>
          <TextInput
            value={apuestaInicialInput}
            onChangeText={(text) => setApuestaInicialInput(text.replace(/\D/g, '').slice(0, 6))}
            style={styles.input}
            keyboardType="number-pad"
            placeholder="Apuesta inicial por jugador"
            placeholderTextColor={AppColors.mutedText}
            editable={!isStarting}
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      <View style={styles.actions}>
        {isHost ? (
          <ActionButton
            disabled={players.length < 2 || isStarting}
            label={isStarting ? 'Iniciando...' : 'Iniciar partida'}
            onPress={handleStartGame}
          />
        ) : (
          <ActionButton disabled label="Esperando al anfitrion" onPress={() => undefined} />
        )}
        <ActionButton
          label="Salir"
          onPress={() => navigation.popToTop()}
          variant="ghost"
          disabled={isStarting}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: AppColors.secondary,
    borderRadius: AppRadius.lg,
    gap: AppSpacing.xs,
    padding: AppSpacing.lg,
  },
  pozoTotal: {
    color: AppColors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  bannerTitle: {
    color: AppColors.mutedText,
    fontSize: 16,
    fontWeight: '700',
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
  playerList: {
    gap: AppSpacing.sm,
  },
  playerRow: {
    alignItems: 'center',
    backgroundColor: AppColors.background,
    borderRadius: AppRadius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: AppSpacing.md,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: AppSpacing.sm,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: AppColors.mutedText,
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: AppSpacing.md,
  },
  errorText: {
    color: AppColors.accent,
    fontSize: 15,
    marginBottom: AppSpacing.sm,
    textAlign: 'center',
  },
  input: {
    backgroundColor: AppColors.background,
    borderColor: AppColors.border,
    borderRadius: AppRadius.md,
    borderWidth: 1,
    color: AppColors.text,
    fontSize: 17,
    marginBottom: AppSpacing.sm,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
  },
  infoLine: {
    color: AppColors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: AppSpacing.sm,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});