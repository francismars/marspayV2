import type { PlayerIdentity } from '../lib/api';

export function PlayerIdentityCell({ identity }: { identity: PlayerIdentity }) {
  if (identity.kind === 'nostr') {
    const npub = identity.npub ?? identity.pubkeyPrefix ?? 'nostr';
    const shortNpub = npub.length > 20 ? `${npub.slice(0, 12)}…${npub.slice(-6)}` : npub;
    return (
      <div className="flex items-center gap-2">
        {identity.picture ? (
          <img
            src={identity.picture}
            alt=""
            className="h-8 w-8 rounded-full bg-surface-border object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-border text-xs text-slate-500">
            N
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-200">{identity.name ?? shortNpub}</div>
          {identity.npub ? (
            <a
              href={`https://njump.me/${identity.npub}`}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs text-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {shortNpub}
            </a>
          ) : (
            <span className="text-xs text-slate-500">{identity.pubkeyPrefix}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="text-slate-400">
      <span className="text-slate-300">anon</span>
      {identity.pubkeyPrefix ? (
        <span className="ml-1 text-xs text-slate-500">{identity.pubkeyPrefix}</span>
      ) : null}
    </div>
  );
}

export function NpubLink({ npub, label }: { npub?: string; label?: string }) {
  if (!npub) return <span className="text-slate-500">—</span>;
  const short = label ?? (npub.length > 20 ? `${npub.slice(0, 12)}…${npub.slice(-6)}` : npub);
  return (
    <a
      href={`https://njump.me/${npub}`}
      target="_blank"
      rel="noreferrer"
      className="text-accent hover:underline"
    >
      {short}
    </a>
  );
}
