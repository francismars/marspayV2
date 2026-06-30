export function SubNav<T extends string>({
  items,
  active,
  onChange,
  breadcrumb,
}: {
  items: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  breadcrumb?: string;
}) {
  return (
    <div className="space-y-2">
      {breadcrumb ? (
        <p className="text-xs font-medium text-zinc-500">{breadcrumb}</p>
      ) : null}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-surface-border bg-surface p-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active === item.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
