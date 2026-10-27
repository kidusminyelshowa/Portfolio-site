-- Storage for the studio suite (Team app, Price Builder): every document and picture is one row.
-- Only the server reads and writes it, with the secret key; the public keys get nothing.
create table if not exists public.suite_files (
  path text primary key,
  access text not null default 'private' check (access in ('private', 'public')),
  content_type text not null default 'application/octet-stream',
  body bytea not null,
  size integer not null default 0,
  etag text not null,
  updated_at timestamptz not null default now()
);
alter table public.suite_files enable row level security;
revoke all on public.suite_files from anon, authenticated;

-- save one file; p_if_match: only if unchanged since read; p_overwrite false: only if new.
-- Returns the new etag. Raises 'precondition_failed' or 'already_exists'.
create or replace function public.suite_put(p_path text, p_body text, p_type text, p_access text, p_if_match text default null, p_overwrite boolean default true)
returns table (etag text, size integer)
language plpgsql
set search_path = public
as $$
declare
  b bytea := decode(p_body, 'base64');
  e text := md5(b) || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS');
  cur text;
begin
  select f.etag into cur from public.suite_files f where f.path = p_path for update;
  if found then
    if not p_overwrite then raise exception 'already_exists'; end if;
    if p_if_match is not null and cur <> p_if_match then raise exception 'precondition_failed'; end if;
    update public.suite_files set body = b, content_type = coalesce(p_type, content_type), access = coalesce(p_access, access),
      size = length(b), etag = e, updated_at = now() where path = p_path;
  else
    if p_if_match is not null then raise exception 'precondition_failed'; end if;
    insert into public.suite_files (path, access, content_type, body, size, etag)
      values (p_path, coalesce(p_access, 'private'), coalesce(p_type, 'application/octet-stream'), b, length(b), e);
  end if;
  return query select e, length(b);
end $$;

create or replace function public.suite_get(p_path text)
returns table (body text, content_type text, etag text, size integer, access text, updated_at timestamptz)
language sql stable
set search_path = public
as $$
  select encode(f.body, 'base64'), f.content_type, f.etag, f.size, f.access, f.updated_at from public.suite_files f where f.path = p_path
$$;

revoke all on function public.suite_put(text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.suite_get(text) from public, anon, authenticated;
grant execute on function public.suite_put(text, text, text, text, text, boolean) to service_role;
grant execute on function public.suite_get(text) to service_role;
grant all on public.suite_files to service_role;
