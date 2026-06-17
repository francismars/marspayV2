import { Socket } from 'socket.io';
import { verifyEvent, nip19, type Event } from 'nostr-tools';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { dateNow } from '../utils/time';
import { getAppNostrSession } from '../state/nostrAppSessionState';
import { evaluateChallengeEligibility } from '../calls/nostr/challengeEligibility';
import { verifyUserLud16 } from '../calls/nostr/verifyUserLud16';
import { ndkInstance, setNDKInstance } from '../calls/NDK/setNDKInstance';
import { zapRecipientKind1Note } from '../calls/NDK/zapRecipientKind1Note';
import { replayChallengeWin } from '../game/challengeEngine/replayRunner';
import {
  checkChallengeRunRateLimit,
  checkChallengeSubmitRateLimit,
} from '../state/challengeRateLimit';
import {
  CHALLENGE_CATALOG,
  createChallengeRun,
  createClaimToken,
  consumeClaimToken,
  getChallengeRun,
  markRunWon,
  hasClaimedChallenge,
  hasClaimedRun,
  getChallengeClaim,
  upsertChallengeClaim,
  getDailyZapBudgetRemaining,
  recordDailyZapSpend,
  getChallengeById,
  isAnonymousRunPubkey,
  type ChallengeInputEntry,
} from '../state/challengeState';

/** @chainduel — used in victory notes (NIP-27 mention). */
const CHAINDUEL_NPUB = 'npub1kd3nlw09ufkgmts2kaf0x8m4mq57exn6l8rz50v5ngyr2h3j5cfswdsdth';
const CHAINDUEL_PUBKEY_HEX = nip19.decode(CHAINDUEL_NPUB).data as string;

function buildVictoryNoteContent(challengeName: string, bountySats: number): string {
  return [
    `I just beat the ${challengeName} challenge on nostr:${CHAINDUEL_NPUB} and got ${bountySats.toLocaleString()} sats ⚡`,
    '',
    'Can you beat it?',
    'https://game.chainduel.net/',
    '',
    'Sign in with Nostr → pick a challenge → beat the bot → collect sats.',
  ].join('\n');
}

function buildVictoryNoteTags(): string[][] {
  return [['p', CHAINDUEL_PUBKEY_HEX, '', 'mention']];
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
  if (!checkChallengeRunRateLimit(sessionID)) {
    socket.emit('resChallengeRun', { ok: false, reason: 'rate_limited' });
    return;
  }
  const appSession = getAppNostrSession(sessionID);
  if (!appSession?.pubkey) {
    socket.emit('resChallengeRun', { ok: false, reason: 'nostr_sign_in_required' });
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
  if (!checkChallengeSubmitRateLimit(sessionID)) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'rate_limited' });
    return;
  }
  const appSession = getAppNostrSession(sessionID);

  const runId = typeof payload?.runId === 'string' ? payload.runId.trim() : '';
  const run = getChallengeRun(runId);
  if (!run) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'run_not_found' });
    return;
  }
  if (run.sessionID !== sessionID) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'session_mismatch' });
    return;
  }
  if (run.status === 'expired') {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'run_expired' });
    return;
  }
  if (run.status !== 'active') {
    socket.emit('resSubmitChallengeWin', {
      ok: false,
      reason: run.status === 'won' ? 'run_already_won' : 'run_not_active',
    });
    return;
  }
  if (hasClaimedRun(runId)) {
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'run_already_claimed' });
    return;
  }
  if (!isAnonymousRunPubkey(run.pubkey)) {
    if (!appSession || run.pubkey !== appSession.pubkey.toLowerCase()) {
      socket.emit('resSubmitChallengeWin', { ok: false, reason: 'pubkey_mismatch' });
      return;
    }
    if (hasClaimedChallenge(run.pubkey, run.challengeId)) {
      socket.emit('resSubmitChallengeWin', { ok: false, reason: 'already_claimed' });
      return;
    }
  } else if (appSession && hasClaimedChallenge(appSession.pubkey, run.challengeId)) {
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
    console.log(
      `${dateNow()} [CHALLENGE_WIN] submit runId=${runId} challenge=${run.challengeId} inputs=0 (default direction only)`
    );
  } else {
    console.log(
      `${dateNow()} [CHALLENGE_WIN] submit runId=${runId} challenge=${run.challengeId} rawInputs=${Array.isArray(rawLog) ? rawLog.length : 0} parsedInputs=${inputLog.length}`
    );
  }

  const replay = replayChallengeWin({
    seed: run.seed,
    challenge: run.config,
    inputLog,
    countdownStartTick:
      typeof payload?.countdownStartTick === 'number' ? payload.countdownStartTick : undefined,
  });

  if (!replay.ok) {
    console.log(
      `${dateNow()} [CHALLENGE_WIN] replay_failed runId=${runId} reason=${replay.reason} debug=${JSON.stringify(replay.debug ?? {})}`
    );
    socket.emit('resSubmitChallengeWin', { ok: false, reason: replay.reason, debug: replay.debug });
    return;
  }

  console.log(
    `${dateNow()} [CHALLENGE_WIN] replay_ok runId=${runId} simSteps=${replay.simSteps} tickCount=${replay.tickCount}`
  );

  markRunWon(runId, inputLog, payload?.countdownStartTick ?? 0);

  const noteContent = buildVictoryNoteContent(run.config.name, run.bountySats);
  const noteTags = buildVictoryNoteTags();
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
  const claimPubkey = appSession.pubkey.toLowerCase();
  if (claimRec.pubkey !== claimPubkey) {
    if (!isAnonymousRunPubkey(claimRec.pubkey)) {
      socket.emit('resChallengeClaim', { ok: false, reason: 'pubkey_mismatch' });
      return;
    }
    const run = getChallengeRun(claimRec.runId);
    if (!run || run.sessionID !== sessionID) {
      socket.emit('resChallengeClaim', { ok: false, reason: 'session_mismatch' });
      return;
    }
  }

  const eligibility = await evaluateChallengeEligibility(appSession.pubkey, true);
  if (!eligibility.eligible) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'not_eligible' });
    return;
  }

  if (hasClaimedChallenge(claimPubkey, claimRec.challengeId)) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'already_claimed' });
    return;
  }
  if (hasClaimedRun(claimRec.runId)) {
    socket.emit('resChallengeClaim', { ok: false, reason: 'run_already_claimed' });
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
    pubkey: claimPubkey,
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
    kind1AuthorPubkey: event.pubkey,
    amountSats: claimRec.bountySats,
    recipientLud16: lud16Check.lud16,
    comment: zapComment,
  });

  if (zapResult.ok) {
    recordDailyZapSpend(claimRec.bountySats);
    upsertChallengeClaim({
      pubkey: claimPubkey,
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
    kind1AuthorPubkey: appSession.pubkey,
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
