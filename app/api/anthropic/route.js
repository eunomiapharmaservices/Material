// app/api/anthropic/route.js
// Proxies Anthropic API calls so the API key stays server-side only.
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const { prompt } = await request.json();

    const message = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 700,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return NextResponse.json({ text });
  } catch (err) {
    console.error('POST /api/anthropic', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
