export type FunnelStepDef = {
  key: string;
  event: string;
  label: string;
  meta?: Record<string, string>;
  /** Count events with this outcome; default ok */
  outcome?: 'ok' | 'reject' | 'error';
};

export type FunnelMode =
  | 'quickmatch'
  | 'challenge'
  | 'p2p'
  | 'online'
  | 'nostr';

export const QUICK_MATCH_FUNNEL: FunnelStepDef[] = [
  {
    key: 'menu_free',
    event: 'client.menu.selected',
    meta: { mode: 'free_play' },
    label: 'Menu: Free play',
  },
  {
    key: 'practice_free',
    event: 'client.practice.tab',
    meta: { mode: 'free' },
    label: 'Practice: Quick match tab',
  },
  {
    key: 'qm_configured',
    event: 'client.quickmatch.configured',
    label: 'Configured match',
  },
  {
    key: 'qm_started',
    event: 'client.quickmatch.started',
    label: 'Match started',
  },
  {
    key: 'qm_completed',
    event: 'client.quickmatch.completed',
    label: 'Match completed',
  },
];

export const CHALLENGE_FUNNEL: FunnelStepDef[] = [
  {
    key: 'menu_free',
    event: 'client.menu.selected',
    meta: { mode: 'free_play' },
    label: 'Menu: Free play',
  },
  {
    key: 'practice_challenges',
    event: 'client.practice.tab',
    meta: { mode: 'challenges' },
    label: 'Practice: Challenges tab',
  },
  {
    key: 'catalog_viewed',
    event: 'client.challenge.catalog_viewed',
    label: 'Catalog viewed',
  },
  {
    key: 'card_clicked',
    event: 'client.challenge.card_clicked',
    label: 'Challenge card clicked',
  },
  {
    key: 'eligibility',
    event: 'challenge.eligibility',
    label: 'Eligibility check',
  },
  {
    key: 'run',
    event: 'challenge.run',
    label: 'Run started',
  },
  {
    key: 'completed',
    event: 'client.challenge.completed',
    label: 'Client win overlay',
  },
  {
    key: 'claim',
    event: 'challenge.claim',
    label: 'Bounty claim',
  },
];

export const P2P_FUNNEL: FunnelStepDef[] = [
  {
    key: 'menu_p2p',
    event: 'client.menu.selected',
    meta: { mode: 'p2p' },
    label: 'Menu: P2P',
  },
  {
    key: 'configured',
    event: 'client.p2p.configured',
    label: 'Game configured',
  },
  {
    key: 'deposit_paid',
    event: 'deposit.paid',
    label: 'Deposit paid',
  },
  {
    key: 'game_started',
    event: 'client.p2p.game_started',
    label: 'Game started',
  },
  {
    key: 'game_finished',
    event: 'p2p.game.finished',
    label: 'Game finished (server)',
  },
  {
    key: 'withdrawal',
    event: 'client.p2p.withdrawal_created',
    label: 'Withdrawal created',
  },
];

export const ONLINE_FUNNEL: FunnelStepDef[] = [
  {
    key: 'menu_online',
    event: 'client.menu.selected',
    meta: { mode: 'online' },
    label: 'Menu: ONLINE',
  },
  {
    key: 'room_joined',
    event: 'online.room.joined',
    label: 'Room joined',
  },
  {
    key: 'seat_lightning',
    event: 'online.seat.lightning.requested',
    label: 'Seat payment requested',
  },
  {
    key: 'seat_paid',
    event: 'online.seat.paid',
    label: 'Seat paid',
  },
  {
    key: 'game_started',
    event: 'online.game.started',
    label: 'Game started',
  },
  {
    key: 'game_finished',
    event: 'online.game.finished',
    label: 'Game finished',
  },
  {
    key: 'payout',
    event: 'online.payout.withdrawal',
    label: 'Payout withdrawal',
  },
];

export const NOSTR_SIGNIN_FUNNEL: FunnelStepDef[] = [
  {
    key: 'menu_free',
    event: 'client.menu.selected',
    meta: { mode: 'free_play' },
    label: 'Menu: Free play',
  },
  {
    key: 'practice_challenges',
    event: 'client.practice.tab',
    meta: { mode: 'challenges' },
    label: 'Practice: Challenges tab',
  },
  {
    key: 'nostr_link',
    event: 'nostr.app.link',
    label: 'Nostr app linked',
  },
  {
    key: 'eligibility',
    event: 'challenge.eligibility',
    label: 'Eligibility check',
  },
  {
    key: 'run',
    event: 'challenge.run',
    label: 'Run started',
  },
];

export const FUNNEL_BY_MODE: Record<FunnelMode, FunnelStepDef[]> = {
  quickmatch: QUICK_MATCH_FUNNEL,
  challenge: CHALLENGE_FUNNEL,
  p2p: P2P_FUNNEL,
  online: ONLINE_FUNNEL,
  nostr: NOSTR_SIGNIN_FUNNEL,
};
