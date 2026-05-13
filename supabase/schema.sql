-- ================================================================
-- Essential Pharma — Material Review Platform
-- Supabase / PostgreSQL Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ================================================================

-- Counter for human-readable IDs
create sequence if not exists material_seq start 1;
create sequence if not exists annotation_seq start 1;

-- ----------------------------------------------------------------
-- MATERIALS
-- ----------------------------------------------------------------
create table if not exists materials (
  id              text primary key,                          -- MAT-0001
  title           text        not null,
  type            text        not null,
  indication      text,
  target_audience text,
  description     text,
  uk_cert         boolean     not null default false,
  owner_name      text        not null,
  status          text        not null default 'under_review',
  current_version integer     not null default 1,
  cert_active     boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- MATERIAL VERSIONS
-- ----------------------------------------------------------------
create table if not exists material_versions (
  id             uuid        primary key default gen_random_uuid(),
  material_id    text        not null references materials(id) on delete cascade,
  version_number integer     not null,
  file_name      text        not null,
  file_path      text        not null,   -- Supabase Storage path
  file_url       text        not null,   -- Public / signed URL
  submitted_by   text        not null,
  submitted_at   timestamptz not null default now(),
  verdict        text,                   -- approved | revise_resubmit | not_approved | cancelled | certified | cert_revise
  verdict_note   text,
  unique (material_id, version_number)
);

-- ----------------------------------------------------------------
-- ANNOTATIONS
-- ----------------------------------------------------------------
create table if not exists annotations (
  id          text        primary key,                       -- ANN-00001
  material_id text        not null references materials(id) on delete cascade,
  version_num integer     not null,
  author      text        not null,
  role        text        not null,
  body        text        not null,
  reference   text,                                          -- page / timestamp
  resolved    boolean     not null default false,
  is_cert     boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- AUDIT HISTORY
-- ----------------------------------------------------------------
create table if not exists material_history (
  id          uuid        primary key default gen_random_uuid(),
  material_id text        not null references materials(id) on delete cascade,
  action      text        not null,
  note        text,
  by_user     text        not null,
  by_role     text        not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- UPDATED_AT trigger
-- ----------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists materials_updated_at on materials;
create trigger materials_updated_at
  before update on materials
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------
create index if not exists idx_versions_material   on material_versions(material_id);
create index if not exists idx_annotations_material on annotations(material_id);
create index if not exists idx_history_material    on material_history(material_id);
create index if not exists idx_materials_status    on materials(status);

-- ----------------------------------------------------------------
-- STORAGE BUCKET
-- Run separately in Supabase Dashboard → Storage → New Bucket:
--   Name: materials
--   Public: false (we'll use signed URLs)
-- Or run via Supabase CLI / API. The SQL below creates the bucket
-- programmatically if using the storage schema extension.
-- ----------------------------------------------------------------
-- insert into storage.buckets (id, name, public)
-- values ('materials', 'materials', false)
-- on conflict do nothing;

-- ----------------------------------------------------------------
-- RLS (Row Level Security)
-- For now disabled so any server-side call works.
-- Enable and add policies when you add Supabase Auth.
-- ----------------------------------------------------------------
alter table materials         disable row level security;
alter table material_versions disable row level security;
alter table annotations       disable row level security;
alter table material_history  disable row level security;
