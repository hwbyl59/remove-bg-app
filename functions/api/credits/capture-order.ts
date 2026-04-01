interface Env {
  USAGE_KV: KVNamespace;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_SECRET: string;
  PAYPAL_SANDBOX: string;
}

const PACKAGES = {
  starter:      { credits: 10  },
  standard:     { credits: 50  },
  professional: { credits: 200 },
} as const;

type PackageId = keyof typeof PACKAGES;

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

async function getPayPalAccessToken(
  clientId: string,
  secret: string,
  sandbox: boolean
): Promise<string> {
  const baseUrl = sandbox
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
  const credentials = btoa(`${clientId}:${secret}`);
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status}`);
  }
  const data = await res.json<{ access_token: string }>();
  return data.access_token;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json<{ googleToken?: string; orderId?: string }>();
    const { googleToken, orderId } = body;

    if (!googleToken || !orderId) {
      return new Response(
        JSON.stringify({ error: 'Missing googleToken or orderId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const googleSub = await verifyGoogleToken(googleToken);
    if (!googleSub) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired Google token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency check — prevent double-crediting the same order
    const capturedKey = `paypal_captured:${orderId}`;
    const alreadyCaptured = await env.USAGE_KV.get(capturedKey);
    if (alreadyCaptured) {
      const credits = parseInt(
        (await env.USAGE_KV.get(`credits:${googleSub}`)) ?? '0',
        10
      );
      return new Response(JSON.stringify({ credits }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sandbox = env.PAYPAL_SANDBOX !== 'false';
    const baseUrl = sandbox
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';

    const accessToken = await getPayPalAccessToken(
      env.PAYPAL_CLIENT_ID,
      env.PAYPAL_SECRET,
      sandbox
    );

    // Look up order metadata stored at create time
    const orderMetaRaw = await env.USAGE_KV.get(`paypal_order:${orderId}`);
    if (!orderMetaRaw) {
      return new Response(
        JSON.stringify({ error: 'Order not found or expired' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const orderMeta = JSON.parse(orderMetaRaw) as { googleSub: string; packageId: string };

    // Security check — ensure the token owner matches the order owner
    if (orderMeta.googleSub !== googleSub) {
      console.warn('[capture-order] Sub mismatch', { orderSub: orderMeta.googleSub, googleSub });
      return new Response(JSON.stringify({ error: 'Token mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const packageId = orderMeta.packageId;
    if (!(packageId in PACKAGES)) {
      return new Response(
        JSON.stringify({ error: 'Invalid package in order' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const captureRes = await fetch(
      `${baseUrl}/v2/checkout/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!captureRes.ok) {
      const errBody = await captureRes.text();
      console.error('[capture-order] PayPal error:', errBody);
      return new Response(
        JSON.stringify({ error: 'Failed to capture PayPal order' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const capture = await captureRes.json<{ status: string }>();

    if (capture.status !== 'COMPLETED') {
      return new Response(
        JSON.stringify({ error: `Order not completed: ${capture.status}` }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const pkg = PACKAGES[packageId as PackageId];

    // Add credits
    const creditsKey = `credits:${googleSub}`;
    const current = parseInt(
      (await env.USAGE_KV.get(creditsKey)) ?? '0',
      10
    );
    const newBalance = current + pkg.credits;
    await env.USAGE_KV.put(creditsKey, String(newBalance));

    // Mark order as captured (30-day TTL for idempotency)
    await env.USAGE_KV.put(capturedKey, '1', { expirationTtl: 30 * 86400 });

    return new Response(JSON.stringify({ credits: newBalance }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[capture-order]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
