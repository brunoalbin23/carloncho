import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { AppColors, AppRadius, AppSpacing } from '@/constants/app-theme';
import { supabase } from '@/lib/supabase';
import type { SpanishCard, SpanishCardValue } from '@/types/game';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

type Jugador = {
  id: string;
  nombre: string;
  balance: number;
  orden: number;
  activo?: boolean;
};

type TurnBanner = {
  jugadorNombre: string;
  texto: string;
  cartas: SpanishCard[];
};

function parseCard(raw: unknown): SpanishCard | null {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const value = (raw as { valor?: number }).valor;
    const suit = (raw as { palo?: SpanishCard['suit'] }).palo;
    if (typeof value === 'number' && typeof suit === 'string') {
      return { value: value as SpanishCardValue, suit };
    }
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as { valor?: number; palo?: SpanishCard['suit'] };
      if (typeof parsed.valor === 'number' && typeof parsed.palo === 'string') {
        return { value: parsed.valor as SpanishCardValue, suit: parsed.palo };
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function GameScreen({ navigation, route }: Props) {
  const { salaId, jugadorId, playerName } = route.params;

  const [carta1, setCarta1] = useState<SpanishCard | null>(null);
  const [carta2, setCarta2] = useState<SpanishCard | null>(null);
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [pozo, setPozo] = useState(0);
  const [estadoSala, setEstadoSala] = useState<'esperando' | 'jugando' | 'resolviendo' | 'terminada'>('jugando');
  const [myBalance, setMyBalance] = useState(0);
  const [turnoActual, setTurnoActual] = useState(-1);
  const [myOrden, setMyOrden] = useState(-1);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [betInput, setBetInput] = useState('');
  const [isLoadingInit, setIsLoadingInit] = useState(true);
  const [isLoadingRepartir, setIsLoadingRepartir] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBetInputFocused, setIsBetInputFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<TurnBanner | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const dealtForTurnRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playersRef = useRef<Jugador[]>([]);

  useEffect(() => {
    playersRef.current = jugadores;
  }, [jugadores]);

  const repartirCartas = useCallback(async () => {
    if (turnoActual === -1) return;

    dealtForTurnRef.current = turnoActual;
    setIsLoadingRepartir(true);
    setError(null);
    setCarta1(null);
    setCarta2(null);
    setTurnoId(null);
    setBetInput('');

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('repartir-cartas', {
        body: { sala_id: salaId, jugador_id: jugadorId },
      });

      if (invokeError) {
        setError(invokeError.message || 'Error al repartir cartas');
        return;
      }

      if (!data || typeof data !== 'object' || !('carta1' in data) || !('carta2' in data) || !('turno_id' in data)) {
        const maybeError =
          typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Error al repartir cartas';
        setError(maybeError);
        return;
      }
      setCarta1({ suit: data.carta1.palo, value: data.carta1.valor as SpanishCardValue });
      setCarta2({ suit: data.carta2.palo, value: data.carta2.valor as SpanishCardValue });
      setTurnoId(data.turno_id);
    } catch {
      setError('Error de conexion al repartir cartas');
    } finally {
      setIsLoadingRepartir(false);
    }
  }, [jugadorId, salaId, turnoActual]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const [{ data: sala }, { data: players }] = await Promise.all([
          supabase.from('salas').select('pozo, turno_actual, estado').eq('id', salaId).single(),
          supabase
            .from('jugadores')
            .select('id, nombre, balance, orden, activo')
            .eq('sala_id', salaId)
            .order('orden', { ascending: true }),
        ]);

        if (cancelled) return;

        if (!sala || !players) {
          setError('Error al cargar la partida');
          setIsLoadingInit(false);
          return;
        }

        if (sala.estado === 'terminada') {
          navigation.replace('End', { salaId, jugadorId, playerName });
          return;
        }

        const me = players.find((p) => p.id === jugadorId);
        setMyOrden(me?.orden ?? -1);
        setMyBalance(me?.balance ?? 0);
        setJugadores(players);
        setPozo(sala.pozo);
        setEstadoSala(sala.estado as 'esperando' | 'jugando' | 'resolviendo' | 'terminada');
        setTurnoActual(sala.turno_actual);
        setIsLoadingInit(false);
      } catch {
        if (!cancelled) {
          setError('Error al cargar la partida');
          setIsLoadingInit(false);
        }
      }
    };

    init();

    const channel = supabase
      .channel(`sala-game-${salaId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'salas', filter: `id=eq.${salaId}` },
        (payload) => {
          const updated = payload.new as { pozo: number; turno_actual: number; estado: string };
          setPozo(updated.pozo);
          setEstadoSala(updated.estado as 'esperando' | 'jugando' | 'resolviendo' | 'terminada');
          setTurnoActual(updated.turno_actual);
          if (updated.estado === 'terminada') {
            navigation.replace('End', { salaId, jugadorId, playerName });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jugadores', filter: `sala_id=eq.${salaId}` },
        (payload) => {
          const updated = payload.new as Jugador;
          setJugadores((prev) => prev.map((j) => (j.id === updated.id ? { ...j, ...updated } : j)));
          if (updated.id === jugadorId) {
            setMyBalance(updated.balance);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'turnos', filter: `sala_id=eq.${salaId}` },
        (payload) => {
          const oldRow = payload.old as { resultado?: string | null };
          const newRow = payload.new as {
            jugador_id: string;
            resultado?: string | null;
            ganancia?: number;
            carta1?: unknown;
            carta2?: unknown;
            carta3?: unknown;
          };

          if (newRow.jugador_id === jugadorId) return;
          if (oldRow?.resultado !== null && oldRow?.resultado !== undefined) return;
          if (!newRow.resultado) return;

          const jugador = playersRef.current.find((j) => j.id === newRow.jugador_id);
          const nombre = jugador?.nombre ?? 'Jugador';
          const c1 = parseCard(newRow.carta1);
          const c2 = parseCard(newRow.carta2);
          const c3 = parseCard(newRow.carta3);
          const gananciaAbs = Math.abs(newRow.ganancia ?? 0);

          let texto = '';
          let cartas: SpanishCard[] = [];

          if (newRow.resultado === 'gano') {
            texto = `gano $${gananciaAbs}`;
            cartas = [c1, c3, c2].filter(Boolean) as SpanishCard[];
          } else if (newRow.resultado === 'perdio') {
            texto = `perdio $${gananciaAbs}`;
            cartas = [c1, c3, c2].filter(Boolean) as SpanishCard[];
          } else {
            texto = 'paso';
          }

          setBanner({ jugadorNombre: nombre, texto, cartas });

          if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = setTimeout(() => setBanner(null), 5000);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }
    };
  }, [jugadorId, navigation, playerName, salaId]);

  useEffect(() => {
    if (isLoadingInit || myOrden === -1 || turnoActual === -1) return;

    if (dealtForTurnRef.current !== turnoActual) {
      dealtForTurnRef.current = null;
    }

    if (
      estadoSala === 'jugando' &&
      myOrden === turnoActual &&
      !carta1 &&
      !turnoId &&
      !isLoadingRepartir &&
      dealtForTurnRef.current !== turnoActual
    ) {
      repartirCartas();
    }
  }, [carta1, estadoSala, isLoadingInit, isLoadingRepartir, myOrden, repartirCartas, turnoActual, turnoId]);

  const handlePass = async () => {
    if (!turnoId || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('resolver-turno', {
        body: { turno_id: turnoId, jugador_id: jugadorId, apuesta: 0 },
      });

      if (invokeError) {
        setError(invokeError.message || 'Error al pasar');
        setIsSubmitting(false);
        return;
      }

      if (!data || typeof data !== 'object' || !('fin_partida' in data)) {
        const maybeError =
          typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Error al pasar';
        setError(maybeError);
        setIsSubmitting(false);
        return;
      }
      dealtForTurnRef.current = null;
      if (data.fin_partida) {
        navigation.replace('End', { salaId, jugadorId, playerName });
      } else {
        navigation.replace('Game', { salaId, jugadorId, playerName });
      }
    } catch {
      setError('Error de conexion');
      setIsSubmitting(false);
    }
  };

  const handleBet = async () => {
    if (!turnoId || isSubmitting || !carta1 || !carta2) return;
    const apuesta = Number(betInput);
    if (!Number.isInteger(apuesta) || apuesta <= 0) {
      setError('Ingresa un monto valido');
      return;
    }
    if (apuesta > pozo) {
      setError('La apuesta no puede superar el pozo');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('resolver-turno', {
        body: { turno_id: turnoId, jugador_id: jugadorId, apuesta },
      });

      if (invokeError) {
        setError(invokeError.message || 'Error al apostar');
        setIsSubmitting(false);
        return;
      }

      if (!data || typeof data !== 'object' || !('carta3' in data) || !('resultado' in data) || !('pozo' in data)) {
        const maybeError =
          typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Error al apostar';
        setError(maybeError);
        setIsSubmitting(false);
        return;
      }

      dealtForTurnRef.current = null;
      const carta3: SpanishCard = {
        suit: data.carta3.palo,
        value: data.carta3.valor as SpanishCardValue,
      };
      const ganancia = data.ganancia as number;
      let resolution: 'win' | 'loss' | 'double-loss' = 'loss';

      if (data.resultado === 'gano') {
        resolution = 'win';
      } else if (ganancia === -(apuesta * 2)) {
        resolution = 'double-loss';
      }

      navigation.replace('Result', {
        playerName,
        salaId,
        jugadorId,
        turnoId,
        finPartida: data.fin_partida as boolean,
        outcome: {
          resolution,
          betAmount: apuesta,
          potAfterTurn: data.pozo as number,
          summary:
            resolution === 'win'
              ? 'Ganaste el turno.'
              : resolution === 'double-loss'
                ? 'Perdiste el doble.'
                : 'Perdiste la apuesta.',
          cards: [carta1, carta2, carta3],
        },
      });
    } catch {
      setError('Error de conexion');
      setIsSubmitting(false);
    }
  };

  const isMyTurn = myOrden !== -1 && myOrden === turnoActual;
  const canPlayTurn = isMyTurn && estadoSala === 'jugando';
  const isTurnRevealActive = Boolean(banner);
  const activePlayer = jugadores.find((j) => j.orden === turnoActual);
  const maxBet = pozo;

  const disconnectedNames = useMemo(
    () => jugadores.filter((j) => j.activo === false).map((j) => j.nombre),
    [jugadores]
  );

  if (isLoadingInit) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={AppColors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <View style={styles.topZone}>
          <Text style={styles.brandTitle}>CARLONCHO</Text>
          <Text style={styles.potLabel}>Pozo actual</Text>
          <Text style={styles.potValue}>${pozo}</Text>
          <Text style={styles.meta}>Tus ganancias netas: ${myBalance}</Text>
          {disconnectedNames.length > 0 ? (
            <Text style={styles.disconnected}>Desconectados: {disconnectedNames.join(', ')}</Text>
          ) : null}
        </View>

        <View style={styles.middleZone}>
          {banner ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                {banner.jugadorNombre} {banner.texto}
              </Text>
              <View style={styles.bannerCards}>
                {banner.cartas.map((c, i) => (
                  <View key={`${c.suit}-${c.value}-${i}`} style={styles.miniCard}>
                    <Text style={styles.miniValue}>{c.value}</Text>
                    <Text style={styles.miniSuit}>{c.suit.slice(0, 1).toUpperCase()}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {canPlayTurn ? (
            isLoadingRepartir ? (
              <ActivityIndicator color={AppColors.accent} size="large" />
            ) : (
              <View style={styles.cardRow}>
                <View style={styles.playingCard}>
                  <Text style={styles.cardValue}>{carta1?.value ?? '-'}</Text>
                  <Text style={styles.cardSuit}>{carta1?.suit ?? ''}</Text>
                </View>
                <View style={styles.playingCard}>
                  <Text style={styles.cardValue}>{carta2?.value ?? '-'}</Text>
                  <Text style={styles.cardSuit}>{carta2?.suit ?? ''}</Text>
                </View>
              </View>
            )
          ) : (
            <View style={styles.waitingCard}>
              <Text style={styles.waitingText}>
                {isMyTurn && estadoSala === 'resolviendo'
                  ? 'Esperando confirmacion del resultado...'
                  : `Esperando turno de ${activePlayer?.nombre ?? '...'}`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomZone}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {canPlayTurn && !isTurnRevealActive ? (
            <>
              <View style={styles.betRow}>
                <TextInput
                  style={styles.betInput}
                  keyboardType="number-pad"
                  placeholder={`Monto (max ${maxBet})`}
                  placeholderTextColor={AppColors.mutedText}
                  value={betInput}
                  onChangeText={setBetInput}
                  onFocus={() => setIsBetInputFocused(true)}
                  onBlur={() => setIsBetInputFocused(false)}
                  maxLength={7}
                  editable={!isSubmitting}
                />
                <View style={styles.pozoButtonWrap}>
                  <ActionButton
                    label="EL POZO"
                    onPress={() => setBetInput(String(maxBet))}
                    disabled={isSubmitting || maxBet <= 0}
                    variant="ghost"
                  />
                </View>
              </View>

              <ActionButton
                label={isSubmitting ? 'PROCESANDO...' : 'CONFIRMAR APUESTA'}
                onPress={handleBet}
                disabled={isSubmitting || !carta1 || !carta2}
              />
              <ActionButton
                label="PASAR"
                onPress={handlePass}
                variant="secondary"
                disabled={isSubmitting}
              />
              {isBetInputFocused ? (
                <ActionButton
                  label="CERRAR TECLADO"
                  onPress={() => {
                    setIsBetInputFocused(false);
                    Keyboard.dismiss();
                  }}
                  variant="ghost"
                  disabled={isSubmitting}
                />
              ) : null}
            </>
          ) : canPlayTurn && isTurnRevealActive ? (
            <Text style={styles.waitingSmall}>Mostrando resultado del turno...</Text>
          ) : (
            <Text style={styles.waitingSmall}>
              {isMyTurn && estadoSala === 'resolviendo'
                ? 'El jugador anterior debe tocar Siguiente para continuar.'
                : `Turno actual: ${activePlayer?.nombre ?? '...'}`}
            </Text>
          )}
        </View>
      </View>
      </TouchableWithoutFeedback>
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
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    gap: AppSpacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topZone: {
    flex: 2,
    backgroundColor: AppColors.secondary,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.md,
    justifyContent: 'center',
    gap: 2,
  },
  middleZone: {
    flex: 4,
    backgroundColor: AppColors.card,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.sm,
    justifyContent: 'center',
    gap: AppSpacing.sm,
  },
  bottomZone: {
    flex: 4,
    backgroundColor: AppColors.card,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.sm,
    gap: AppSpacing.sm,
    justifyContent: 'center',
  },
  brandTitle: {
    color: AppColors.text,
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 40,
  },
  potLabel: {
    color: AppColors.mutedText,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  potValue: {
    color: AppColors.text,
    fontSize: 34,
    fontWeight: '900',
  },
  meta: {
    color: AppColors.mutedText,
    fontSize: 13,
  },
  disconnected: {
    color: AppColors.warning,
    fontSize: 13,
  },
  banner: {
    backgroundColor: 'rgba(233,69,96,0.12)',
    borderRadius: AppRadius.md,
    borderWidth: 1,
    borderColor: AppColors.accent,
    padding: AppSpacing.sm,
    gap: 6,
  },
  bannerText: {
    color: AppColors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  bannerCards: {
    flexDirection: 'row',
    gap: 6,
  },
  miniCard: {
    backgroundColor: AppColors.background,
    borderRadius: AppRadius.sm,
    borderColor: AppColors.border,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 42,
    alignItems: 'center',
  },
  miniValue: {
    color: AppColors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  miniSuit: {
    color: AppColors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  cardRow: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  playingCard: {
    flex: 1,
    backgroundColor: AppColors.background,
    borderRadius: AppRadius.md,
    borderWidth: 1,
    borderColor: AppColors.border,
    minHeight: 120,
    maxHeight: 120,
    padding: AppSpacing.sm,
    justifyContent: 'space-between',
  },
  cardValue: {
    color: AppColors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  cardSuit: {
    color: AppColors.accent,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  waitingCard: {
    backgroundColor: AppColors.background,
    borderRadius: AppRadius.md,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: AppSpacing.md,
  },
  waitingText: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  waitingSmall: {
    color: AppColors.mutedText,
    fontSize: 13,
    textAlign: 'center',
  },
  betRow: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    alignItems: 'center',
  },
  betInput: {
    flex: 1,
    backgroundColor: AppColors.background,
    borderColor: AppColors.border,
    borderRadius: AppRadius.md,
    borderWidth: 1,
    color: AppColors.text,
    fontSize: 16,
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: AppSpacing.sm,
  },
  pozoButtonWrap: {
    width: 120,
  },
  errorText: {
    color: AppColors.accent,
    fontSize: 13,
    textAlign: 'center',
  },
});
