// app/api/materials/route.js
import { NextResponse } from 'next/server';
import { supabase, nextMaterialId } from '@/lib/supabase';

// GET /api/materials — list all materials with latest version info
export async function GET() {
  try {
    const { data: materials, error } = await supabase
      .from('materials')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Attach current version + annotation count to each material
    const enriched = await Promise.all(materials.map(async (m) => {
      const { data: versions } = await supabase
        .from('material_versions')
        .select('*')
        .eq('material_id', m.id)
        .order('version_number', { ascending: true });

      const { count: annCount } = await supabase
        .from('annotations')
        .select('*', { count: 'exact', head: true })
        .eq('material_id', m.id)
        .eq('version_num', m.current_version);

      return { ...m, versions: versions || [], annotation_count: annCount || 0 };
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('GET /api/materials', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/materials — create new material after file is already uploaded
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      title, type, indication, target_audience, description,
      uk_cert, owner_name, file_name, file_path, file_url,
    } = body;

    // Generate ID
    const { data: existing } = await supabase
      .from('materials')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);
    const lastNum = existing?.length
      ? parseInt(existing[0].id.replace('MAT-', ''), 10)
      : 0;
    const id = `MAT-${String(lastNum + 1).padStart(4, '0')}`;

    // Insert material
    const { error: matErr } = await supabase
      .from('materials')
      .insert({ id, title, type, indication, target_audience, description, uk_cert, owner_name });
    if (matErr) throw matErr;

    // Insert first version
    const { error: verErr } = await supabase
      .from('material_versions')
      .insert({ material_id: id, version_number: 1, file_name, file_path, file_url, submitted_by: owner_name });
    if (verErr) throw verErr;

    // Insert history
    await supabase.from('material_history').insert({
      material_id: id,
      action: 'Submitted for Review',
      by_user: owner_name,
      by_role: 'owner',
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error('POST /api/materials', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
