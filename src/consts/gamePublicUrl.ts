/** Public Chain Duel game origin for links in Nostr Kind1 notes (no trailing slash). */
const GAME_PUBLIC_URL_DEFAULT = 'https://game.chainduel.net';

export function gamePublicOrigin(): string {
  const raw = process.env.GAME_PUBLIC_URL?.trim() || GAME_PUBLIC_URL_DEFAULT;
  return raw.replace(/\/+$/, '');
}

export function onlineLobbyPublicUrl(roomId: string): string {
  return `${gamePublicOrigin()}/online/lobby?roomId=${encodeURIComponent(roomId)}`;
}

export function onlineGamePublicUrl(roomId: string): string {
  return `${gamePublicOrigin()}/online/game?roomId=${encodeURIComponent(roomId)}`;
}
