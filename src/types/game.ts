export interface PlayerInfo {
  name: string;
  value: number;
}

export enum PlayerRole {
  Player1 = 'Player 1',
  Player2 = 'Player 2',
}

export enum GameMode {
  P2P = 'P2P',
}

export type PlayerInfoFromRole = Map<PlayerRole, PlayerInfo>;

export interface GameInfo {
  players: PlayerInfoFromRole;
  gamemode: GameMode;
  winners?: PlayerRole[];
}
