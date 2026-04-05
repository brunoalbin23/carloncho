import type { TurnOutcome } from '@/types/game';

export type RootStackParamList = {
  Home: undefined;
  Lobby: {
    salaId: string;
    jugadorId: string;
    playerName: string;
  };
  Game: {
    salaId: string;
    jugadorId: string;
    playerName: string;
  };
  Result: {
    playerName: string;
    salaId: string;
    jugadorId: string;
    finPartida: boolean;
    outcome: TurnOutcome;
  };
  End: {
    salaId: string;
    jugadorId?: string;
    playerName?: string;
  };
};