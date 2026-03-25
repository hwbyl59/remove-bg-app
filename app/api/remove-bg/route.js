import { NextResponse } from 'next/server';

export async function POST(req) {
  // Check API Key
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server misconfigured: REMOVE_BG_API_KEY not set.' },
      { status: 500 }
    );
  }

  if (apiKey === 'your_api_key_here') {
    return NextResponse.json(
      { error: 'Please configure your Remove.bg API key in .env.local' },
      { status: 500 }
    );
  }

  try {
    // Get image from request (Next.js 14+ App Router)
    const formData = await req.formData();
    const imageFile = formData.get('image');

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Convert to Buffer for fetch
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Call Remove.bg API
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: buffer,
    });

    // Handle Remove.bg errors
    if (response.status !== 200) {
      let errorMsg = `Remove.bg error: ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody.errors?.[0]?.title) {
          errorMsg = errBody.errors[0].title;
        }
      } catch (_) {}
      return NextResponse.json({ error: errorMsg }, { status: response.status });
    }

    // Return processed image
    const resultBuffer = await response.arrayBuffer();

    return new NextResponse(Buffer.from(resultBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'inline; filename="no-bg.png"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/remove-bg]', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
