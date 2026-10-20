-- Studio step 2: a price list, proposals built from it, and a public page where the client accepts or asks for changes.

create table public.studio_services (
    id bigint generated always as identity primary key,
    name text not null check (char_length(name) between 1 and 200),
    description text check (char_length(description) <= 2000),
    unit text not null default 'project' check (char_length(unit) <= 40),
    price numeric(12, 2) not null default 0 check (price >= 0),
    sort integer not null default 0,
    is_sample boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.studio_services enable row level security;
revoke all on public.studio_services from anon, authenticated;
grant select, insert, update, delete on public.studio_services to authenticated;
create policy "Owners manage services" on public.studio_services
    for all to authenticated using ((select public.is_studio_owner())) with check ((select public.is_studio_owner()));
create trigger studio_services_touch before update on public.studio_services
    for each row execute function public.touch_updated_at();

-- Clearly marked sample prices (ETB) for the disciplines on the site; edit or delete them in Studio → Prices
insert into public.studio_services (name, description, unit, price, sort) values
    ('Brand identity', 'Logo, colour, type and a short brand guide.', 'project', 120000, 1),
    ('Art direction', 'Creative direction for a campaign or shoot.', 'day', 15000, 2),
    ('Type design', 'A custom display typeface, Latin and Ethiopic.', 'project', 150000, 3),
    ('Motion', 'Logo animation or short motion piece, up to 30 seconds.', 'item', 45000, 4),
    ('Spatial and wayfinding', 'Signage system and wayfinding for one site.', 'project', 180000, 5),
    ('Illustration', 'One finished illustration.', 'item', 12000, 6),
    ('Revision round', 'An extra round of changes beyond the two included.', 'item', 8000, 7);

create type public.proposal_status as enum ('draft', 'sent', 'viewed', 'accepted', 'changes requested', 'declined');

create table public.proposals (
    id uuid primary key default gen_random_uuid(),
    -- The client's private link; long and random so it can't be guessed
    slug text not null unique default replace(gen_random_uuid()::text, '-', ''),
    lead_id bigint references public.inquiries (id) on delete set null,
    status public.proposal_status not null default 'draft',
    title text not null default 'Proposal' check (char_length(title) between 1 and 200),
    client_name text not null default '' check (char_length(client_name) <= 200),
    client_email text check (char_length(client_email) <= 320),
    client_company text check (char_length(client_company) <= 200),
    intro text check (char_length(intro) <= 5000),
    items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
    discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
    currency text not null default 'ETB' check (char_length(currency) between 1 and 3),
    vat_rate numeric(5, 2) not null default 0 check (vat_rate between 0 and 100),
    usd_rate numeric(12, 4) check (usd_rate > 0),
    valid_until date,
    -- Business details as they were when the proposal was sent
    business jsonb not null default '{}'::jsonb,
    client_note text check (char_length(client_note) <= 5000),
    sent_at timestamptz,
    viewed_at timestamptz,
    responded_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.proposals enable row level security;
revoke all on public.proposals from anon, authenticated;
grant select, insert, update, delete on public.proposals to authenticated;
create policy "Owners manage proposals" on public.proposals
    for all to authenticated using ((select public.is_studio_owner())) with check ((select public.is_studio_owner()));
create trigger proposals_touch before update on public.proposals
    for each row execute function public.touch_updated_at();
create index proposals_lead_id_idx on public.proposals (lead_id);

-- What a client sees at /proposal/<slug>: never drafts, never owner-only fields
create function public.get_proposal(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    proposal public.proposals;
begin
    select * into proposal from public.proposals where slug = p_slug and status <> 'draft';
    if proposal.id is null then
        return null;
    end if;
    if proposal.status = 'sent' and not public.is_studio_owner() then
        update public.proposals set status = 'viewed', viewed_at = now() where id = proposal.id;
        proposal.status := 'viewed';
    end if;
    return jsonb_build_object(
        'slug', proposal.slug,
        'status', proposal.status,
        'title', proposal.title,
        'client_name', proposal.client_name,
        'client_company', proposal.client_company,
        'intro', proposal.intro,
        'items', proposal.items,
        'discount_pct', proposal.discount_pct,
        'currency', proposal.currency,
        'vat_rate', proposal.vat_rate,
        'usd_rate', proposal.usd_rate,
        'valid_until', proposal.valid_until,
        'business', proposal.business,
        'client_note', proposal.client_note,
        'sent_at', proposal.sent_at,
        'responded_at', proposal.responded_at
    );
end;
$$;

-- The client's answer; only once, and only while the proposal is open
create function public.respond_to_proposal(p_slug text, p_response text, p_note text default null)
returns public.proposal_status
language plpgsql
security definer
set search_path = ''
as $$
declare
    proposal public.proposals;
    next_status public.proposal_status;
begin
    if p_response not in ('accepted', 'changes requested') then
        raise exception 'Unknown response';
    end if;
    if char_length(coalesce(p_note, '')) > 5000 then
        raise exception 'Note is too long';
    end if;
    select * into proposal from public.proposals where slug = p_slug for update;
    if proposal.id is null or proposal.status not in ('sent', 'viewed') then
        raise exception 'This proposal is not open for a response';
    end if;
    if proposal.valid_until is not null and proposal.valid_until < current_date then
        raise exception 'This proposal has expired';
    end if;
    next_status := p_response::public.proposal_status;
    update public.proposals
        set status = next_status, client_note = nullif(trim(p_note), ''), responded_at = now()
        where id = proposal.id;
    if next_status = 'accepted' and proposal.lead_id is not null then
        update public.inquiries set status = 'won' where id = proposal.lead_id;
    end if;
    return next_status;
end;
$$;

revoke execute on function public.get_proposal(text) from public;
revoke execute on function public.respond_to_proposal(text, text, text) from public;
grant execute on function public.get_proposal(text) to anon, authenticated;
grant execute on function public.respond_to_proposal(text, text, text) to anon, authenticated;
