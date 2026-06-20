/** In-memory challenge win/loss counters for post-launch tuning. */

export type ChallengeOutcome = 'win' | 'replay_failed';

export type ChallengeTelemetrySnapshot = {
  byChallenge: Record<
    string,
    {
      wins: number;
      replayFailed: number;
      replayReasons: Record<string, number>;
    }
  >;
  totalWins: number;
  totalReplayFailed: number;
};

const stats: ChallengeTelemetrySnapshot = {
  byChallenge: {},
  totalWins: 0,
  totalReplayFailed: 0,
};

function ensureChallenge(challengeId: string) {
  if (!stats.byChallenge[challengeId]) {
    stats.byChallenge[challengeId] = {
      wins: 0,
      replayFailed: 0,
      replayReasons: {},
    };
  }
  return stats.byChallenge[challengeId];
}

export function recordChallengeOutcome(params: {
  challengeId: string;
  outcome: ChallengeOutcome;
  replayReason?: string;
}): void {
  const row = ensureChallenge(params.challengeId);
  if (params.outcome === 'win') {
    row.wins += 1;
    stats.totalWins += 1;
    return;
  }
  row.replayFailed += 1;
  stats.totalReplayFailed += 1;
  const reason = params.replayReason ?? 'unknown';
  row.replayReasons[reason] = (row.replayReasons[reason] ?? 0) + 1;
}

export function getChallengeTelemetrySnapshot(): ChallengeTelemetrySnapshot {
  return JSON.parse(JSON.stringify(stats)) as ChallengeTelemetrySnapshot;
}
