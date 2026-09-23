import { apiFetch, getApiUrl, type HealthResponse } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';

// Always hit the API on request so the page reflects the live status.
export const dynamic = 'force-dynamic';

type Result = { ok: true; health: HealthResponse } | { ok: false; message: string };

async function loadHealth(): Promise<Result> {
  try {
    const health = await apiFetch<HealthResponse>('/health');
    return { ok: true, health };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export default async function HomePage() {
  const result = await loadHealth();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Local development scaffold. This page reads GET /v1/health from the API.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">API health</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {getApiUrl()}/v1/health
            </p>
          </div>
          <StatusBadge ok={result.ok} label={result.ok ? result.health.status : 'unreachable'} />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          {result.ok ? (
            <>
              <div>
                <dt className="text-muted-foreground">Uptime</dt>
                <dd className="font-mono">{result.health.uptime}s</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Checked at</dt>
                <dd className="font-mono text-xs">{result.health.timestamp}</dd>
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Error</dt>
              <dd className="font-mono text-xs text-destructive">{result.message}</dd>
            </div>
          )}
        </dl>
      </div>
    </main>
  );
}
