-- Step 4: a small task board per project

create type public.task_status as enum ('to do', 'doing', 'done');

create table public.project_tasks (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects (id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    status public.task_status not null default 'to do',
    position double precision not null default 0,
    due_on date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index project_tasks_project_idx on public.project_tasks (project_id, status, position);

alter table public.project_tasks enable row level security;
revoke all on public.project_tasks from anon, authenticated;
grant select, insert, update, delete on public.project_tasks to authenticated;
create policy "Owners manage project_tasks" on public.project_tasks for all to authenticated
    using ((select public.is_studio_owner())) with check ((select public.is_studio_owner()));
create trigger project_tasks_touch before update on public.project_tasks
    for each row execute function public.touch_updated_at();
