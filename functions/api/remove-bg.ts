interface Env {
  REMOVE_BG_API_KEY: string;
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

  try {
    const contentType = request.headers.get('Content-Type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      imageFile = formData.get('image') as File | null;
    } else if (contentType.includes('application/json')) {
      const body = await request.json<{ image?: string }>();
      if (!body.image) throw new Error('No image field in JSON body.');
      // Assume base64 data URL
      const base64 = body.image.replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(base64, 'base64');
      imageFile = new File([buf], 'input.jpg', { type: 'image/jpeg' });
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

  // Build multipart/form-data for Remove.bg API
  const form = new FormData();
  form.append('image_file', imageFile, imageFile.name || 'input.jpg');
  form.append('size', 'auto');

  try {
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
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resultBuffer = await response.arrayBuffer();

    return new Response(resultBuffer, {
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
