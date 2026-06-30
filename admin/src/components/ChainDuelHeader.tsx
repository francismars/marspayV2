export function ChainDuelHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="font-display text-xl uppercase tracking-wide text-white">
        <span>CHAIN</span>
      </div>
      <div className="text-center">
        {subtitle ? (
          <p className="font-body text-xs uppercase tracking-[0.2em] text-white/50">{subtitle}</p>
        ) : null}
      </div>
      <div className="font-display text-xl uppercase tracking-wide text-white">
        <span>OPS</span>
      </div>
    </div>
  );
}
