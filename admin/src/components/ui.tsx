import type { ReactNode } from 'react';

type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
};

export function KpiCard({ label, value, hint, accent }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? 'text-accent' : 'text-slate-100'}`}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

type DataTableProps = {
  columns: Array<{ key: string; label: string; render?: (row: Record<string, unknown>) => ReactNode }>;
  rows: Array<Record<string, unknown>>;
  empty?: string;
};

export function DataTable({ columns, rows, empty = 'No data' }: DataTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-surface-raised text-xs uppercase text-slate-400">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-raised/50">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2 text-slate-300">
                  {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-200">{title}</h2>
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
