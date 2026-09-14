import { cn } from '@/lib/utils';

export function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        ok
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', ok ? 'bg-primary' : 'bg-destructive')} />
      {label}
    </span>
  );
}
