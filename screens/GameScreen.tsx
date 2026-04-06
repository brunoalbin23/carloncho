import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { SpanishCard } from '@/components/SpanishCard';
import { AppColors, AppRadius, AppSpacing } from '@/constants/app-theme';
import { playSound } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import type { SpanishCard as SpanishCardModel, SpanishCardValue } from '@/types/game';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

type Jugador = {
  id: string;
  nombre: string;
  balance: number;
  orden: number;
  activo?: boolean;
  ausente?: boolean;
};

type TurnBanner = {
  jugadorNombre: string;
  texto: string;
  cartas: SpanishCardModel[];
};

function parseCard(raw: unknown): SpanishCardModel | null {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const value = (raw as { valor?: number }).valor;
    const suit = (raw as { palo?: SpanishCardModel['suit'] }).palo;
    if (typeof value === 'number' && typeof suit === 'string') {
      return { value: value as SpanishCardValue, suit };
    }
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as { valor?: number; palo?: SpanishCardModel['suit'] };
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
  const TURN_TIMEOUT_SECONDS = 45;

  const [carta1, setCarta1] = useState<SpanishCardModel | null>(null);
  const [carta2, setCarta2] = useState<SpanishCardModel | null>(null);
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [pozo, setPozo] = useState(0);
  const [displayPozo, setDisplayPozo] = useState(0);
  const [estadoSala, setEstadoSala] = useState<'esperando' | 'jugando' | 'resolviendo' | 'terminada'>('jugando');
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
  const [activeTurnStartedAt, setActiveTurnStartedAt] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(TURN_TIMEOUT_SECONDS);
  const [endCelebration, setEndCelebration] = useState<{ winnerName: string; winnerBalance: number } | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const dealtForTurnRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endNavigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPassLockRef = useRef<string | null>(null);
  const displayPozoRef = useRef(0);
  const playersRef = useRef<Jugador[]>([]);
  const turnoActualRef = useRef(-1);
  const estadoSalaRef = useRef<'esperando' | 'jugando' | 'resolviendo' | 'terminada'>('jugando');

  useEffect(() => {
    playersRef.current = jugadores;
  }, [jugadores]);

  useEffect(() => {
    turnoActualRef.current = turnoActual;
  }, [turnoActual]);

  useEffect(() => {
    estadoSalaRef.current = estadoSala;
  }, [estadoSala]);

  const navigateToEndWithCelebration = useCallback(async () => {
    if (endNavigationTimerRef.current) return;

    let winnerName = 'Un jugador';
    let winnerBalance = 0;

    try {
      const { data: winner } = await supabase
        .from('jugadores')
        .select('nombre, balance')
        .eq('sala_id', salaId)
        .order('balance', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (winner?.nombre) {
        winnerName = winner.nombre;
        winnerBalance = Math.max(0, winner.balance ?? 0);
      }
    } catch {
      const localWinner = [...playersRef.current].sort((a, b) => b.balance - a.balance)[0];
      if (localWinner) {
        winnerName = localWinner.nombre;
        winnerBalance = Math.max(0, localWinner.balance);
      }
    }

    setEndCelebration({ winnerName, winnerBalance });
    void playSound('win');
    endNavigationTimerRef.current = setTimeout(() => {
      navigation.replace('End', { salaId, jugadorId, playerName });
    }, 2200);
  }, [jugadorId, navigation, playerName, salaId]);

  useEffect(() => {
    const start = displayPozoRef.current;
    const diff = pozo - start;
    if (diff === 0) {
      setDisplayPozo(pozo);
      return;
    }

    const steps = 14;
    let currentStep = 0;
    const id = setInterval(() => {
      currentStep += 1;
      const next = Math.round(start + (diff * currentStep) / steps);
      displayPozoRef.current = next;
      setDisplayPozo(next);
      if (currentStep >= steps) {
        clearInterval(id);
      }
    }, 22);

    return () => clearInterval(id);
  }, [pozo]);

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
      void playSound('card_deal');
      setActiveTurnStartedAt(Date.now());
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
        const loadPlayers = async (): Promise<Jugador[] | null> => {
          const withAusente = await supabase
            .from('jugadores')
            .select('id, nombre, balance, orden, activo, ausente')
            .eq('sala_id', salaId)
            .order('orden', { ascending: true });

          if (!withAusente.error && withAusente.data) {
            return withAusente.data as Jugador[];
          }

          const missingAusente =
            withAusente.error?.message?.toLowerCase().includes('ausente') ||
            withAusente.error?.details?.toLowerCase().includes('ausente');

          if (!missingAusente) {
            return null;
          }

          const withoutAusente = await supabase
            .from('jugadores')
            .select('id, nombre, balance, orden, activo')
            .eq('sala_id', salaId)
            .order('orden', { ascending: true });

          if (withoutAusente.error || !withoutAusente.data) {
            return null;
          }

          return (withoutAusente.data as Jugador[]).map((p) => ({ ...p, ausente: false }));
        };

        const [{ data: sala }, players] = await Promise.all([
          supabase.from('salas').select('pozo, turno_actual, estado').eq('id', salaId).single(),
          loadPlayers(),
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
        setJugadores(players);
        setPozo(sala.pozo);
        setEstadoSala(sala.estado as 'esperando' | 'jugando' | 'resolviendo' | 'terminada');
        setTurnoActual(sala.turno_actual);

        if (sala.estado === 'jugando' && sala.turno_actual >= 0) {
          setActiveTurnStartedAt(Date.now());
          autoPassLockRef.current = null;
        } else {
          setActiveTurnStartedAt(null);
        }

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
          const nextEstado = updated.estado as 'esperando' | 'jugando' | 'resolviendo' | 'terminada';
          const previousTurn = turnoActualRef.current;
          const previousEstado = estadoSalaRef.current;

          setPozo(updated.pozo);
          setEstadoSala(nextEstado);
          setTurnoActual(updated.turno_actual);

          if (nextEstado === 'jugando' && (previousTurn !== updated.turno_actual || previousEstado !== 'jugando')) {
            setActiveTurnStartedAt(Date.now());
            autoPassLockRef.current = null;
            setEndCelebration(null);
          }

          if (nextEstado === 'resolviendo') {
            setActiveTurnStartedAt(null);
          }

          if (nextEstado === 'terminada') {
            void navigateToEndWithCelebration();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jugadores', filter: `sala_id=eq.${salaId}` },
        (payload) => {
          const updated = payload.new as Jugador;
          setJugadores((prev) => prev.map((j) => (j.id === updated.id ? { ...j, ...updated } : j)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'turnos', filter: `sala_id=eq.${salaId}` },
        (payload) => {
          const row = payload.new as { jugador_id?: string; creado_en?: string };
          if (!row.jugador_id) return;
          const activeNow = playersRef.current.find((p) => p.orden === turnoActualRef.current);
          if (activeNow && activeNow.id !== row.jugador_id) return;
          setActiveTurnStartedAt(Date.now());
          autoPassLockRef.current = null;
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
          let cartas: SpanishCardModel[] = [];

          if (newRow.resultado === 'gano') {
            texto = `gano $${gananciaAbs}`;
            cartas = [c1, c3, c2].filter(Boolean) as SpanishCardModel[];
          } else if (newRow.resultado === 'perdio') {
            texto = `perdio $${gananciaAbs}`;
            cartas = [c1, c3, c2].filter(Boolean) as SpanishCardModel[];
          } else {
            texto = 'paso';
          }

          setBanner({ jugadorNombre: nombre, texto, cartas });

          if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = setTimeout(() => setBanner(null), 5000);

          setActiveTurnStartedAt(null);
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
      if (timeoutIntervalRef.current) {
        clearInterval(timeoutIntervalRef.current);
        timeoutIntervalRef.current = null;
      }
      if (endNavigationTimerRef.current) {
        clearTimeout(endNavigationTimerRef.current);
        endNavigationTimerRef.current = null;
      }
    };
  }, [jugadorId, navigateToEndWithCelebration, navigation, playerName, salaId]);

  useEffect(() => {
    const onStateChange = async (state: string) => {
      try {
        if (state === 'background' || state === 'inactive') {
          await supabase.from('jugadores').update({ ausente: true }).eq('id', jugadorId);
        }

        if (state === 'active') {
          await supabase.from('jugadores').update({ ausente: false }).eq('id', jugadorId);
        }
      } catch {
        // Keep gameplay resilient when ausente column isn't present yet.
      }
    };

    const sub = AppState.addEventListener('change', (nextState) => {
      void onStateChange(nextState);
    });

    return () => {
      sub.remove();
    };
  }, [jugadorId]);

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

  useEffect(() => {
    if (timeoutIntervalRef.current) {
      clearInterval(timeoutIntervalRef.current);
      timeoutIntervalRef.current = null;
    }

    if (!activeTurnStartedAt) {
      setSecondsRemaining(TURN_TIMEOUT_SECONDS);
      autoPassLockRef.current = null;
      return;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - activeTurnStartedAt) / 1000);
      const safeElapsed = Math.max(0, elapsed);
      const next = Math.max(0, Math.min(TURN_TIMEOUT_SECONDS, TURN_TIMEOUT_SECONDS - safeElapsed));
      setSecondsRemaining(next);
    };

    tick();
    timeoutIntervalRef.current = setInterval(tick, 300);

    return () => {
      if (timeoutIntervalRef.current) {
        clearInterval(timeoutIntervalRef.current);
        timeoutIntervalRef.current = null;
      }
    };
  }, [activeTurnStartedAt]);

  const safeSecondsRemaining = useMemo(() => {
    if (!Number.isFinite(secondsRemaining)) return TURN_TIMEOUT_SECONDS;
    return Math.max(0, Math.min(TURN_TIMEOUT_SECONDS, Math.round(secondsRemaining)));
  }, [secondsRemaining]);

  const isMyTurn = myOrden !== -1 && myOrden === turnoActual;
  const canPlayTurn = isMyTurn && estadoSala === 'jugando';

  useEffect(() => {
    if (!canPlayTurn || !turnoId || isSubmitting || safeSecondsRemaining > 0) return;
    if (autoPassLockRef.current === turnoId) return;
    autoPassLockRef.current = turnoId;
    void handlePass();
  }, [canPlayTurn, isSubmitting, safeSecondsRemaining, turnoId]);

  const handlePass = async () => {
    if (!turnoId || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    void playSound('pass');
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
    void playSound('chip');

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
      const carta3: SpanishCardModel = {
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

  const isTurnRevealActive = Boolean(banner);
  const activePlayer = jugadores.find((j) => j.orden === turnoActual);
  const maxBet = pozo;
  const progressPct = Math.max(0, Math.min(1, safeSecondsRemaining / TURN_TIMEOUT_SECONDS));

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
          <Text style={styles.potValue}>${displayPozo}</Text>
        </View>

        <View style={styles.middleZone}>
          {endCelebration ? (
            <View style={styles.endCelebrationCard}>
              <Text style={styles.endCelebrationTitle}>Partida terminada</Text>
              <Text style={styles.endCelebrationText}>{endCelebration.winnerName} gano el pozo</Text>
              <Text style={styles.endCelebrationAmount}>${endCelebration.winnerBalance}</Text>
            </View>
          ) : null}

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
                <Animated.View entering={FadeInDown.delay(40).duration(320).springify()}>
                  <SpanishCard card={carta1} size={0.9} />
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(180).duration(320).springify()}>
                  <SpanishCard card={carta2} size={0.9} />
                </Animated.View>
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

          <View style={styles.timerWrap}>
            <View style={styles.timerTrack}>
              <View style={[styles.timerFill, { width: `${progressPct * 100}%` }]} />
            </View>
            <Text style={[styles.timerText, safeSecondsRemaining <= 10 ? styles.timerDanger : null]}>
              {safeSecondsRemaining}s
            </Text>
          </View>

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
    flex: 11,
    backgroundColor: AppColors.secondary,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.sm,
    justifyContent: 'center',
    gap: 2,
  },
  middleZone: {
    flex: 41,
    backgroundColor: AppColors.card,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.sm,
    justifyContent: 'center',
    gap: AppSpacing.sm,
  },
  bottomZone: {
    flex: 48,
    backgroundColor: AppColors.card,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.sm,
    gap: 8,
    justifyContent: 'center',
  },
  brandTitle: {
    color: AppColors.text,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 32,
  },
  potLabel: {
    color: AppColors.mutedText,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  potValue: {
    color: AppColors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  banner: {
    backgroundColor: 'rgba(233,69,96,0.12)',
    borderRadius: AppRadius.md,
    borderWidth: 1,
    borderColor: AppColors.accent,
    padding: AppSpacing.sm,
    gap: 6,
  },
  endCelebrationCard: {
    backgroundColor: 'rgba(39,174,96,0.16)',
    borderRadius: AppRadius.md,
    borderWidth: 1,
    borderColor: '#27AE60',
    padding: AppSpacing.sm,
    gap: 4,
    alignItems: 'center',
  },
  endCelebrationTitle: {
    color: '#27AE60',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  endCelebrationText: {
    color: AppColors.text,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  endCelebrationAmount: {
    color: '#27AE60',
    fontSize: 26,
    fontWeight: '900',
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
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 12,
    textAlign: 'center',
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: AppColors.background,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  timerFill: {
    height: '100%',
    backgroundColor: AppColors.success,
  },
  timerText: {
    color: AppColors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
  timerDanger: {
    color: '#E74C3C',
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
