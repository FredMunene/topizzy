import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { level, message, meta } = body ?? {};

    if (!level || !message) {
      return NextResponse.json({ error: 'Missing level or message' }, { status: 400 });
    }

    const payload = meta ? `${message} ${JSON.stringify(meta)}` : message;
    if (level === 'error') {
      console.error(payload);
    } else {
      console.log(payload);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Log endpoint error:', error);
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 });
  }
}
