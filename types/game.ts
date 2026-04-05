export type Suit = 'espada' | 'basto' | 'copa' | 'oro';

export type SpanishCardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type GameStatus = 'waiting' | 'in-progress' | 'finished';

export type TurnResolution = 'pass' | 'win' | 'loss' | 'double-loss';

export type SpanishCard = {
  suit: Suit;
  value: SpanishCardValue;
};

export type PlayerPreview = {
  id: string;
  name: string;
  stack: number;
  isHost?: boolean;
  isReady?: boolean;
};

export type TurnOutcome = {
  resolution: TurnResolution;
  betAmount: number;
  potAfterTurn: number;
  summary: string;
  cards: [SpanishCard, SpanishCard, SpanishCard?];
};