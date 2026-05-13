// app/api/materials/[id]/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/materials/[id] — full detail with versions, annotations, history
export async function GET(_, { params }) {
  try {
    const { id } = params;

    const { data: material, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;

    const { data: versions } = await supabase
      .from('material_versions')
      .select('*')
      .eq('material_id', id)
      .order('version_number', { ascending: true });

    const { data: annotations } = await supabase
      .from('annotations')
      .select('*')
      .eq('material_id', id)
      .order('created_at', { ascending: true });

    const { data: history } = await supabase
      .from('material_history')
      .select('*')
      .eq('material_id', id)
      .order('created_at', { ascending: true });

    // Attach annotations to each version
    const versionsWithAnnotations = (versions || []).map((v) => ({
      ...v,
      annotations: (annotations || []).filter((a) => a.version_num === v.version_number),
    }));

    return NextResponse.json({ ...material, versions: versionsWithAnnotations, history: history || [] });
  } catch (err) {
    console.error('GET /api/materials/[id]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/materials/[id] — update status, cert_active, verdict on current version
export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { status, cert_active, verdict, verdict_note, version_number, by_user, by_role, history_action, history_note } = body;

    // Update material
    const materialUpdate = {};
    if (status      !== undefined) materialUpdate.status      = status;
    if (cert_active !== undefined) materialUpdate.cert_active = cert_active;

    if (Object.keys(materialUpdate).length) {
      const { error } = await supabase
        .from('materials')
        .update(materialUpdate)
        .eq('id', id);
      if (error) throw error;
    }

    // Update version verdict
    if (verdict !== undefined && version_number !== undefined) {
      const { error } = await supabase
        .from('material_versions')
        .update({ verdict, verdict_note: verdict_note || null })
        .eq('material_id', id)
        .eq('version_number', version_number);
      if (error) throw error;
    }

    // Append history
    if (history_action) {
      await supabase.from('material_history').insert({
        material_id: id,
        action: history_action,
        note: history_note || null,
        by_user,
        by_role,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/materials/[id]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
