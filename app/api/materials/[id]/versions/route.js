// app/api/materials/[id]/versions/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST /api/materials/[id]/versions — resubmit with a new file version
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const { file_name, file_path, file_url, submitted_by, by_role } = await request.json();

    // Get current version number
    const { data: material, error: matErr } = await supabase
      .from('materials')
      .select('current_version')
      .eq('id', id)
      .single();
    if (matErr) throw matErr;

    const newVersion = material.current_version + 1;

    // Insert new version
    const { error: verErr } = await supabase
      .from('material_versions')
      .insert({ material_id: id, version_number: newVersion, file_name, file_path, file_url, submitted_by });
    if (verErr) throw verErr;

    // Update material: bump version, set status to under_review
    const { error: updErr } = await supabase
      .from('materials')
      .update({ current_version: newVersion, status: 'under_review' })
      .eq('id', id);
    if (updErr) throw updErr;

    // History
    await supabase.from('material_history').insert({
      material_id: id,
      action: `v${newVersion} resubmitted for review`,
      by_user: submitted_by,
      by_role: by_role || 'owner',
    });

    return NextResponse.json({ version: newVersion }, { status: 201 });
  } catch (err) {
    console.error('POST /api/materials/[id]/versions', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
