-- Studio step 3: once a proposal is accepted it becomes a deal with a contract, invoices and a project.

create table public.contracts (
    id uuid primary key default gen_random_uuid(),
    proposal_id uuid not null unique references public.proposals (id) on delete cascade,
    number text not null unique check (char_length(number) between 1 and 40),
    clauses text check (char_length(clauses) <= 20000),
    signed_on date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create type public.invoice_status as enum ('issued', 'paid', 'void');

create table public.invoices (
    id uuid primary key default gen_random_uuid(),
    proposal_id uuid references public.proposals (id) on delete set null,
    number text not null unique check (char_length(number) between 1 and 40),
    label text not null default 'Full payment' check (char_length(label) between 1 and 120),
    -- Share of the proposal's total this invoice asks for, e.g. 50 for a deposit
    share_pct numeric(5, 2) not null default 100 check (share_pct > 0 and share_pct <= 100),
    status public.invoice_status not null default 'issued',
    issued_on date not null default current_date,
    due_on date,
    paid_on date,
    client jsonb not null default '{}'::jsonb,
    items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
    discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
    vat_rate numeric(5, 2) not null default 0 check (vat_rate between 0 and 100),
    currency text not null default 'ETB' check (char_length(currency) between 1 and 3),
    business jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index invoices_proposal_id_idx on public.invoices (proposal_id);

create type public.project_status as enum ('kick-off', 'in progress', 'done');

create table public.projects (
    id uuid primary key default gen_random_uuid(),
    proposal_id uuid unique references public.proposals (id) on delete set null,
    lead_id bigint references public.inquiries (id) on delete set null,
    name text not null check (char_length(name) between 1 and 200),
    client_name text check (char_length(client_name) <= 200),
    status public.project_status not null default 'kick-off',
    starts_on date default current_date,
    due_on date,
    notes text check (char_length(notes) <= 10000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index projects_lead_id_idx on public.projects (lead_id);

do $$
declare
    t text;
begin
    foreach t in array array['contracts', 'invoices', 'projects'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on public.%I from anon, authenticated', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
        execute format('create policy "Owners manage %s" on public.%I for all to authenticated using ((select public.is_studio_owner())) with check ((select public.is_studio_owner()))', t, t);
        execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
    end loop;
end;
$$;
