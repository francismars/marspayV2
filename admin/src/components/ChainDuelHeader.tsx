export function ChainDuelHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div>
      <h1 className="font-display text-lg font-medium tracking-wide text-zinc-100">
        Chain Duel
      </h1>
      {subtitle ? (
        <p className="text-xs text-zinc-500">{subtitle}</p>
      ) : null}
    </div>
  );
}
