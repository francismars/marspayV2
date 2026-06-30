import { useEffect, useState } from 'react';
import type { PlayerIdentity } from '../lib/api';
import { hydrateIdentity } from '../lib/identityHydration';
import {
  displayName,
  initials,
  nip05Url,
  profileUrl,
  technicalId,
} from '../lib/playerDisplay';

export function PlayerIdentityCell({
  identity,
  size = 'md',
  showTechnicalId = false,
}: {
  identity: PlayerIdentity;
  size?: 'sm' | 'md';
  showTechnicalId?: boolean;
}) {
  const [shown, setShown] = useState(identity);

  useEffect(() => {
    setShown(identity);
    let cancelled = false;
    void hydrateIdentity(identity).then((resolved) => {
      if (!cancelled) setShown(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  const avatarSize = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  const nameClass = size === 'sm' ? 'text-xs' : 'text-sm';

  if (shown.kind === 'anon') {
    return <span className={`text-zinc-400 ${nameClass}`}>Anonymous</span>;
  }

  const name = displayName(shown);
  const url = profileUrl(shown);
  const nipUrl = nip05Url(shown);
  const tech = technicalId(shown);

  const avatar =
    shown.picture && shown.picture.startsWith('http') ? (
      <img
        src={shown.picture}
        alt=""
        className={`${avatarSize} shrink-0 rounded-full bg-zinc-800 object-cover`}
      />
    ) : (
      <div
        className={`${avatarSize} flex shrink-0 items-center justify-center rounded-full bg-zinc-800 font-medium text-zinc-400`}
      >
        {initials(shown)}
      </div>
    );

  const nameEl = nipUrl ? (
    <a
      href={nipUrl}
      target="_blank"
      rel="noreferrer"
      className={`truncate font-medium text-zinc-200 hover:text-accent ${nameClass}`}
      onClick={(e) => e.stopPropagation()}
    >
      {name}
    </a>
  ) : (
    <span className={`truncate font-medium text-zinc-200 ${nameClass}`}>{name}</span>
  );

  const content = (
    <>
      {avatar}
      <div className="min-w-0">
        {nameEl}
        {showTechnicalId && tech ? (
          <div className="truncate font-mono text-[10px] text-zinc-500">{tech}</div>
        ) : null}
      </div>
    </>
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 hover:opacity-90"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </a>
    );
  }

  return <div className="flex items-center gap-2">{content}</div>;
}

export function NpubLink({ npub, label }: { npub?: string; label?: string }) {
  if (!npub) return <span className="text-zinc-500">—</span>;
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
