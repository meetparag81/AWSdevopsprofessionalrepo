-- Run once in your Supabase project's SQL Editor. No service-role key belongs in the website.
create table if not exists public.quiz_progress (
    user_id uuid not null references auth.users(id) on delete cascade,
    quiz_id text not null check (length(quiz_id) between 1 and 100),
    state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 65536),
    revision bigint not null default 1 check (revision > 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, quiz_id)
);

alter table public.quiz_progress enable row level security;
revoke all on public.quiz_progress from anon;
revoke all on public.quiz_progress from authenticated;
grant select, insert, update on public.quiz_progress to authenticated;

drop policy if exists "Read own quiz progress" on public.quiz_progress;
create policy "Read own quiz progress" on public.quiz_progress for select
    to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Insert own quiz progress" on public.quiz_progress;
create policy "Insert own quiz progress" on public.quiz_progress for insert
    to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own quiz progress" on public.quiz_progress;
create policy "Update own quiz progress" on public.quiz_progress for update
    to authenticated using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

-- A revision check prevents stale tabs/devices from silently overwriting newer results.
create or replace function public.save_quiz_progress(
    p_quiz_id text, p_state jsonb, p_expected_revision bigint
) returns public.quiz_progress
language plpgsql
security invoker
set search_path = ''
as $$
declare
    saved public.quiz_progress;
begin
    if auth.uid() is null then
        raise exception 'Sign in before saving quiz progress.' using errcode = '42501';
    end if;
    if p_expected_revision = 0 then
        insert into public.quiz_progress (user_id, quiz_id, state)
        values (auth.uid(), p_quiz_id, p_state)
        on conflict (user_id, quiz_id) do nothing
        returning * into saved;
    else
        update public.quiz_progress
        set state = p_state, revision = revision + 1, updated_at = clock_timestamp()
        where user_id = auth.uid() and quiz_id = p_quiz_id and revision = p_expected_revision
        returning * into saved;
    end if;
    if saved.user_id is null then
        raise exception 'QUIZ_CONFLICT' using errcode = 'P0001';
    end if;
    return saved;
end;
$$;

revoke all on function public.save_quiz_progress(text, jsonb, bigint) from public, anon;
grant execute on function public.save_quiz_progress(text, jsonb, bigint) to authenticated;
