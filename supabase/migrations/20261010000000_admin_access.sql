-- Poker Night administrator access and invitation records.
-- Play-money chips only. The Next.js server is authoritative for hands.
-- Service-role writes bypass RLS. The anon key has no write policies.

create table if not exists admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id text primary key,
  name text not null,
  created_by text not null,
  status text not null,
  max_players int not null,
  starting_chips int not null,
  small_blind int not null,
  big_blind int not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists room_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists room_memberships (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  guest_session_id text not null,
  display_name text not null,
  seat_number int not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create index if not exists room_invitations_room_idx on room_invitations(room_id);
create index if not exists room_memberships_room_idx on room_memberships(room_id);
create unique index if not exists room_memberships_active_seat
  on room_memberships(room_id, seat_number)
  where left_at is null;

alter table admin_roles enable row level security;
alter table rooms enable row level security;
alter table room_invitations enable row level security;
alter table room_memberships enable row level security;

-- No anon/authenticated policies. Privileged access uses the service role on the server.
-- Bootstrap the owner after creating the Supabase Auth user:
-- insert into admin_roles (user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', 'owner');
