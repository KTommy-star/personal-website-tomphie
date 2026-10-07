-- Extend the existing owner-only workbench without changing drafts or Auth users.
begin;
alter table public.workbench_drafts add column if not exists published_fingerprint text;

create or replace function public.delete_workbench_draft(draft_id uuid, expected_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare result public.workbench_drafts;
begin
  if not public.is_workbench_owner() then raise exception '工作台权限不足' using errcode = '42501'; end if;
  if draft_id is null or expected_revision is null or expected_revision < 1 then raise exception '请先选择已保存的草稿'; end if;
  select * into result from public.workbench_drafts where id = draft_id and owner_id = auth.uid() for update;
  if result.id is null then raise exception '草稿不存在或无权删除' using errcode = '42501'; end if;
  if result.revision <> expected_revision then
    raise exception '其他设备已更新草稿，请重新载入后再确认删除' using errcode = '40001';
  end if;
  delete from public.workbench_drafts where id = draft_id and owner_id = auth.uid();
end;
$$;
revoke all on function public.delete_workbench_draft(uuid,integer) from public, anon;
grant execute on function public.delete_workbench_draft(uuid,integer) to authenticated;
commit;
