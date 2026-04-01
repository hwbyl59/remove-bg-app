interface Env {
  REMOVE_BG_API_KEY: string;
  USAGE_KV: KVNamespace;
}

const ANON_LIMIT = 1;
const USER_LIMIT = 4;

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

function parseBase64Image(dataUrl: string): File {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new File([bytes], 'input.jpg', { type: 'image/jpeg' });
}

async function proxyToRemoveBg(
  apiKey: string,
  imageFile: File
): Promise<{ ok: false; status: number; error: string } | { ok: true; buffer: ArrayBuffer }> {
  const form = new FormData();
  form.append('image_file', imageFile, imageFile.name || 'input.jpg');
  form.append('size', 'auto');

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: form,
  });

  if (response.status !== 200) {
    let errorMsg = `Remove.bg error: ${response.status}`;
    try {
      const errBody = await response.json<{ errors?: Array<{ title?: string }> }>();
      if (errBody.errors?.[0]?.title) errorMsg = errBody.errors[0].title!;
    } catch (_) {}
    return { ok: false, status: response.status, error: errorMsg };
  }

  return { ok: true, buffer: await response.arrayBuffer() };
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const apiKey = env.REMOVE_BG_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'REMOVE_BG_API_KEY is not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Only POST allowed.' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let imageFile: File | null = null;
  let googleToken: string | null = null;

  try {
    const contentType = request.headers.get('Content-Type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      imageFile = formData.get('image') as File | null;
      googleToken = formData.get('googleToken') as string | null;
    } else if (contentType.includes('application/json')) {
      const body = await request.json<{ image?: string; googleToken?: string }>();
      googleToken = body.googleToken ?? null;
      if (body.image) {
        imageFile = parseBase64Image(body.image);
      }
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to parse request body: ' + (err as Error).message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!imageFile || imageFile.size === 0) {
    return new Response(
      JSON.stringify({ error: 'No image provided or file is empty.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Usage enforcement — only when KV binding is available (production)
  if (env.USAGE_KV) {
    let userId: string | null = null;
    if (googleToken) userId = await verifyGoogleToken(googleToken);

    const isLoggedIn = !!userId;

    // Paid credits path — logged-in users with a positive credit balance skip daily limits
    if (isLoggedIn) {
      const creditsKey = `credits:${userId}`;
      const currentCredits = parseInt((await env.USAGE_KV.get(creditsKey)) ?? '0', 10);

      if (currentCredits > 0) {
        try {
          const result = await proxyToRemoveBg(apiKey, imageFile);
          if (!result.ok) {
            return new Response(
              JSON.stringify({ error: result.error }),
              { status: result.status, headers: { 'Content-Type': 'application/json' } }
            );
          }
          const newCredits = currentCredits - 1;
          await env.USAGE_KV.put(creditsKey, String(newCredits));
          return new Response(result.buffer, {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Content-Disposition': 'inline; filename="no-bg.png"',
              'Cache-Control': 'no-store',
              'X-Credits-Remaining': String(newCredits),
            },
          });
        } catch (err) {
          console.error('[/api/remove-bg] credits path', err);
          return new Response(
            JSON.stringify({ error: 'Internal server error: ' + (err as Error).message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Free daily uses path — logged-in users (no credits left) and anonymous
    const ip =
      request.headers.get('CF-Connecting-IP') ??
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
      'unknown';
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
    const limit = isLoggedIn ? USER_LIMIT : ANON_LIMIT;
    const kvKey = isLoggedIn ? `user:${userId}:${today}` : `anon:${ip}:${today}`;
    const count = parseInt((await env.USAGE_KV.get(kvKey)) ?? '0', 10);

    if (count >= limit) {
      return new Response(
        JSON.stringify({
          error: isLoggedIn
            ? `You've used all ${USER_LIMIT} free uses. Buy credits to continue.`
            : `Sign in with Google for ${USER_LIMIT} more free uses.`,
          requiresLogin: !isLoggedIn,
          requiresCredits: isLoggedIn,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const result = await proxyToRemoveBg(apiKey, imageFile);
      if (!result.ok) {
        return new Response(
          JSON.stringify({ error: result.error }),
          { status: result.status, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const newCount = count + 1;
      await env.USAGE_KV.put(kvKey, String(newCount), {
        expirationTtl: 2 * 86400,
      });
      return new Response(result.buffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': 'inline; filename="no-bg.png"',
          'Cache-Control': 'no-store',
          'X-Uses-Remaining': String(limit - newCount),
        },
      });
    } catch (err) {
      console.error('[/api/remove-bg]', err);
      return new Response(
        JSON.stringify({ error: 'Internal server error: ' + (err as Error).message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Local dev path — no KV available, no enforcement
  try {
    const result = await proxyToRemoveBg(apiKey, imageFile);
    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: result.status, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(result.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'inline; filename="no-bg.png"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/remove-bg]', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error: ' + (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
