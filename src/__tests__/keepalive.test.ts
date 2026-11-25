import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { config } from '../../netlify/functions/supabase-keepalive.mts';

function stubNetlifyEnv(values: Record<string, string | undefined>): void {
  vi.stubGlobal('Netlify', {
    env: {
      get: (key: string) => values[key],
    },
  });
}

describe('supabase-keepalive scheduled function', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses a 4-day cron schedule aligned with 09:00 TRT (06:00 UTC)', () => {
    expect(config.schedule).toBe('0 6 */4 * *');
  });

  it('sends an authenticated GET ping to Supabase and returns next_run', async () => {
    stubNetlifyEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co/',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    });

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([{ year_month: '2026-12' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('https://nobet.netlify.app/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ next_run: '2026-11-28T06:00:00Z' }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      next_run: '2026-11-28T06:00:00Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(
      'https://example.supabase.co/rest/v1/app_month_configs?select=year_month&limit=1',
    );
    expect(calledInit?.method).toBe('GET');
    expect(calledInit?.headers).toEqual({
      apikey: 'test-anon-key',
      Authorization: 'Bearer test-anon-key',
    });
  });

  it('skips cleanly without calling fetch when env vars are missing', async () => {
    stubNetlifyEnv({
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_ANON_KEY: undefined,
    });

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = new Request('https://nobet.netlify.app/', { method: 'POST' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when Supabase responds with an HTTP error', async () => {
    stubNetlifyEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = new Request('https://nobet.netlify.app/', { method: 'POST' });
    const res = await handler(req);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, status: 500 });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
