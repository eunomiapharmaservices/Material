// app/api/upload/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const formData   = await request.formData();
    const file       = formData.get('file');
    const materialId = formData.get('materialId') || 'temp';
    const version    = formData.get('version') || '1';

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext    = file.name.split('.').pop().toLowerCase();
    const path   = `${materialId}/v${version}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('materials')
      .upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (uploadErr) throw uploadErr;

    // Public URL — no expiry, no Content-Disposition:attachment, works with Google Docs Viewer
    // Requires bucket to be set Public in Supabase Dashboard → Storage
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/materials/${path}`;

    return NextResponse.json({ path, url: publicUrl, fileName: file.name }, { status: 201 });
  } catch (err) {
    console.error('POST /api/upload', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
