// app/api/file-proxy/route.js
// Fetches files from Supabase server-side and re-serves them with
// Content-Disposition: inline so the browser displays rather than downloads.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const MIME = {
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
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.storage
      .from('materials')
      .download(path);

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 });
    }

    const ext = path.split('.').pop()?.toLowerCase() || '';
    const contentType = MIME[ext] || 'application/octet-stream';
    const buf = await data.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type':        contentType,
        'Content-Length':      String(buf.byteLength),
        // CRITICAL: inline means "display in browser", not "download"
        'Content-Disposition': 'inline',
        'Cache-Control':       'private, max-age=3600',
        // Allow mammoth/SheetJS fetch() from the browser
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('file-proxy error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
