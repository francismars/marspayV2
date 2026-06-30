import { useMemo, useState, type ReactNode } from 'react';
import type { TrendValue } from '../lib/api';

type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
  warn?: boolean;
  window?: '24h' | '7d' | 'lifetime' | 'today';
  trend?: TrendValue | null;
};

function TrendBadge({ trend }: { trend: TrendValue }) {
  if (trend.prior < 5 && trend.value < 5) return null;
  const delta = trend.deltaPct;
  if (delta == null) return null;
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span
      className={`text-xs font-medium ${
        flat ? 'text-white/40' : up ? 'text-emerald-400' : 'text-amber-400'
      }`}
    >
      {up ? '▲' : flat ? '—' : '▼'} {Math.abs(delta)}%
    </span>
  );
}

export function KpiCard({ label, value, hint, accent, warn, window, trend }: KpiCardProps) {
  return (
    <div className="glass-panel rounded-lg p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-xs font-medium uppercase tracking-widest text-white/50">
          {label}
        </div>
        {window ? (
          <span className="rounded border border-surface-border px-1.5 py-0.5 text-[10px] uppercase text-white/40">
            {window}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div
          className={`text-2xl font-semibold ${
            warn ? 'text-amber-400' : accent ? 'text-accent' : 'text-white'
          }`}
        >
          {value}
        </div>
        {trend ? <TrendBadge trend={trend} /> : null}
      </div>
      {hint ? <div className="mt-1 text-xs text-white/45">{hint}</div> : null}
    </div>
  );
}

type DataTableColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: Record<string, unknown>) => ReactNode;
};

type DataTableProps = {
  columns: DataTableColumn[];
  rows: Array<Record<string, unknown>>;
  empty?: string;
  rowKey?: (row: Record<string, unknown>, index: number) => string;
  onRowClick?: (row: Record<string, unknown>) => void;
  pageSize?: number;
  filterPlaceholder?: string;
};

function cellSortValue(row: Record<string, unknown>, key: string): string | number {
  const v = row[key];
  if (v == null) return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return String(v);
}

export function DataTable({
  columns,
  rows,
  empty = 'No data',
  rowKey,
  onRowClick,
  pageSize = 50,
  filterPlaceholder = 'Filter rows…',
}: DataTableProps) {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => {
        const raw = col.render ? String(col.render(row) ?? '') : String(row[col.key] ?? '');
        return raw.toLowerCase().includes(q);
      })
    );
  }, [rows, filter, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = cellSortValue(a, sortKey);
      const bv = cellSortValue(b, sortKey);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{empty}</p>;
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setPage(0);
        }}
        placeholder={filterPlaceholder}
        className="w-full max-w-xs rounded border border-surface-border bg-black/40 px-2 py-1.5 text-sm text-white/90 backdrop-blur-sm"
      />
      <div className="glass-panel overflow-x-auto rounded-lg backdrop-blur-sm">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-black/30 text-xs uppercase tracking-wide text-white/50">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 font-medium">
                  {col.sortable !== false ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="hover:text-slate-200"
                    >
                      {col.label}
                      {sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {pageRows.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row, safePage * pageSize + i) : String(safePage * pageSize + i)}
                className={`hover:bg-white/5 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-white/80">
                    {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > pageSize ? (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {sorted.length} rows · page {safePage + 1} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded border border-surface-border px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-surface-border px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-medium uppercase tracking-wide text-white/90">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}

export function LoadingState() {
  return <div className="text-sm text-slate-500">Loading…</div>;
}

export function SnapshotAge({ fetchedAt }: { fetchedAt: string }) {
  const ageSec = Math.max(0, Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000));
  const stale = ageSec > 60;
  return (
    <span className={stale ? 'text-amber-400' : 'text-slate-400'}>
      Updated {ageSec}s ago
      {stale ? ' (stale)' : ''}
    </span>
  );
}

export function ProgressBar({ pct, warnAt = 80 }: { pct: number; warnAt?: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const warn = clamped >= warnAt;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-border">
      <div
        className={`h-full transition-all ${warn ? 'bg-amber-500' : 'bg-accent'}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="glass-panel group rounded-lg backdrop-blur-sm"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-4 py-3 font-display text-lg font-medium uppercase tracking-wide text-white/90 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          {title}
          <span className="text-sm font-normal text-slate-500 group-open:rotate-180">▼</span>
        </span>
      </summary>
      <div className="space-y-4 border-t border-surface-border px-4 py-4">{children}</div>
    </details>
  );
}
