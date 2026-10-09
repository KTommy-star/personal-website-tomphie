begin;
alter table public.workbench_drafts add column if not exists unpublished_commit text;
alter table public.workbench_drafts add column if not exists unpublished_at timestamptz;
alter table public.workbench_drafts add column if not exists publication_operation uuid;
alter table public.workbench_drafts add column if not exists publication_pending boolean not null default false;

-- Only the authenticated Edge Function may restore Git source or publication state.
create or replace function public.recover_workbench_publication(
  draft_id uuid, article_owner uuid, draft_collection text, draft_slug text,
  draft_metadata jsonb, draft_body text, source_commit text, source_url text
) returns public.workbench_drafts language plpgsql security definer set search_path = '' as $$
declare result public.workbench_drafts;
begin
  if article_owner is null or not exists (select 1 from public.workbench_owner where user_id = article_owner) then
    raise exception '工作台权限不足' using errcode = '42501';
  end if;
  if draft_id is null or draft_collection is null or draft_collection not in ('notes','research','projects')
    or draft_slug is null or draft_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$'
    or draft_metadata is null or jsonb_typeof(draft_metadata) <> 'object' or octet_length(draft_metadata::text) > 30000
    or draft_body is null or length(draft_body) > 150000
    or source_commit is null or source_commit !~ '^[a-f0-9]{40}$'
    or source_url is null or source_url !~ '^https://' then raise exception '公开源文件恢复参数不正确'; end if;
  insert into public.workbench_drafts (id, owner_id, collection, slug, metadata, body, published_at)
  values (draft_id, article_owner, draft_collection, draft_slug, draft_metadata, draft_body,
    coalesce((draft_metadata->>'publishedAt')::timestamptz, now()))
  on conflict (collection, slug) do nothing;
  select * into result from public.workbench_drafts where collection = draft_collection and slug = draft_slug for update;
  if result.id is null or result.owner_id <> article_owner then raise exception '文章源文件归属冲突' using errcode = '42501'; end if;
  if result.publication_operation is not null or result.publication_pending then return result; end if;
  -- Existing private text and its revision are never replaced by the public snapshot.
  update public.workbench_drafts set published_commit = source_commit, published_url = source_url,
    published_slug = draft_slug, published_collection = draft_collection,
    unpublished_commit = null, unpublished_at = null, publication_operation = null
  where id = result.id and owner_id = article_owner returning * into result;
  return result;
end;
$$;
revoke all on function public.recover_workbench_publication(uuid,uuid,text,text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.recover_workbench_publication(uuid,uuid,text,text,jsonb,text,text,text) to service_role;

create or replace function public.delete_workbench_draft(draft_id uuid, expected_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare result public.workbench_drafts;
begin
  if not public.is_workbench_owner() then raise exception '工作台权限不足' using errcode = '42501'; end if;
  if draft_id is null or expected_revision is null or expected_revision < 1 then raise exception '请先选择已保存的草稿'; end if;
  select * into result from public.workbench_drafts where id = draft_id and owner_id = auth.uid() for update;
  if result.id is null then raise exception '草稿不存在或无权删除' using errcode = '42501'; end if;
  if result.revision <> expected_revision then raise exception '其他设备已更新草稿，请重新载入后再确认删除' using errcode = '40001'; end if;
  if result.publication_pending or result.published_commit is not null or (result.published_slug is not null and (result.unpublished_commit is null or result.unpublished_at is null)) then
    raise exception '请先从网站撤下此文章并保留编辑源，再删除私密草稿' using errcode = '42501';
  end if;
  delete from public.workbench_drafts where id = draft_id and owner_id = auth.uid();
end;
$$;
revoke all on function public.delete_workbench_draft(uuid,integer) from public, anon;
grant execute on function public.delete_workbench_draft(uuid,integer) to authenticated;

-- A renewed publication must block source deletion until its Git operation finishes.
create or replace function public.reserve_workbench_publication(draft_id uuid, expected_revision integer)
returns public.workbench_drafts language plpgsql security definer set search_path = '' as $$
declare result public.workbench_drafts;
begin
  if not public.is_workbench_owner() then raise exception '工作台权限不足' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 1 or draft_id is null then raise exception '请先保存文章'; end if;
  select * into result from public.workbench_drafts where id = draft_id and owner_id = auth.uid() for update;
  if result.id is null or result.revision <> expected_revision then raise exception '版本冲突：草稿已在其他设备更新，请重新预览保存后发布' using errcode = '40001'; end if;
  if result.published_slug is not null and (result.published_slug <> result.slug or result.published_collection <> result.collection) then raise exception '请保持已确定的文章链接'; end if;
  update public.workbench_drafts set published_slug = slug, published_collection = collection,
    publication_operation = gen_random_uuid(), publication_pending = true
  where id = draft_id and owner_id = auth.uid() returning * into result;
  return result;
end;
$$;
revoke all on function public.reserve_workbench_publication(uuid,integer) from public, anon;
grant execute on function public.reserve_workbench_publication(uuid,integer) to authenticated;
commit;
