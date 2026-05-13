// app/api/materials/[id]/annotations/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST — add annotation
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const { author, role, body, reference, version_num, is_cert } = await request.json();

    const { count } = await supabase
      .from('annotations')
      .select('*', { count: 'exact', head: true });
    const annId = `ANN-${String((count || 0) + 1).padStart(5, '0')}`;

    const { data, error } = await supabase
      .from('annotations')
      .insert({ id: annId, material_id: id, version_num, author, role, body, reference, is_cert: is_cert || false })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST annotations', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — resolve OR edit an annotation
// Body: { annotation_id, resolved: true }  → mark resolved
// Body: { annotation_id, body: 'new text' } → edit comment text
export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const payload = await request.json();
    const { annotation_id, resolved, body } = payload;

    const update = {};
    if (resolved !== undefined) update.resolved = true;
    if (body      !== undefined) update.body     = body;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('annotations')
      .update(update)
      .eq('id', annotation_id)
      .eq('material_id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH annotations', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
