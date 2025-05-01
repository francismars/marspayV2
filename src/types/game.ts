export interface GameInfo {
  mode: GameMode;
  players: PlayerInfoFromRole;
  winners?: PlayerRole[];
  numberOfPlayers?: number;
  champion?: string;
}

export type PlayerInfoFromRole = Map<PlayerRole, PlayerInfo>;

export interface PlayerInfo {
  name: string;
  value: number;
  payments?: Payment[];
  picture?: string;
  id?: string;
}

export enum GameMode {
  P2P = 'P2P',
  P2PNOSTR = 'P2PNOSTR',
  PRACTICE = 'PRACTICE',
  TOURNAMENT = 'TOURNAMENT',
}

export enum PlayerRole {
  Player1 = 'Player 1',
  Player2 = 'Player 2',
  Player3 = 'Player 3',
  Player4 = 'Player 4',
  Player5 = 'Player 5',
  Player6 = 'Player 6',
  Player7 = 'Player 7',
  Player8 = 'Player 8',
  Player9 = 'Player 9',
  Player10 = 'Player 10',
  Player11 = 'Player 11',
  Player12 = 'Player 12',
  Player13 = 'Player 13',
  Player14 = 'Player 14',
  Player15 = 'Player 15',
  Player16 = 'Player 16',
}

export interface Payment {
  amount: number;
  note?: string | null;
}
