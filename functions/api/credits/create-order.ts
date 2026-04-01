interface Env {
  USAGE_KV: KVNamespace;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_SECRET: string;
  PAYPAL_SANDBOX: string;
}

const PACKAGES = {
  starter:      { name: '尝鲜包', price: '1.99',  credits: 10  },
  standard:     { name: '标准包', price: '5.99',  credits: 50  },
  professional: { name: '专业包', price: '14.99', credits: 200 },
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
    const body = await request.json<{ googleToken?: string; packageId?: string }>();
    const { googleToken, packageId } = body;

    if (!googleToken) {
      return new Response(JSON.stringify({ error: 'Missing googleToken' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const googleSub = await verifyGoogleToken(googleToken);
    if (!googleSub) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired Google token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!packageId || !(packageId in PACKAGES)) {
      return new Response(JSON.stringify({ error: 'Invalid packageId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const pkg = PACKAGES[packageId as PackageId];
    const sandbox = env.PAYPAL_SANDBOX !== 'false';
    const baseUrl = sandbox
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';

    const accessToken = await getPayPalAccessToken(
      env.PAYPAL_CLIENT_ID,
      env.PAYPAL_SECRET,
      sandbox
    );

    const origin = new URL(request.url).origin;
    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: `${googleSub}:${packageId}`,
            amount: {
              currency_code: 'USD',
              value: pkg.price,
            },
            description: `${pkg.name} - ${pkg.credits} image credits`,
          },
        ],
        application_context: {
          return_url: `${origin}/?payment=success`,
          cancel_url: `${origin}/?payment=cancelled`,
          brand_name: 'Background Remover',
          user_action: 'PAY_NOW',
        },
      }),
    });

    if (!orderRes.ok) {
      const errBody = await orderRes.text();
      console.error('[create-order] PayPal error:', errBody);
      return new Response(
        JSON.stringify({ error: 'Failed to create PayPal order' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const order = await orderRes.json<{
      id: string;
      links: Array<{ rel: string; href: string }>;
    }>();

    const approvalLink = order.links.find((l) => l.rel === 'approve');
    if (!approvalLink) {
      return new Response(
        JSON.stringify({ error: 'No approval URL from PayPal' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Store order metadata in KV so capture-order can look it up reliably
    await env.USAGE_KV.put(
      `paypal_order:${order.id}`,
      JSON.stringify({ googleSub, packageId }),
      { expirationTtl: 3600 } // 1 hour — enough time to complete payment
    );

    return new Response(
      JSON.stringify({ orderId: order.id, approvalUrl: approvalLink.href }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[create-order]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
