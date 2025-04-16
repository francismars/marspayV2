export interface GameInfo {
  gamemode: GameMode;
  players: PlayerInfoFromRole;
  winners?: PlayerRole[];
}

export type PlayerInfoFromRole = Map<PlayerRole, PlayerInfo>;

export interface PlayerInfo {
  name: string;
  value: number;
  payments?: Payment[];
}

export enum GameMode {
  P2P = 'P2P',
}

export enum PlayerRole {
  Player1 = 'Player 1',
  Player2 = 'Player 2',
}

export interface Payment {
  amount: number;
  note: string | null;
}
