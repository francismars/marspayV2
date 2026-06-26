import { Socket } from 'socket.io';
import { verifyEvent, nip19, type Event } from 'nostr-tools';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { dateNow } from '../utils/time';
import { getCachedNostrProfile } from '../calls/nostr/nostrProfileCache';
import { evaluateChallengeEligibility } from '../calls/nostr/challengeEligibility';
import {
  getAppNostrSession,
  syncAppNostrSessionProfile,
} from '../state/nostrAppSessionState';
import { emitAppNostrSession } from './nostrAppSession';
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
  getUnusedClaimTokenForRun,
  isAnonymousRunPubkey,
  type ChallengeInputEntry,
} from '../state/challengeState';
import {
  getChallengeTelemetrySnapshot,
  recordChallengeOutcome,
} from '../state/challengeTelemetry';
import {
  pubkeyPrefix,
  trackEligibility,
  trackEvent,
  trackReject,
} from '../telemetry/trackEvent';

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

export async function getChallengeEligibilityHandler(
  socket: Socket,
  payload?: { refresh?: boolean }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  const appSession = sessionID ? getAppNostrSession(sessionID) : undefined;
  const forceRefresh = payload?.refresh === true;
  const result = await evaluateChallengeEligibility(appSession?.pubkey, Boolean(appSession), {
    forceRefresh,
  });
  if (forceRefresh && sessionID && appSession?.pubkey) {
    const freshProfile = getCachedNostrProfile(appSession.pubkey);
    if (freshProfile && syncAppNostrSessionProfile(sessionID, freshProfile)) {
      emitAppNostrSession(socket);
    }
  }
  trackEligibility(sessionID, result, { refresh: forceRefresh });
  socket.emit('resChallengeEligibility', result);
}

export async function requestChallengeRunHandler(
  socket: Socket,
  payload: { challengeId?: string }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  const challengeIdInput =
    typeof payload?.challengeId === 'string' ? payload.challengeId.trim() : '';
  if (!sessionID) {
    trackReject('challenge.run', 'no_session', { challengeId: challengeIdInput || undefined });
    socket.emit('resChallengeRun', { ok: false, reason: 'no_session' });
    return;
  }

  const appSession = getAppNostrSession(sessionID);
  if (!appSession?.pubkey) {
    trackReject('challenge.run', 'nostr_sign_in_required', { sessionID, challengeId: challengeIdInput || undefined });
    socket.emit('resChallengeRun', { ok: false, reason: 'nostr_sign_in_required' });
    return;
  }

  const challengeId = challengeIdInput;
  if (!getChallengeById(challengeId)) {
    trackReject('challenge.run', 'unknown_challenge', {
      sessionID,
      challengeId: challengeId || undefined,
      pubkeyPrefix: pubkeyPrefix(appSession.pubkey),
    });
    socket.emit('resChallengeRun', { ok: false, reason: 'unknown_challenge' });
    return;
  }

  if (hasClaimedChallenge(appSession.pubkey, challengeId)) {
    trackReject('challenge.run', 'already_claimed', {
      sessionID,
      challengeId,
      pubkeyPrefix: pubkeyPrefix(appSession.pubkey),
    });
    socket.emit('resChallengeRun', { ok: false, reason: 'already_claimed' });
    return;
  }

  if (!checkChallengeRunRateLimit(sessionID)) {
    trackReject('challenge.run', 'rate_limited', { sessionID, challengeId: challengeIdInput || undefined });
    socket.emit('resChallengeRun', { ok: false, reason: 'rate_limited' });
    return;
  }

  const eligibility = await evaluateChallengeEligibility(appSession.pubkey, true);
  if (!eligibility.eligible) {
    trackReject('challenge.run', 'not_eligible', {
      sessionID,
      challengeId: challengeId || undefined,
      pubkeyPrefix: pubkeyPrefix(appSession.pubkey),
    });
    socket.emit('resChallengeRun', { ok: false, reason: 'not_eligible' });
    return;
  }

  const created = createChallengeRun({
    pubkey: appSession.pubkey,
    sessionID,
    challengeId,
  });
  if ('error' in created) {
    trackReject('challenge.run', created.error, {
      sessionID,
      challengeId: challengeId || undefined,
      pubkeyPrefix: pubkeyPrefix(appSession.pubkey),
    });
    socket.emit('resChallengeRun', { ok: false, reason: created.error });
    return;
  }

  trackEvent({
    event: 'challenge.run',
    outcome: 'ok',
    sessionID,
    challengeId: created.challengeId,
    runId: created.runId,
    pubkeyPrefix: pubkeyPrefix(appSession.pubkey),
    amountSats: created.bountySats,
  });

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

function emitSubmitChallengeWinOk(
  socket: Socket,
  params: {
    claimToken: string;
    claimExpiresAt: number;
    noteContent: string;
    noteTags: string[][];
    bountySats: number;
    challengeName: string;
  }
) {
  socket.emit('resSubmitChallengeWin', { ok: true, ...params });
}

function emitExistingClaimToken(
  socket: Socket,
  run: NonNullable<ReturnType<typeof getChallengeRun>>
): boolean {
  const existing = getUnusedClaimTokenForRun(run.runId);
  if (!existing || hasClaimedRun(run.runId)) return false;
  emitSubmitChallengeWinOk(socket, {
    claimToken: existing.token,
    claimExpiresAt: existing.expiresAt,
    noteContent: existing.noteContent,
    noteTags: existing.noteTags,
    bountySats: existing.bountySats,
    challengeName: run.config.name,
  });
  trackEvent({
    event: 'challenge.win.token',
    outcome: 'ok',
    sessionID: run.sessionID,
    runId: run.runId,
    challengeId: run.challengeId,
    meta: { reused: true },
  });
  return true;
}

export async function submitChallengeWinHandler(
  socket: Socket,
  payload: {
    runId?: string;
    inputLog?: unknown;
    countdownStartTick?: number;
  }
) {
  const runId = typeof payload?.runId === 'string' ? payload.runId.trim() : '';
  const sessionID = socket.data.sessionID as string | undefined;
  const rejectWin = (reason: string, challengeId?: string) => {
    trackReject('challenge.win.submit', reason, { sessionID, runId, challengeId });
    socket.emit('resSubmitChallengeWin', { ok: false, reason });
  };
  try {
  if (!sessionID) {
    rejectWin('no_session');
    return;
  }
  if (!checkChallengeSubmitRateLimit(sessionID)) {
    trackReject('challenge.win.submit', 'rate_limited', { sessionID, runId });
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'rate_limited' });
    return;
  }
  const appSession = getAppNostrSession(sessionID);

  const run = getChallengeRun(runId);
  if (!run) {
    rejectWin('run_not_found');
    return;
  }
  if (run.sessionID !== sessionID) {
    rejectWin('session_mismatch', run.challengeId);
    return;
  }
  if (run.status === 'expired') {
    rejectWin('run_expired', run.challengeId);
    return;
  }
  if (run.status === 'won') {
    if (emitExistingClaimToken(socket, run)) return;
    rejectWin('run_already_won', run.challengeId);
    return;
  }
  if (run.status !== 'active') {
    rejectWin('run_not_active', run.challengeId);
    return;
  }
  if (hasClaimedRun(runId)) {
    rejectWin('run_already_claimed', run.challengeId);
    return;
  }
  if (!isAnonymousRunPubkey(run.pubkey)) {
    if (!appSession || run.pubkey !== appSession.pubkey.toLowerCase()) {
      rejectWin('pubkey_mismatch', run.challengeId);
      return;
    }
    if (hasClaimedChallenge(run.pubkey, run.challengeId)) {
      rejectWin('already_claimed', run.challengeId);
      return;
    }
  } else if (appSession && hasClaimedChallenge(appSession.pubkey, run.challengeId)) {
    rejectWin('already_claimed', run.challengeId);
    return;
  }

  trackEvent({
    event: 'challenge.win.submit',
    outcome: 'ok',
    sessionID,
    runId,
    challengeId: run.challengeId,
    pubkeyPrefix: pubkeyPrefix(appSession?.pubkey),
  });

  const rawLog = payload?.inputLog;
  if (!Array.isArray(rawLog)) {
    trackReject('challenge.win.submit', 'invalid_input_log', {
      sessionID,
      runId,
      challengeId: run.challengeId,
    });
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

  const replayStartedAt = Date.now();
  const replay = replayChallengeWin({
    seed: run.seed,
    challenge: run.config,
    inputLog,
    countdownStartTick:
      typeof payload?.countdownStartTick === 'number' ? payload.countdownStartTick : undefined,
  });
  const replayMs = Date.now() - replayStartedAt;

  if (!replay.ok) {
    recordChallengeOutcome({
      challengeId: run.challengeId,
      outcome: 'replay_failed',
      replayReason: replay.reason,
    });
    console.log(
      `${dateNow()} [CHALLENGE_WIN] replay_failed runId=${runId} challenge=${run.challengeId} replayMs=${replayMs} reason=${replay.reason} debug=${JSON.stringify(replay.debug ?? {})} telemetry=${JSON.stringify(getChallengeTelemetrySnapshot().byChallenge[run.challengeId] ?? {})}`
    );
    trackEvent({
      event: 'challenge.win.replay',
      outcome: 'reject',
      reason: replay.reason,
      sessionID,
      runId,
      challengeId: run.challengeId,
      replayMs,
    });
    socket.emit('resSubmitChallengeWin', { ok: false, reason: replay.reason, debug: replay.debug });
    return;
  }

  recordChallengeOutcome({ challengeId: run.challengeId, outcome: 'win' });
  console.log(
    `${dateNow()} [CHALLENGE_WIN] replay_ok runId=${runId} challenge=${run.challengeId} replayMs=${replayMs} simSteps=${replay.simSteps} tickCount=${replay.tickCount} telemetry=${JSON.stringify(getChallengeTelemetrySnapshot().byChallenge[run.challengeId] ?? {})}`
  );
  trackEvent({
    event: 'challenge.win.replay',
    outcome: 'ok',
    sessionID,
    runId,
    challengeId: run.challengeId,
    replayMs,
    meta: { simSteps: replay.simSteps, tickCount: replay.tickCount },
  });

  markRunWon(runId, inputLog, payload?.countdownStartTick ?? 0);

  const noteContent = buildVictoryNoteContent(run.config.name, run.bountySats);
  const noteTags = buildVictoryNoteTags();
  const claim = createClaimToken({
    run,
    noteContent,
    noteTags,
  });

  emitSubmitChallengeWinOk(socket, {
    claimToken: claim.token,
    claimExpiresAt: claim.expiresAt,
    noteContent: claim.noteContent,
    noteTags: claim.noteTags,
    bountySats: run.bountySats,
    challengeName: run.config.name,
  });
  trackEvent({
    event: 'challenge.win.token',
    outcome: 'ok',
    sessionID,
    runId,
    challengeId: run.challengeId,
  });
  } catch (error) {
    console.error(
      `${dateNow()} [CHALLENGE_WIN] handler_error runId=${runId}`,
      error
    );
    trackEvent({
      event: 'challenge.win.submit',
      outcome: 'error',
      reason: 'server_error',
      runId,
    });
    socket.emit('resSubmitChallengeWin', { ok: false, reason: 'server_error' });
  }
}

export async function claimChallengeBountyHandler(
  socket: Socket,
  payload: { claimToken?: string; event?: unknown }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  const rejectClaim = (reason: string, ctx: { challengeId?: string; runId?: string } = {}) => {
    trackReject('challenge.claim', reason, { sessionID, ...ctx });
    socket.emit('resChallengeClaim', { ok: false, reason });
  };
  if (!sessionID) {
    rejectClaim('no_session');
    return;
  }
  const appSession = getAppNostrSession(sessionID);
  if (!appSession) {
    rejectClaim('no_app_session');
    return;
  }

  const token = typeof payload?.claimToken === 'string' ? payload.claimToken.trim() : '';
  const claimRec = consumeClaimToken(token);
  if (!claimRec) {
    rejectClaim('invalid_or_expired_claim_token');
    return;
  }
  const claimPubkey = appSession.pubkey.toLowerCase();
  if (claimRec.pubkey !== claimPubkey) {
    if (!isAnonymousRunPubkey(claimRec.pubkey)) {
      rejectClaim('pubkey_mismatch', { challengeId: claimRec.challengeId, runId: claimRec.runId });
      return;
    }
    const run = getChallengeRun(claimRec.runId);
    if (!run || run.sessionID !== sessionID) {
      rejectClaim('session_mismatch', { challengeId: claimRec.challengeId, runId: claimRec.runId });
      return;
    }
  }

  const eligibility = await evaluateChallengeEligibility(appSession.pubkey, true);
  if (!eligibility.eligible) {
    rejectClaim('not_eligible', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }

  if (hasClaimedChallenge(claimPubkey, claimRec.challengeId)) {
    rejectClaim('already_claimed', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }
  if (hasClaimedRun(claimRec.runId)) {
    rejectClaim('run_already_claimed', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }

  const ev = payload?.event;
  if (!ev || typeof ev !== 'object') {
    rejectClaim('invalid_event', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }
  if (!verifyEvent(ev as Event)) {
    rejectClaim('invalid_signature', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }
  const event = ev as Event;
  if (event.pubkey.toLowerCase() !== appSession.pubkey) {
    rejectClaim('event_pubkey_mismatch', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }
  if (event.kind !== 1) {
    rejectClaim('invalid_kind', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }
  if (event.content !== claimRec.noteContent) {
    rejectClaim('note_content_mismatch', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }
  if (!tagsEqual(event.tags as string[][], claimRec.noteTags)) {
    rejectClaim('note_tags_mismatch', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }

  const budget = getDailyZapBudgetRemaining();
  if (claimRec.bountySats > budget) {
    rejectClaim('daily_budget_exceeded', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }

  const lud16Check = await verifyUserLud16(appSession.pubkey);
  if (!lud16Check.ok || !lud16Check.lud16) {
    rejectClaim('lud16_invalid', { challengeId: claimRec.challengeId, runId: claimRec.runId });
    return;
  }

  const published = await publishKind1Event(event);
  if (!published.ok) {
    rejectClaim(published.reason, { challengeId: claimRec.challengeId, runId: claimRec.runId });
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

  trackEvent({
    event: 'challenge.claim',
    outcome: 'ok',
    sessionID,
    challengeId: claimRec.challengeId,
    runId: claimRec.runId,
    pubkeyPrefix: pubkeyPrefix(claimPubkey),
    amountSats: claimRec.bountySats,
    meta: { zapPaid: zapResult.ok, zapReason: zapResult.ok ? '' : zapResult.reason },
  });

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
  const challengeId = typeof payload?.challengeId === 'string' ? payload.challengeId.trim() : '';
  if (!sessionID) {
    return;
  }
  const appSession = getAppNostrSession(sessionID);
  if (!appSession) {
    trackReject('challenge.zap.retry', 'no_app_session', { sessionID, challengeId });
    socket.emit('resRetryChallengeZap', { ok: false, reason: 'no_app_session' });
    return;
  }

  const existing = getChallengeClaim(appSession.pubkey, challengeId);
  if (!existing?.kind1EventId || existing.zapPaidAt) {
    trackReject('challenge.zap.retry', 'nothing_to_retry', {
      sessionID,
      challengeId,
      pubkeyPrefix: pubkeyPrefix(appSession.pubkey),
    });
    socket.emit('resRetryChallengeZap', { ok: false, reason: 'nothing_to_retry' });
    return;
  }

  const lud16Check = await verifyUserLud16(appSession.pubkey);
  if (!lud16Check.ok || !lud16Check.lud16) {
    trackReject('challenge.zap.retry', 'lud16_invalid', {
      sessionID,
      challengeId,
      pubkeyPrefix: pubkeyPrefix(appSession.pubkey),
    });
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

  trackEvent({
    event: 'challenge.zap.retry',
    outcome: zapResult.ok ? 'ok' : 'reject',
    reason: zapResult.ok ? undefined : zapResult.reason,
    sessionID,
    challengeId,
    pubkeyPrefix: pubkeyPrefix(appSession.pubkey),
    amountSats: existing.bountySats,
  });

  socket.emit('resRetryChallengeZap', {
    ok: zapResult.ok,
    reason: zapResult.ok ? undefined : zapResult.reason,
  });
}

export function getChallengeCatalogHandler(socket: Socket) {
  socket.emit('resChallengeCatalog', { ok: true, challenges: CHALLENGE_CATALOG });
}
