import type { StepConversionStep } from '../lib/api';
import { DataTable, Section } from './ui';

export function StepConversionFunnel({
  steps,
  biggestDropIndex,
  onStepClick,
  compact,
}: {
  steps: StepConversionStep[];
  biggestDropIndex: number;
  onStepClick?: (step: StepConversionStep) => void;
  compact?: boolean;
}) {
  if (steps.length === 0) {
    return <p className="text-sm text-white/45">No funnel data yet</p>;
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {steps.map((step, i) => (
          <button
            key={step.key}
            type="button"
            onClick={onStepClick ? () => onStepClick(step) : undefined}
            className={`rounded border px-2 py-1 text-left text-xs ${
              i === biggestDropIndex && biggestDropIndex > 0
                ? 'border-amber-500/60 bg-amber-950/30 text-amber-200'
                : 'border-surface-border bg-black/30 text-white/70 hover:border-accent/40'
            } ${onStepClick ? 'cursor-pointer' : ''}`}
          >
            <div className="font-medium">{step.label}</div>
            <div className="text-white/50">
              {step.count}
              {i > 0 ? ` · ${step.pctOfPrevious}% prev` : ''}
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <Section title="Step conversion">
      <DataTable
        columns={[
          { key: 'label', label: 'Step' },
          { key: 'count', label: 'Count' },
          { key: 'pctOfPrevious', label: '% of prev' },
          { key: 'pctOfFirst', label: '% of first' },
          { key: 'drop', label: 'Drop' },
        ]}
        rows={steps.map((step, i) => ({
          ...step,
          drop: i > 0 && step.dropFromPrevious > 0 ? `${step.dropFromPrevious}%` : '—',
          _highlight: i === biggestDropIndex && biggestDropIndex > 0,
        }))}
        rowKey={(r) => String(r.key)}
        onRowClick={
          onStepClick
            ? (row) => onStepClick(row as unknown as StepConversionStep)
            : undefined
        }
        empty="No steps"
      />
    </Section>
  );
}
