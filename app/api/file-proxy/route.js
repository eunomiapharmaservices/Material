// app/api/file-proxy/route.js
// Fetches files from Supabase Storage server-side and streams them to the browser.
// This eliminates CORS issues and keeps signed URLs from expiring in the client.
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const CONTENT_TYPES = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:  'application/vnd.ms-powerpoint',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  m4a:  'audio/mp4',
  aac:  'audio/aac',
  mp4:  'video/mp4',
  mov:  'video/quicktime',
  webm: 'video/webm',
  avi:  'video/x-msvideo',
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    // Download file server-side from Supabase (no CORS, uses service role key)
    const { data, error } = await supabase.storage
      .from('materials')
      .download(path);

    if (error || !data) {
      console.error('file-proxy download error:', error);
      return NextResponse.json({ error: error?.message || 'File not found' }, { status: 404 });
    }

    const ext = path.split('.').pop()?.toLowerCase() || '';
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const buf = await data.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buf.byteLength),
        // Allow browser to cache for 1 hour
        'Cache-Control': 'private, max-age=3600',
        // Ensure inline display (not download prompt) for supported types
        'Content-Disposition': 'inline',
      },
    });
  } catch (err) {
    console.error('file-proxy error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
