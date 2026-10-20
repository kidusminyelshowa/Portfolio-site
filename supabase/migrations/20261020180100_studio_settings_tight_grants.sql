-- Supabase's default grants gave signed-in users truncate and delete on settings; keep only what the policies cover
revoke all on public.studio_settings from authenticated;
grant select, insert, update on public.studio_settings to authenticated;
