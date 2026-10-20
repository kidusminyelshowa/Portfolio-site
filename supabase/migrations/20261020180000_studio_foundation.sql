-- Studio: a private area at /studio where Kidus tracks leads and keeps business settings.
-- Only emails listed in studio_owners can read or change anything; visitors keep insert-only access to inquiries.

alter type public.inquiry_status add value if not exists 'proposal sent' after 'in progress';

-- Where a lead came from: the site's form, typed in by hand, or a pasted list
alter table public.inquiries
    add column source text not null default 'form' check (source in ('form', 'manual', 'import')),
    add column updated_at timestamptz not null default now();

create table public.studio_owners (
    email text primary key check (email = lower(email))
);
alter table public.studio_owners enable row level security;
revoke all on public.studio_owners from anon, authenticated;

insert into public.studio_owners (email) values ('kidusminyel@gmail.com');

-- True when the signed-in user's (confirmed) email is a studio owner
create function public.is_studio_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.studio_owners
        where email = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;
revoke execute on function public.is_studio_owner() from public, anon;
grant execute on function public.is_studio_owner() to authenticated;

grant select, insert, update, delete on public.inquiries to authenticated;

create policy "Owners can read inquiries" on public.inquiries
    for select to authenticated using ((select public.is_studio_owner()));
create policy "Owners can add inquiries" on public.inquiries
    for insert to authenticated with check ((select public.is_studio_owner()));
create policy "Owners can update inquiries" on public.inquiries
    for update to authenticated using ((select public.is_studio_owner())) with check ((select public.is_studio_owner()));
create policy "Owners can delete inquiries" on public.inquiries
    for delete to authenticated using ((select public.is_studio_owner()));

-- Business details, money and contract defaults, in one row
create table public.studio_settings (
    id smallint primary key default 1 check (id = 1),
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);
alter table public.studio_settings enable row level security;
revoke all on public.studio_settings from anon;
grant select, insert, update on public.studio_settings to authenticated;

create policy "Owners can read settings" on public.studio_settings
    for select to authenticated using ((select public.is_studio_owner()));
create policy "Owners can add settings" on public.studio_settings
    for insert to authenticated with check ((select public.is_studio_owner()));
create policy "Owners can update settings" on public.studio_settings
    for update to authenticated using ((select public.is_studio_owner())) with check ((select public.is_studio_owner()));

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger inquiries_touch before update on public.inquiries
    for each row execute function public.touch_updated_at();
create trigger studio_settings_touch before update on public.studio_settings
    for each row execute function public.touch_updated_at();
