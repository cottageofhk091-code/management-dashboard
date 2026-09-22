-- 中央管理ダッシュボードが metrics を読むための SELECT ポリシー。
-- 本番では SUPABASE_SERVICE_ROLE_KEY を使う方が安全です。
-- anon SELECT は管理画面を公開しない場合のみ適用してください。

alter table if exists public.analytics_visits enable row level security;
alter table if exists public.analytics_events enable row level security;
alter table if exists public.profiles enable row level security;
alter table if exists public.app_logs enable row level security;

drop policy if exists "Allow anon select analytics_visits" on public.analytics_visits;
create policy "Allow anon select analytics_visits"
  on public.analytics_visits for select to anon using (true);

drop policy if exists "Allow anon select analytics_events" on public.analytics_events;
create policy "Allow anon select analytics_events"
  on public.analytics_events for select to anon using (true);

drop policy if exists "Allow anon select profiles" on public.profiles;
create policy "Allow anon select profiles"
  on public.profiles for select to anon using (true);

drop policy if exists "Allow anon select app_logs" on public.app_logs;
create policy "Allow anon select app_logs"
  on public.app_logs for select to anon using (true);
