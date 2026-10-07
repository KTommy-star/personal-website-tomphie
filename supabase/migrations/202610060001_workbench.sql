-- Install once, then configure the sole owner UUID separately.
create table if not exists public.workbench_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);
alter table public.workbench_owner enable row level security;
revoke all on public.workbench_owner from anon, authenticated;
create or replace function public.is_workbench_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workbench_owner where user_id = (select auth.uid()));
$$;
revoke all on function public.is_workbench_owner() from public, anon;
grant execute on function public.is_workbench_owner() to authenticated;

create table if not exists public.workbench_drafts (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  collection text not null check (collection in ('notes', 'research', 'projects')),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  body text not null default '' check (length(body) <= 150000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  published_commit text,
  published_url text,
  published_slug text,
  published_collection text,
  published_revision integer,
  published_at timestamptz,
  unique(collection, slug)
);
alter table public.workbench_drafts enable row level security;
revoke all on public.workbench_drafts from anon, authenticated;
grant select on public.workbench_drafts to authenticated;
grant select, update on public.workbench_drafts to service_role;
drop policy if exists "Only the sole owner reads drafts" on public.workbench_drafts;
create policy "Only the sole owner reads drafts" on public.workbench_drafts
for select to authenticated using (public.is_workbench_owner() and owner_id = (select auth.uid()));

create or replace function public.save_workbench_draft(
  draft_id uuid, draft_collection text, draft_slug text,
  draft_metadata jsonb, draft_body text, expected_revision integer
) returns public.workbench_drafts language plpgsql security definer set search_path = '' as $$
declare result public.workbench_drafts;
begin
  if not public.is_workbench_owner() then raise exception '工作台权限不足' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 or draft_id is null
    or draft_collection is null or draft_slug is null or draft_metadata is null or draft_body is null
    or draft_collection not in ('notes','research','projects') or draft_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$'
    or jsonb_typeof(draft_metadata) <> 'object' or octet_length(draft_metadata::text) > 30000
    or length(draft_body) > 150000 then raise exception '请检查链接、栏目和正文长度'; end if;
  if expected_revision = 0 then
    insert into public.workbench_drafts (id, owner_id, collection, slug, metadata, body)
    values (draft_id, auth.uid(), draft_collection, draft_slug, draft_metadata, draft_body)
    returning * into result;
  else
    select * into result from public.workbench_drafts where id = draft_id and owner_id = auth.uid() for update;
    if result.id is null or result.revision <> expected_revision then
      raise exception '版本冲突：另一个设备已修改，请保留当前正文并重新载入' using errcode = '40001';
    end if;
    if result.published_slug is not null and (result.published_slug <> draft_slug or result.published_collection <> draft_collection) then
      raise exception '已开始发布的文章链接和栏目不可更改，请保持原链接更新正文';
    end if;
    update public.workbench_drafts set collection = draft_collection, slug = draft_slug,
      metadata = draft_metadata, body = draft_body, revision = revision + 1, updated_at = now()
    where id = draft_id and owner_id = auth.uid() returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.save_workbench_draft(uuid,text,text,jsonb,text,integer) from public, anon;
grant execute on function public.save_workbench_draft(uuid,text,text,jsonb,text,integer) to authenticated;

-- Reserve the canonical URL before GitHub writes. A second device cannot rename
-- a first publication in flight, even if post-commit bookkeeping disconnects.
create or replace function public.reserve_workbench_publication(draft_id uuid, expected_revision integer)
returns public.workbench_drafts language plpgsql security definer set search_path = '' as $$
declare result public.workbench_drafts;
begin
  if not public.is_workbench_owner() then raise exception '工作台权限不足' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 1 or draft_id is null then raise exception '请先保存文章'; end if;
  select * into result from public.workbench_drafts where id = draft_id and owner_id = auth.uid() for update;
  if result.id is null or result.revision <> expected_revision then
    raise exception '版本冲突：草稿已在其他设备更新，请重新预览保存后发布' using errcode = '40001';
  end if;
  if result.published_slug is not null and (result.published_slug <> result.slug or result.published_collection <> result.collection) then
    raise exception '请保持已确定的文章链接';
  end if;
  update public.workbench_drafts set published_slug = slug, published_collection = collection
  where id = draft_id and owner_id = auth.uid() returning * into result;
  return result;
end;
$$;
revoke all on function public.reserve_workbench_publication(uuid,integer) from public, anon;
grant execute on function public.reserve_workbench_publication(uuid,integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workbench-private', 'workbench-private', false, 2097152, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Only the sole owner accesses draft pictures" on storage.objects;
create policy "Only the sole owner accesses draft pictures" on storage.objects for all to authenticated
using (bucket_id = 'workbench-private' and public.is_workbench_owner() and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'workbench-private' and public.is_workbench_owner() and (storage.foldername(name))[1] = (select auth.uid())::text);
