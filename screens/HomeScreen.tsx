import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ActionButton } from '@/components/action-button';
import { ScreenShell } from '@/components/screen-shell';
import { AppColors, AppRadius, AppSpacing } from '@/constants/app-theme';
import { supabase } from '@/lib/supabase';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedPlayerName = playerName.trim();
  const normalizedRoomCode = roomCode.trim().replace(/\D/g, '').slice(0, 6);

  const canCreateRoom = normalizedPlayerName.length >= 2;
  const canJoinRoom = canCreateRoom && normalizedRoomCode.length === 6;

  const isCreateMode = mode === 'create';
  const canSubmit = isCreateMode ? canCreateRoom : canJoinRoom;
  const actionLabel = isCreateMode ? 'Crear partida' : 'Unirme a sala';

  const handleCreateRoom = async () => {
    if (!canCreateRoom) {
      setError('Ingresa un nombre de al menos 2 caracteres.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('crear-sala', {
        body: {
          nombre_jugador: normalizedPlayerName,
          apuesta_inicial: 50,
        },
      });

      if (invokeError) {
        setError(invokeError.message || 'Error al crear partida');
        setIsLoading(false);
        return;
      }

      if (!data || typeof data !== 'object' || !('sala' in data) || !('jugador' in data)) {
        const maybeError =
          typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Error al crear partida';
        setError(maybeError);
        setIsLoading(false);
        return;
      }

      navigation.navigate('Lobby', {
        salaId: data.sala.id as string,
        jugadorId: data.jugador.id as string,
        playerName: normalizedPlayerName,
      });
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.');
      console.error('Error en crear sala:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!canJoinRoom) {
      setError('El código de sala debe tener 6 dígitos.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('unirse-sala', {
        body: {
          nombre_jugador: normalizedPlayerName,
          codigo_sala: normalizedRoomCode,
        },
      });

      if (invokeError) {
        setError(invokeError.message || 'Error al unirse a la sala');
        setIsLoading(false);
        return;
      }

      if (!data || typeof data !== 'object' || !('sala' in data) || !('jugador' in data)) {
        const maybeError =
          typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Error al unirse a la sala';
        setError(maybeError);
        setIsLoading(false);
        return;
      }

      navigation.navigate('Lobby', {
        salaId: data.sala.id as string,
        jugadorId: data.jugador.id as string,
        playerName: normalizedPlayerName,
      });
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.');
      console.error('Error en unirse a sala:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenShell title="" subtitle="">
      <Text style={styles.logo}>CARLONCHO</Text>
      <View style={styles.formCard}>
        <View style={styles.toggleWrap}>
          <View style={[styles.togglePill, isCreateMode ? styles.togglePillActive : null]}>
            <Pressable style={styles.toggleBtn} onPress={() => setMode('create')}>
              <Text style={[styles.toggleText, isCreateMode ? styles.toggleTextActive : null]}>Crear</Text>
            </Pressable>
          </View>
          <View style={[styles.togglePill, !isCreateMode ? styles.togglePillActive : null]}>
            <Pressable style={styles.toggleBtn} onPress={() => setMode('join')}>
              <Text style={[styles.toggleText, !isCreateMode ? styles.toggleTextActive : null]}>Unirme</Text>
            </Pressable>
          </View>
        </View>

        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          editable={!isLoading}
          onChangeText={setPlayerName}
          placeholder="Nombre del jugador"
          placeholderTextColor={AppColors.mutedText}
          selectionColor={AppColors.accent}
          style={styles.input}
          value={playerName}
        />
        {!isCreateMode ? (
          <TextInput
            autoCorrect={false}
            editable={!isLoading}
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={setRoomCode}
            placeholder="Codigo de sala"
            placeholderTextColor={AppColors.mutedText}
            selectionColor={AppColors.accent}
            style={styles.input}
            value={normalizedRoomCode}
          />
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.actions}>
          <ActionButton
            disabled={!canSubmit || isLoading}
            label={isLoading ? 'Cargando...' : actionLabel}
            onPress={isCreateMode ? handleCreateRoom : handleJoinRoom}
          />
        </View>
        {isLoading && <ActivityIndicator color={AppColors.accent} style={styles.loader} />}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  logo: {
    color: AppColors.text,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: AppColors.card,
    borderRadius: AppRadius.lg,
    gap: AppSpacing.md,
    padding: AppSpacing.lg,
  },
  toggleWrap: {
    backgroundColor: AppColors.background,
    borderRadius: AppRadius.pill,
    borderWidth: 1,
    borderColor: AppColors.border,
    flexDirection: 'row',
    gap: AppSpacing.xs,
    padding: 4,
  },
  togglePill: {
    borderRadius: AppRadius.pill,
    flex: 1,
  },
  togglePillActive: {
    backgroundColor: AppColors.accent,
  },
  toggleBtn: {
    alignItems: 'center',
    paddingVertical: AppSpacing.sm,
  },
  toggleText: {
    color: AppColors.mutedText,
    fontSize: 16,
    fontWeight: '700',
  },
  toggleTextActive: {
    color: AppColors.text,
  },
  input: {
    backgroundColor: AppColors.background,
    borderRadius: AppRadius.md,
    borderWidth: 1,
    borderColor: AppColors.border,
    color: AppColors.text,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: AppSpacing.md,
  },
  actions: {
    gap: AppSpacing.sm,
  },
  loader: {
    marginTop: AppSpacing.md,
  },
  errorText: {
    color: AppColors.accent,
    fontSize: 14,
    textAlign: 'center',
  },
});