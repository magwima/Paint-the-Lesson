-- ============================================================
-- Paint the Lesson: database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run again: it only creates what is missing and
-- replaces the functions and policies.
-- ============================================================

-- ---------- Tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text default '',
  name text not null default '',
  is_teacher boolean not null default false,
  country text default '',
  city text default '',
  lang text default 'English',
  photo text default '',
  bio text default '',
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  folder_id uuid references public.folders on delete set null,
  title text not null default 'Untitled lesson',
  level text default '',
  length int default 90,
  student text default '',
  md text not null default '',
  deck jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  subtitle text default '',
  description text default '',
  level text default '',
  cover_url text default '',
  color text default '#A9CFEA',
  slug text unique,
  join_code text unique not null default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  published boolean not null default false,
  open_enrolment boolean not null default false,
  certificate boolean not null default true,
  pass_mark int not null default 70,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  title text not null,
  position int not null default 0
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  module_id uuid references public.modules on delete cascade,
  title text not null,
  summary text default '',
  position int not null default 0,
  blocks jsonb not null default '[]',
  quiz jsonb,                 -- questions only, no answers
  homework text,              -- assignment prompt, or null
  release_days int,           -- days after the student enrols
  release_at timestamptz,     -- or a fixed date
  is_preview boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_keys (
  lesson_id uuid primary key references public.lessons on delete cascade,
  answers jsonb not null default '{}'
);

create table if not exists public.enrolments (
  course_id uuid not null references public.courses on delete cascade,
  student_id uuid not null references auth.users on delete cascade,
  enrolled_at timestamptz not null default now(),
  note text default '',
  primary key (course_id, student_id)
);

create table if not exists public.progress (
  student_id uuid not null references auth.users on delete cascade,
  lesson_id uuid not null references public.lessons on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  student_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('quiz','homework')),
  answers jsonb,
  body text,
  file_url text,
  score numeric,
  max_score numeric,
  passed boolean,
  feedback text,
  graded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  author_name text default '',
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  course_id uuid references public.courses on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  minutes int not null default 60,
  link text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  student_id uuid not null references auth.users on delete cascade,
  student_name text not null,
  course_title text not null,
  teacher_name text not null,
  issued_at timestamptz not null default now(),
  unique (course_id, student_id)
);

create index if not exists lessons_course_idx on public.lessons(course_id);
create index if not exists modules_course_idx on public.modules(course_id);
create index if not exists progress_course_idx on public.progress(course_id);
create index if not exists submissions_course_idx on public.submissions(course_id);
create index if not exists comments_lesson_idx on public.comments(lesson_id);
create index if not exists classes_owner_idx on public.classes(owner);

-- ---------- Helper functions (bypass RLS safely, read-only) ----------

create or replace function public.owns_course(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from courses where id = cid and owner = auth.uid());
$$;

create or replace function public.enrolled_in(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from enrolments where course_id = cid and student_id = auth.uid());
$$;

create or replace function public.course_published(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from courses where id = cid and published);
$$;

create or replace function public.shares_course(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from enrolments e join courses c on c.id = e.course_id
    where (e.student_id = pid and c.owner = auth.uid())
       or (c.owner = pid and e.student_id = auth.uid())
  );
$$;

-- When a lesson opens for the signed-in student (null if not enrolled)
create or replace function public.unlock_time(cid uuid, days int, at timestamptz) returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(
    coalesce(at, '-infinity'::timestamptz),
    coalesce((select e.enrolled_at + make_interval(days => coalesce(days, 0))
              from enrolments e where e.course_id = cid and e.student_id = auth.uid()), 'infinity'::timestamptz)
  );
$$;

create or replace function public.lesson_open(l public.lessons) returns boolean
language sql stable security definer set search_path = public as $$
  select l.published and public.enrolled_in(l.course_id) and public.unlock_time(l.course_id, l.release_days, l.release_at) <= now();
$$;

-- ---------- New users get a profile ----------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, photo)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for anyone who signed up before this script ran
insert into public.profiles (id, email, name)
select u.id, coalesce(u.email, ''), split_part(coalesce(u.email, ''), '@', 1) from auth.users u
on conflict (id) do nothing;

-- Comment author names are filled in by the database
create or replace function public.comment_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.author_id := auth.uid();
  new.author_name := coalesce((select name from profiles where id = auth.uid()), 'Someone');
  new.created_at := now();
  return new;
end $$;
create or replace trigger comments_author before insert on public.comments
  for each row execute function public.comment_author();

-- ---------- Row-level security ----------

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.classes enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.quiz_keys enable row level security;
alter table public.enrolments enable row level security;
alter table public.progress enable row level security;
alter table public.submissions enable row level security;
alter table public.comments enable row level security;
alter table public.sessions enable row level security;
alter table public.certificates enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('profiles','folders','classes','courses','modules','lessons','quiz_keys','enrolments','progress','submissions','comments','sessions','certificates')
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- Profiles: yourself, and people you share a course with
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.shares_course(id));
create policy profiles_write on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());

-- Folders and painted classes: owner only
create policy folders_all on public.folders for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy classes_all on public.classes for all using (owner = auth.uid()) with check (owner = auth.uid());

-- Courses: owner and enrolled students (the public sees published courses through public_course(), which hides the class code)
create policy courses_read on public.courses for select using (owner = auth.uid() or public.enrolled_in(id));
create policy courses_insert on public.courses for insert with check (owner = auth.uid());
create policy courses_update on public.courses for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy courses_delete on public.courses for delete using (owner = auth.uid());

-- Modules
create policy modules_read on public.modules for select using (public.owns_course(course_id) or public.enrolled_in(course_id));
create policy modules_write on public.modules for all using (public.owns_course(course_id)) with check (public.owns_course(course_id));

-- Lessons: owner; enrolled students once released; free previews for everyone
create policy lessons_read on public.lessons for select using (
  public.owns_course(course_id) or public.lesson_open(lessons)
  or (is_preview and published and public.course_published(course_id)));
create policy lessons_write on public.lessons for all using (public.owns_course(course_id)) with check (public.owns_course(course_id));

-- Quiz answers: owner only (students are marked by submit_quiz)
create policy quiz_keys_all on public.quiz_keys for all
  using (public.owns_course((select course_id from lessons where id = lesson_id)))
  with check (public.owns_course((select course_id from lessons where id = lesson_id)));

-- Enrolments: the student and the course owner
create policy enrolments_read on public.enrolments for select using (student_id = auth.uid() or public.owns_course(course_id));
create policy enrolments_update on public.enrolments for update using (public.owns_course(course_id));
create policy enrolments_delete on public.enrolments for delete using (student_id = auth.uid() or public.owns_course(course_id));

-- Progress: written only through complete_lesson()
create policy progress_read on public.progress for select using (student_id = auth.uid() or public.owns_course(course_id));
create policy progress_delete on public.progress for delete using (student_id = auth.uid() or public.owns_course(course_id));

-- Submissions
create policy submissions_read on public.submissions for select using (student_id = auth.uid() or public.owns_course(course_id));
create policy submissions_homework on public.submissions for insert with check (
  student_id = auth.uid() and kind = 'homework' and score is null and feedback is null and public.enrolled_in(course_id)
  and exists(select 1 from lessons l where l.id = lesson_id and l.course_id = submissions.course_id));
create policy submissions_grade on public.submissions for update using (public.owns_course(course_id)) with check (public.owns_course(course_id));
create policy submissions_delete on public.submissions for delete using (public.owns_course(course_id));

-- Discussion
create policy comments_read on public.comments for select using (public.owns_course(course_id) or public.enrolled_in(course_id));
create policy comments_insert on public.comments for insert with check (
  (public.owns_course(course_id) or public.enrolled_in(course_id))
  and exists(select 1 from lessons l where l.id = lesson_id and l.course_id = comments.course_id));
create policy comments_delete on public.comments for delete using (author_id = auth.uid() or public.owns_course(course_id));

-- Live sessions (calendar)
create policy sessions_read on public.sessions for select using (owner = auth.uid() or (course_id is not null and public.enrolled_in(course_id)));
create policy sessions_write on public.sessions for all using (owner = auth.uid()) with check (owner = auth.uid() and (course_id is null or public.owns_course(course_id)));

-- Certificates: issued by claim_certificate(), checked by verify_certificate()
create policy certificates_read on public.certificates for select using (student_id = auth.uid() or public.owns_course(course_id));
create policy certificates_delete on public.certificates for delete using (public.owns_course(course_id));

-- ---------- Actions (RPC) ----------

-- Course outline with lock dates and the student's progress
create or replace function public.course_outline(p_course uuid) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.mpos, x.position), '[]'::json) from (
    select l.id, l.module_id, coalesce(m.position, -1) as mpos, l.position, l.title, l.summary, l.is_preview,
           (l.quiz is not null and jsonb_array_length(coalesce(l.quiz->'questions','[]'::jsonb)) > 0) as has_quiz,
           (l.homework is not null and l.homework <> '') as has_homework,
           case when public.enrolled_in(l.course_id) then public.unlock_time(l.course_id, l.release_days, l.release_at) end as unlock_at,
           exists(select 1 from progress p where p.lesson_id = l.id and p.student_id = auth.uid()) as done
    from lessons l left join modules m on m.id = l.module_id
    join courses c on c.id = l.course_id
    where l.course_id = p_course and l.published
      and (c.published or c.owner = auth.uid() or public.enrolled_in(c.id))
  ) x;
$$;

-- Public course page
create or replace function public.public_course(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'course', json_build_object('id', c.id, 'title', c.title, 'subtitle', c.subtitle, 'description', c.description,
       'level', c.level, 'cover_url', c.cover_url, 'color', c.color, 'slug', c.slug,
       'open_enrolment', c.open_enrolment, 'certificate', c.certificate),
    'teacher', json_build_object('name', p.name, 'photo', p.photo, 'bio', p.bio, 'slug', p.slug, 'country', p.country, 'city', p.city),
    'modules', (select coalesce(json_agg(json_build_object('id', m.id, 'title', m.title) order by m.position), '[]'::json) from modules m where m.course_id = c.id),
    'outline', public.course_outline(c.id),
    'students', (select count(*) from enrolments e where e.course_id = c.id),
    'enrolled', public.enrolled_in(c.id)
  )
  from courses c join profiles p on p.id = c.owner
  where (c.slug = p_slug or c.id::text = p_slug) and (c.published or c.owner = auth.uid());
$$;

-- Public teacher page
create or replace function public.public_teacher(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'teacher', json_build_object('name', p.name, 'photo', p.photo, 'bio', p.bio, 'slug', p.slug, 'country', p.country, 'city', p.city),
    'courses', (select coalesce(json_agg(json_build_object('id', c.id, 'title', c.title, 'subtitle', c.subtitle, 'level', c.level,
                 'cover_url', c.cover_url, 'color', c.color, 'slug', c.slug,
                 'lessons', (select count(*) from lessons l where l.course_id = c.id and l.published)) order by c.created_at desc), '[]'::json)
                from courses c where c.owner = p.id and c.published)
  )
  from profiles p where p.slug = p_slug and p.is_teacher;
$$;

-- Join with a class code
create or replace function public.join_course(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare c courses;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into c from courses where join_code = upper(trim(p_code));
  if not found then raise exception 'bad_code'; end if;
  insert into enrolments (course_id, student_id) values (c.id, auth.uid()) on conflict do nothing;
  return json_build_object('id', c.id, 'title', c.title);
end $$;

-- Enrol in a course that is open to everyone
create or replace function public.enrol_open(p_course uuid) returns json
language plpgsql security definer set search_path = public as $$
declare c courses;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into c from courses where id = p_course and published and open_enrolment;
  if not found then raise exception 'closed'; end if;
  insert into enrolments (course_id, student_id) values (c.id, auth.uid()) on conflict do nothing;
  return json_build_object('id', c.id, 'title', c.title);
end $$;

-- Mark a quiz on the server, so students never see the answer key first
create or replace function public.submit_quiz(p_lesson uuid, p_answers jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare l lessons; k jsonb; q jsonb; total int := 0; got int := 0; res jsonb := '{}'::jsonb;
        given jsonb; want jsonb; ok boolean; pm int; pct numeric;
begin
  select * into l from lessons where id = p_lesson;
  if not found or not public.lesson_open(l) then raise exception 'not_open'; end if;
  select answers into k from quiz_keys where lesson_id = p_lesson;
  k := coalesce(k, '{}'::jsonb);
  for q in select * from jsonb_array_elements(coalesce(l.quiz->'questions', '[]'::jsonb)) loop
    total := total + 1;
    given := p_answers -> (q->>'id');
    want := k -> (q->>'id');
    if q->>'type' = 'short' then
      ok := given is not null and exists(
        select 1 from jsonb_array_elements_text(coalesce(want, '[]'::jsonb)) a
        where lower(regexp_replace(trim(a), '\s+', ' ', 'g')) = lower(regexp_replace(trim(given #>> '{}'), '\s+', ' ', 'g')));
    else
      ok := given is not null and want is not null and
        (select coalesce(array_agg(v::int order by v::int), '{}') from jsonb_array_elements_text(case when jsonb_typeof(given) = 'array' then given else jsonb_build_array(given) end) v)
        = (select coalesce(array_agg(v::int order by v::int), '{}') from jsonb_array_elements_text(want) v);
    end if;
    if ok then got := got + 1; end if;
    res := res || jsonb_build_object(q->>'id', jsonb_build_object('correct', ok, 'answer', want));
  end loop;
  select pass_mark into pm from courses where id = l.course_id;
  pct := case when total = 0 then 100 else round(got * 100.0 / total) end;
  insert into submissions (lesson_id, course_id, student_id, kind, answers, score, max_score, passed, graded_at)
  values (l.id, l.course_id, auth.uid(), 'quiz', p_answers, got, total, pct >= coalesce(pm, 70), now());
  return json_build_object('score', got, 'max', total, 'percent', pct, 'passed', pct >= coalesce(pm, 70), 'pass_mark', coalesce(pm, 70), 'results', res);
end $$;

-- Complete a lesson (a lesson with a quiz needs a passed attempt first)
create or replace function public.complete_lesson(p_lesson uuid) returns json
language plpgsql security definer set search_path = public as $$
declare l lessons;
begin
  select * into l from lessons where id = p_lesson;
  if not found or not public.lesson_open(l) then raise exception 'not_open'; end if;
  if l.quiz is not null and jsonb_array_length(coalesce(l.quiz->'questions','[]'::jsonb)) > 0
     and not exists(select 1 from submissions s where s.lesson_id = l.id and s.student_id = auth.uid() and s.kind = 'quiz' and s.passed) then
    raise exception 'quiz_not_passed';
  end if;
  insert into progress (student_id, lesson_id, course_id) values (auth.uid(), l.id, l.course_id) on conflict do nothing;
  return json_build_object('ok', true);
end $$;

-- Issue a certificate when every lesson is complete
create or replace function public.claim_certificate(p_course uuid) returns json
language plpgsql security definer set search_path = public as $$
declare c courses; total int; done int; cert certificates;
begin
  select * into c from courses where id = p_course;
  if not found or not c.certificate or not public.enrolled_in(p_course) then raise exception 'not_available'; end if;
  select count(*) into total from lessons where course_id = p_course and published;
  select count(*) into done from progress p join lessons l on l.id = p.lesson_id
    where p.course_id = p_course and p.student_id = auth.uid() and l.published;
  if total = 0 or done < total then raise exception 'not_complete'; end if;
  insert into certificates (course_id, student_id, student_name, course_title, teacher_name)
  values (p_course, auth.uid(),
    coalesce((select nullif(name, '') from profiles where id = auth.uid()), 'Student'),
    c.title, coalesce((select name from profiles where id = c.owner), ''))
  on conflict (course_id, student_id) do update set student_name = excluded.student_name
  returning * into cert;
  return row_to_json(cert);
end $$;

-- Anyone can check a certificate by its number
create or replace function public.verify_certificate(p_id uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', id, 'student_name', student_name, 'course_title', course_title, 'teacher_name', teacher_name, 'issued_at', issued_at)
  from certificates where id = p_id;
$$;

grant execute on function public.course_published(uuid), public.course_outline(uuid), public.public_course(text), public.public_teacher(text),
  public.verify_certificate(uuid) to anon, authenticated;
grant execute on function public.join_course(text), public.enrol_open(uuid), public.submit_quiz(uuid, jsonb),
  public.complete_lesson(uuid), public.claim_certificate(uuid) to authenticated;
revoke execute on function public.join_course(text), public.enrol_open(uuid), public.submit_quiz(uuid, jsonb),
  public.complete_lesson(uuid), public.claim_certificate(uuid) from public, anon;
-- Trigger helpers are never called directly
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.comment_author() from public, anon, authenticated;

-- ---------- File storage for lesson materials ----------

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "ptl files upload" on storage.objects;
drop policy if exists "ptl files update" on storage.objects;
drop policy if exists "ptl files delete" on storage.objects;
create policy "ptl files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ptl files update" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ptl files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Done. Paint the Lesson is ready to use.
