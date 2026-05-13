// app/api/upload/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';


// POST /api/upload — upload a file to Supabase Storage
// Accepts multipart/form-data with fields: file, materialId, version
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file      = formData.get('file');
    const materialId = formData.get('materialId') || 'temp';
    const version   = formData.get('version') || '1';

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext    = file.name.split('.').pop().toLowerCase();
    const path   = `${materialId}/v${version}/${Date.now()}.${ext}`;

    // Upload to Supabase Storage bucket "materials"
    const { error: uploadErr } = await supabase.storage
      .from('materials')
      .upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (uploadErr) throw uploadErr;

    // Generate a signed URL valid for 24 h (re-signed on each page load by the GET endpoint)
    const { data: signed, error: signErr } = await supabase.storage
      .from('materials')
      .createSignedUrl(path, 60 * 60 * 24);
    if (signErr) throw signErr;

    return NextResponse.json({
      path,
      url:      signed.signedUrl,
      fileName: file.name,
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/upload', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
