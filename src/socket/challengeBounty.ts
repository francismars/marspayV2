import { Socket } from 'socket.io';
import { verifyEvent, type Event } from 'nostr-tools';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { dateNow } from '../utils/time';
import { getAppNostrSession } from '../state/nostrAppSessionState';
import { evaluateChallengeEligibility } from '../calls/nostr/challengeEligibility';
import { verifyUserLud16 } from '../calls/nostr/verifyUserLud16';
import { ndkInstance, setNDKInstance } from '../calls/NDK/setNDKInstance';
import { zapRecipientKind1Note } from '../calls/NDK/zapRecipientKind1Note';
import { replayChallengeWin } from '../game/challengeEngine/replayRunner';
import {
  CHALLENGE_CATALOG,
  createChallengeRun,
  createClaimToken,
  consumeClaimToken,
  getChallengeRun,
  markRunWon,
  hasClaimedChallenge,
  getChallengeClaim,
  upsertChallengeClaim,
  getDailyZapBudgetRemaining,
  recordDailyZapSpend,
  getChallengeById,
  type ChallengeInputEntry,
} from '../state/challengeState';

function buildVictoryNoteContent(challengeName: string, bountySats: number): string {
  return `I just beat the ${challengeName} challenge on Chain Duel ⚡\n\n${bountySats.toLocaleString()} sats bounty — challenge accepted and won.\n\nchainduel.xyz\n\n#ChainDuel #Bitcoin #Nostr`;
}

function buildVictoryNoteTags(challengeId: string, runId: string): string[][] {
  return [
    ['t', 'ChainDuel'],
    ['t', 'Bitcoin'],
    ['t', 'Nostr'],
    ['challenge', challengeId],
    ['run', runId],
  ];
}

function tagsEqual(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  const norm = (tags: string[][]) =>
    tags
      .map((t) => t.join('|'))
      .sort()
      .join(';');
  return norm(a) === norm(b);
}

async function publishKind1Event(event: Event): Promise<{ ok: true; eventId: string } | { ok: false; reason: string }> {
  if (!ndkInstance) {
    try {
      await setNDKInstance();
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'ndk_unavailable' };
    }
  }
  try {
    const ndkEvent = new NDKEvent(ndkInstance, event);
    await ndkEvent.publish();
    return { ok: true, eventId: event.id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'publish_failed' };
  }
}

export async function getChallengeEligibilityHandler(socket: Socket) {
  const sessionID = socket.data.sessionID as string | undefined;
  const appSession = sessionID ? getAppNostrSession(sessionID) : undefined;
  const result = await evaluateChallengeEligibility(appSession?.pubkey, Boolean(appSession));
  socket.emit('resChallengeEligibility', result);
}

export async function requestChallengeRunHandler(
  socket: Socket,
  payload: { challengeId?: string }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    socket.emit('resChallengeRun', { ok: false, reason: 'no_session' });
    return;
  }
  const appSession = getAppNostrSession(sessionID);
  if (!appSession) {
    socket.emit('resChallengeRun', { ok: false, reason: 'no_app_session' });
    return;
  }

  const eligibility = await evaluateChallengeEligibility(appSession.pubkey, true);
  if (!eligibility.eligible) {
    socket.emit('resChallengeRun', { ok: false, reason: 'not_eligible', eligibility });
    return;
  }

  const challengeId = typeof payload?.challengeId === 'string' ? payload.challengeId.trim() : '';
  const created = createChallengeRun({
    pubkey: appSession.pubkey,
    sessionID,
    challengeId,
  });
  if ('error' in created) {
    socket.emit('resChallengeRun', { ok: false, reason: created.error });
    return;
  }

  socket.emit('resChallengeRun', {
    ok: true,
    runId: created.runId,
    seed: created.seed,
    bountySats: created.bountySats,
    challengeId: created.challengeId,
    config: created.config,
    expiresAt: created.expiresAt,
  });
}

export async function submitChallengeWinHandler(
  socket: Socket,
  payload: {
    runId?: string;
    inputLog?: unknown;
    countdownStartTick?: number;
  }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'no_session' });
    return;
  }
  const appSession = getAppNostrSession(sessionID);
  if (!appSession) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'no_app_session' });
    return;
  }

  const runId = typeof payload?.runId === 'string' ? payload.runId.trim() : '';
  const run = getChallengeRun(runId);
  if (!run) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'run_not_found' });
    return;
  }
  if (run.pubkey !== appSession.pubkey.toLowerCase()) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'pubkey_mismatch' });
    return;
  }
  if (run.status === 'expired') {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'run_expired' });
    return;
  }
  if (hasClaimedChallenge(run.pubkey, run.challengeId)) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'already_claimed' });
    return;
  }

  const rawLog = payload?.inputLog;
  if (!Array.isArray(rawLog)) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'invalid_input_log' });
    return;
  }

  const inputLog: ChallengeInputEntry[] = [];
  for (const item of rawLog) {
    if (!item || typeof item !== 'object') continue;
    const tick = Number((item as { tick?: unknown }).tick);
    const dir = String((item as { dir?: unknown }).dir ?? '');
    if (!Number.isFinite(tick) || tick < 0) continue;
    if (!dir) continue;
    inputLog.push({ tick: Math.floor(tick), dir });
  }

  if (inputLog.length === 0) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'empty_input_log' });
    return;
  }

  const replay = replayChallengeWin({
    seed: run.seed,
    challenge: run.config,
    inputLog,
    countdownStartTick:
      typeof payload?.countdownStartTick === 'number' ? payload.countdownStartTick : undefined,
  });

  if (!replay.ok) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: replay.reason });
    return;
  }

  markRunWon(runId, inputLog, payload?.countdownStartTick ?? 0);

  const noteContent = buildVictoryNoteContent(run.config.name, run.bountySats);
  const noteTags = buildVictoryNoteTags(run.challengeId, run.runId);
  const claim = createClaimToken({
    run,
    noteContent,
    noteTags,
  });

  socket.emit('resSubmitChallengeWin', {
    ok: true,
    claimToken: claim.token,
    claimExpiresAt: claim.expiresAt,
    noteContent: claim.noteContent,
    noteTags: claim.noteTags,
    bountySats: run.bountySats,
    challengeName: run.config.name,
  });
}

export async function claimChallengeBountyHandler(
  socket: Socket,
  payload: { claimToken?: string; event?: unknown }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'no_session' });
    return;
  }
  const appSession = getAppNostrSession(sessionID);
  if (!appSession) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'no_app_session' });
    return;
  }

  const token = typeof payload?.claimToken === 'string' ? payload.claimToken.trim() : '';
  const claimRec = consumeClaimToken(token);
  if (!claimRec) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'invalid_or_expired_claim_token' });
    return;
  }
  if (claimRec.pubkey !== appSession.pubkey.toLowerCase()) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'pubkey_mismatch' });
    return;
  }

  const eligibility = await evaluateChallengeEligibility(appSession.pubkey, true);
  if (!eligibility.eligible) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'not_eligible' });
    return;
  }

  if (hasClaimedChallenge(claimRec.pubkey, claimRec.challengeId)) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'already_claimed' });
    return;
  }

  const ev = payload?.event;
  if (!ev || typeof ev !== 'object') {
    socket.emit('resChallengeClaim', { ok: false, reason: 'invalid_event' });
    return;
  }
  if (!verifyEvent(ev as Event)) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'invalid_signature' });
    return;
  }
  const event = ev as Event;
  if (event.pubkey.toLowerCase() !== appSession.pubkey) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'event_pubkey_mismatch' });
    return;
  }
  if (event.kind !== 1) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'invalid_kind' });
    return;
  }
  if (event.content !== claimRec.noteContent) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'note_content_mismatch' });
    return;
  }
  if (!tagsEqual(event.tags as string[][], claimRec.noteTags)) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'note_tags_mismatch' });
    return;
  }

  const budget = getDailyZapBudgetRemaining();
  if (claimRec.bountySats > budget) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'daily_budget_exceeded' });
    return;
  }

  const lud16Check = await verifyUserLud16(appSession.pubkey);
  if (!lud16Check.ok || !lud16Check.lud16) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'lud16_invalid' });
    return;
  }

  const published = await publishKind1Event(event);
  if (!published.ok) {
    socket.emit('resChallengeClaim', { ok: false, reason: published.reason });
    return;
  }

  upsertChallengeClaim({
    pubkey: claimRec.pubkey,
    challengeId: claimRec.challengeId,
    runId: claimRec.runId,
    kind1EventId: published.eventId,
    bountySats: claimRec.bountySats,
    publishedAt: Date.now(),
    zapPaidAt: null,
    zapComment: null,
  });

  const zapComment = `Congrats on beating ${getChallengeById(claimRec.challengeId)?.name ?? 'the challenge'}! ⚡`;
  const zapResult = await zapRecipientKind1Note({
    kind1EventId: published.eventId,
    amountSats: claimRec.bountySats,
    recipientLud16: lud16Check.lud16,
    comment: zapComment,
  });

  if (zapResult.ok) {
    recordDailyZapSpend(claimRec.bountySats);
    upsertChallengeClaim({
      pubkey: claimRec.pubkey,
      challengeId: claimRec.challengeId,
      runId: claimRec.runId,
      kind1EventId: published.eventId,
      bountySats: claimRec.bountySats,
      publishedAt: Date.now(),
      zapPaidAt: Date.now(),
      zapComment,
    });
  }

  console.log(
    `${dateNow()} [CHALLENGE_CLAIM] pubkey=${claimRec.pubkey.slice(0, 12)} challenge=${claimRec.challengeId} event=${published.eventId} zap=${zapResult.ok ? 'ok' : zapResult.reason}`
  );

  socket.emit('resChallengeClaim', {
    ok: true,
    eventId: published.eventId,
    bountySats: claimRec.bountySats,
    zapPaid: zapResult.ok,
    zapReason: zapResult.ok ? undefined : zapResult.reason,
    zapComment,
  });
}

export async function retryChallengeZapHandler(
  socket: Socket,
  payload: { challengeId?: string }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) return;
  const appSession = getAppNostrSession(sessionID);
  if (!appSession) {
    socket.emit('resRetryChallengeZap', { ok: false, reason: 'no_app_session' });
    return;
  }

  const challengeId = typeof payload?.challengeId === 'string' ? payload.challengeId.trim() : '';
  const existing = getChallengeClaim(appSession.pubkey, challengeId);
  if (!existing?.kind1EventId || existing.zapPaidAt) {
    socket.emit('resRetryChallengeZap', { ok: false, reason: 'nothing_to_retry' });
    return;
  }

  const lud16Check = await verifyUserLud16(appSession.pubkey);
  if (!lud16Check.ok || !lud16Check.lud16) {
    socket.emit('resRetryChallengeZap', { ok: false, reason: 'lud16_invalid' });
    return;
  }

  const zapComment =
    existing.zapComment ??
    `Congrats on beating ${getChallengeById(challengeId)?.name ?? 'the challenge'}! ⚡`;
  const zapResult = await zapRecipientKind1Note({
    kind1EventId: existing.kind1EventId,
    amountSats: existing.bountySats,
    recipientLud16: lud16Check.lud16,
    comment: zapComment,
  });

  if (zapResult.ok) {
    recordDailyZapSpend(existing.bountySats);
    upsertChallengeClaim({
      ...existing,
      zapPaidAt: Date.now(),
      zapComment,
    });
  }

  socket.emit('resRetryChallengeZap', {
    ok: zapResult.ok,
    reason: zapResult.ok ? undefined : zapResult.reason,
  });
}

export function getChallengeCatalogHandler(socket: Socket) {
  socket.emit('resChallengeCatalog', { ok: true, challenges: CHALLENGE_CATALOG });
}
