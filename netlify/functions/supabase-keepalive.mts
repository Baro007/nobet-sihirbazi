import type { Config } from '@netlify/functions';

const PING_TIMEOUT_MS = 15_000;
const JSON_HEADERS = { 'content-type': 'application/json' } as const;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

async function parseNextRun(req: Request): Promise<string | undefined> {
  try {
    const payload: unknown = await req.json();
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'next_run' in payload &&
      typeof (payload as { next_run?: unknown }).next_run === 'string'
    ) {
      return (payload as { next_run: string }).next_run;
    }
  } catch {
    // Scheduled invocations may omit or send a non-JSON body during manual checks.
  }
  return undefined;
}

/**
 * Periodically pings the Supabase REST API so the free-tier project remains active.
 */
export default async (req: Request): Promise<Response> => {
  const nextRun = await parseNextRun(req);
  const rawUrl = Netlify.env.get('VITE_SUPABASE_URL')?.trim();
  const supabaseAnonKey = Netlify.env.get('VITE_SUPABASE_ANON_KEY')?.trim();

  if (!rawUrl || !supabaseAnonKey) {
    console.warn('[supabase-keepalive] Missing Supabase env vars; skipping ping.');
    return jsonResponse({ ok: false, skipped: true }, 200);
  }

  const supabaseUrl = rawUrl.replace(/\/+$/, '');
  const endpoint = `${supabaseUrl}/rest/v1/app_month_configs?select=year_month&limit=1`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      let bodySnippet = '';
      try {
        bodySnippet = (await res.text()).slice(0, 200);
      } catch {
        // Ignore body read failures when logging non-OK responses.
      }
      console.error(
        `[supabase-keepalive] Ping failed with HTTP ${res.status}${bodySnippet ? `: ${bodySnippet}` : ''}`,
      );
      return jsonResponse({ ok: false, status: res.status }, 502);
    }

    console.log(
      `[supabase-keepalive] Ping succeeded.${nextRun ? ` Next invocation at: ${nextRun}` : ''}`,
    );
    return jsonResponse({ ok: true, next_run: nextRun ?? null }, 200);
  } catch (error) {
    console.error('[supabase-keepalive] Ping request failed:', error);
    return jsonResponse({ ok: false, error: 'fetch_failed' }, 502);
  } finally {
    clearTimeout(timeoutId);
  }
};

// 06:00 UTC = 09:00 TRT (UTC+3 year-round), every 4 days.
export const config: Config = {
  schedule: '0 6 */4 * *',
};
