import { PlayerRole } from './game';
import { OnlineAuthoritativeState, OnlineHudState } from '../game/onlineEngine';

export type OnlineRoomPhase = 'lobby' | 'playing' | 'finished' | 'cancelled';

export interface OnlineRoomNostrMeta {
  note1: string;
  emojis: string;
  min: number;
  mode: string;
}

export interface OnlineSeatState {
  role: PlayerRole.Player1 | PlayerRole.Player2;
  sessionID?: string;
  socketID?: string;
  status: 'open' | 'paid';
  paidAmount?: number;
  paidAt?: number;
  ready?: boolean;
  disconnectedAt?: number;
  name?: string;
  picture?: string;
  pubkey?: string;
  lnAddress?: string;
}

export interface OnlineRoomSnapshot {
  tick: number;
  phase: OnlineRoomPhase;
  state: OnlineAuthoritativeState;
  hud: OnlineHudState;
}

export interface OnlineRoomMember {
  sessionID: string;
  socketID: string;
  joinedAt: number;
  lastSeen: number;
}

export interface OnlineRoom {
  roomId: string;
  roomCode: string;
  hostSessionID: string;
  hostSocketID: string;
  createdAt: number;
  updatedAt: number;
  buyin: number;
  kind1EventId?: string;
  phase: OnlineRoomPhase;
  nostrMeta?: OnlineRoomNostrMeta;
  members: Map<string, OnlineRoomMember>;
  spectators: Set<string>;
  seats: Map<PlayerRole.Player1 | PlayerRole.Player2, OnlineSeatState>;
  inputBySession: Map<string, { up?: boolean; down?: boolean; left?: boolean; right?: boolean }>;
  snapshot: OnlineRoomSnapshot;
  replay: {
    tickMs: number;
    frames: OnlineRoomSnapshot[];
    recordedAt?: number;
  };
  postGame: {
    winnerRole?: PlayerRole.Player1 | PlayerRole.Player2;
    winnerSessionID?: string;
    winnerName: string;
    winnerPicture?: string;
    winnerPoints: number;
    totalPrize: number;
    lnurlw?: string;
    payoutMethod?: 'withdraw_qr' | 'nostr_zap';
    payoutTarget?: string;
    rematchRequested?: boolean;
    rematchRequiredAmount?: number;
    rematchEventId?: string;
    rematchNote1?: string;
    rematchWaitingForSessionID?: string;
    settledAt?: number;
    doubleOrNothingVotes: Set<string>;
  };
}

export interface OnlineRoomListItem {
  roomId: string;
  roomCode: string;
  buyin: number;
  createdAt: number;
  phase: OnlineRoomPhase;
  playersPaid: number;
  seatsTotal: number;
  spectators: number;
  result?: {
    winnerName: string;
    p1Name: string;
    p2Name: string;
    p1Score: number;
    p2Score: number;
    netPrize: number;
  };
  replay?: {
    available: boolean;
    frameCount: number;
    tickMs: number;
    durationMs: number;
  };
}

export interface JoinPinRecord {
  pin: string;
  roomId: string;
  sessionID: string;
  socketID: string;
  expiresAt: number;
  used: boolean;
  usedAt?: number;
}
