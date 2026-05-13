// lib/supabase.js
// Server-side Supabase client using the service role key.
// This file is ONLY imported in API routes (server-side).
// The service role key bypasses RLS — keep it secret.

import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL)  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ── Helper: generate next material ID ───────────────────────────
export async function nextMaterialId() {
  const { data } = await supabase.rpc('nextval', { seq: 'material_seq' }).single();
  // Fallback: count existing rows
  const { count } = await supabase
    .from('materials')
    .select('*', { count: 'exact', head: true });
  const n = (count || 0) + 1;
  return `MAT-${String(n).padStart(4, '0')}`;
}

// ── Helper: generate next annotation ID ─────────────────────────
export async function nextAnnotationId() {
  const { count } = await supabase
    .from('annotations')
    .select('*', { count: 'exact', head: true });
  const n = (count || 0) + 1;
  return `ANN-${String(n).padStart(5, '0')}`;
}

// ── Helper: get signed URL (1 hour expiry) ───────────────────────
export async function getSignedUrl(filePath) {
  const { data, error } = await supabase.storage
    .from('materials')
    .createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
