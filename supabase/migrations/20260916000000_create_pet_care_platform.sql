create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  species text not null default 'dog',
  breed text,
  birth_date date,
  weight_kg numeric(6,2),
  color text,
  avatar_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  title text not null,
  appointment_type text not null default 'vet',
  scheduled_at timestamptz not null,
  location text,
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.care_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  care_type text not null,
  title text not null,
  logged_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists pets_owner_id_idx on public.pets(owner_id);
create index if not exists appointments_owner_scheduled_idx on public.appointments(owner_id, scheduled_at);
create index if not exists care_logs_owner_logged_idx on public.care_logs(owner_id, logged_at desc);
create index if not exists documents_owner_id_idx on public.documents(owner_id);

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.appointments enable row level security;
alter table public.care_logs enable row level security;
alter table public.documents enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.owns_pet(target_pet_id uuid, target_owner_id uuid)
returns boolean language sql stable security invoker set search_path = public
as $$ select exists (select 1 from public.pets where id = target_pet_id and owner_id = target_owner_id) $$;

drop policy if exists pets_select_own on public.pets;
create policy pets_select_own on public.pets for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists pets_insert_own on public.pets;
create policy pets_insert_own on public.pets for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists pets_update_own on public.pets;
create policy pets_update_own on public.pets for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists pets_delete_own on public.pets;
create policy pets_delete_own on public.pets for delete to authenticated using ((select auth.uid()) = owner_id);

-- Appointments
 drop policy if exists appointments_select_own on public.appointments;
create policy appointments_select_own on public.appointments for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists appointments_insert_own on public.appointments;
create policy appointments_insert_own on public.appointments for insert to authenticated with check ((select auth.uid()) = owner_id and public.owns_pet(pet_id, owner_id));
drop policy if exists appointments_update_own on public.appointments;
create policy appointments_update_own on public.appointments for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and public.owns_pet(pet_id, owner_id));
drop policy if exists appointments_delete_own on public.appointments;
create policy appointments_delete_own on public.appointments for delete to authenticated using ((select auth.uid()) = owner_id);

-- Care logs
 drop policy if exists care_logs_select_own on public.care_logs;
create policy care_logs_select_own on public.care_logs for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists care_logs_insert_own on public.care_logs;
create policy care_logs_insert_own on public.care_logs for insert to authenticated with check ((select auth.uid()) = owner_id and public.owns_pet(pet_id, owner_id));
drop policy if exists care_logs_update_own on public.care_logs;
create policy care_logs_update_own on public.care_logs for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and public.owns_pet(pet_id, owner_id));
drop policy if exists care_logs_delete_own on public.care_logs;
create policy care_logs_delete_own on public.care_logs for delete to authenticated using ((select auth.uid()) = owner_id);

-- Documents
 drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own on public.documents for insert to authenticated with check ((select auth.uid()) = owner_id and public.owns_pet(pet_id, owner_id));
drop policy if exists documents_delete_own on public.documents;
create policy documents_delete_own on public.documents for delete to authenticated using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public)
values ('pet-documents', 'pet-documents', false)
on conflict (id) do nothing;

drop policy if exists pet_documents_select on storage.objects;
create policy pet_documents_select on storage.objects for select to authenticated using (bucket_id = 'pet-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists pet_documents_insert on storage.objects;
create policy pet_documents_insert on storage.objects for insert to authenticated with check (bucket_id = 'pet-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists pet_documents_delete on storage.objects;
create policy pet_documents_delete on storage.objects for delete to authenticated using (bucket_id = 'pet-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

do $$ begin
  alter publication supabase_realtime add table public.pets;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.appointments;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.care_logs;
exception when duplicate_object then null;
end $$;
