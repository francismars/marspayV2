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
  name?: string;
  picture?: string;
  pubkey?: string;
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
}

export interface OnlineRoomListItem {
  roomId: string;
  roomCode: string;
  buyin: number;
  createdAt: number;
  phase: OnlineRoomPhase;
  playersPaid: number;
  seatsTotal: number;
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
