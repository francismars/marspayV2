import type {
  ChallengesData,
  ModeFunnelData,
  OnlineData,
  P2pData,
  QuickMatchData,
  ReplayData,
} from '../lib/api';
import { ChallengeTab } from './ChallengeTab';
import { OnlineTab } from './OnlineTab';
import { P2pTab } from './P2pTab';
import { QuickMatchTab } from './QuickMatchTab';
import { StepConversionFunnel } from './StepConversionFunnel';
import { DataTable, Section } from './ui';

export type ModeId = 'quickmatch' | 'challenge' | 'p2p' | 'online' | 'nostr';

const MODE_LABELS: Record<ModeId, string> = {
  quickmatch: 'Quick Match',
  challenge: 'Challenges',
  p2p: 'P2P',
  online: 'ONLINE',
  nostr: 'Nostr sign-in',
};

export function ModesTab({
  mode,
  onModeChange,
  funnel,
  quickmatch,
  challenges,
  p2p,
  online,
  replays,
  onStepClick,
  onSeatClick,
}: {
  mode: ModeId;
  onModeChange: (m: ModeId) => void;
  funnel: ModeFunnelData | null;
  quickmatch?: QuickMatchData;
  challenges?: ChallengesData;
  p2p?: P2pData;
  online?: OnlineData;
  replays?: ReplayData;
  onStepClick?: (event: string) => void;
  onSeatClick?: (sessionID: string) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MODE_LABELS) as ModeId[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              mode === m ? 'nav-pill-active border-accent/40' : 'border-surface-border text-white/50'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {funnel ? (
        <>
          <StepConversionFunnel
            steps={funnel.steps}
            biggestDropIndex={funnel.biggestDropIndex}
            onStepClick={
              onStepClick
                ? (step) => onStepClick(step.event)
                : undefined
            }
          />
          {funnel.derived?.paymentAbandoned ? (
            <Section title="Payment abandon (derived)">
              <p className="text-sm text-white/70">
                {funnel.derived.paymentAbandoned.abandoned} /{' '}
                {funnel.derived.paymentAbandoned.requested} seat requests without pay within 15m (
                {funnel.derived.paymentAbandoned.abandonRate}%)
              </p>
            </Section>
          ) : null}
          {Object.entries(funnel.rejectReasons ?? {}).map(([ev, rows]) => (
            <Section key={ev} title={`Rejections: ${ev}`}>
              <DataTable
                columns={[
                  { key: 'reason', label: 'Reason' },
                  { key: 'count', label: 'Count' },
                ]}
                rows={rows as unknown as Array<Record<string, unknown>>}
                rowKey={(r) => String(r.reason)}
                empty="None"
              />
            </Section>
          ))}
        </>
      ) : null}

      {mode === 'quickmatch' && quickmatch ? <QuickMatchTab data={quickmatch} /> : null}
      {mode === 'challenge' && challenges ? (
        <ChallengeTab data={challenges} hideBrowseFunnel />
      ) : null}
      {mode === 'p2p' && p2p ? <P2pTab data={p2p} /> : null}
      {mode === 'online' && online ? (
        <OnlineTab data={online} replays={replays} onSeatClick={onSeatClick} />
      ) : null}
      {mode === 'nostr' ? (
        <p className="text-sm text-white/50">
          Nostr sign-in funnel tracks app link → eligibility → run. See rejections above.
        </p>
      ) : null}
    </div>
  );
}
