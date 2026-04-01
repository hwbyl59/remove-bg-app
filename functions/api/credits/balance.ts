interface Env {
  USAGE_KV: KVNamespace;
}

async function verifyGoogleToken(token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return null;
    const info = await res.json<{ sub?: string; exp?: string }>();
    if (!info.sub || !info.exp) return null;
    if (Date.now() / 1000 > Number(info.exp)) return null;
    return info.sub;
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    const googleToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!googleToken) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const googleSub = await verifyGoogleToken(googleToken);
    if (!googleSub) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired Google token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const credits = parseInt(
      (await env.USAGE_KV.get(`credits:${googleSub}`)) ?? '0',
      10
    );

    return new Response(JSON.stringify({ credits }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[credits/balance]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
