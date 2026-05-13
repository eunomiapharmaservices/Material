// app/api/materials/[id]/annotations/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST /api/materials/[id]/annotations — add annotation
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const { author, role, body, reference, version_num, is_cert } = await request.json();

    // Generate annotation ID
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
    console.error('POST /api/materials/[id]/annotations', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/materials/[id]/annotations — resolve annotation
export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const { annotation_id } = await request.json();

    const { error } = await supabase
      .from('annotations')
      .update({ resolved: true })
      .eq('id', annotation_id)
      .eq('material_id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/materials/[id]/annotations', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
