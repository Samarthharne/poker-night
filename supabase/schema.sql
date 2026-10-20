-- Poker Night schema (optional persistence)
-- Gameplay currently uses an in-memory server store so the app runs
-- without credentials. Apply this in Supabase when you are ready to persist rooms.

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  name text not null,
  host_id text,
  max_players int not null default 6,
  starting_chips int not null,
  small_blind int not null,
  big_blind int not null,
  status text not null default 'lobby',
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id text,
  session_id text,
  display_name text not null,
  seat_number int not null,
  chip_balance int not null,
  is_host boolean not null default false,
  is_connected boolean not null default true,
  camera_enabled boolean not null default false,
  microphone_enabled boolean not null default false,
  joined_at timestamptz not null default now()
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  dealer_position int,
  current_player_position int,
  phase text,
  pot int not null default 0,
  hand_number int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hands (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  community_cards jsonb not null default '[]',
  deck_state jsonb,
  phase text,
  created_at timestamptz not null default now()
);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  hand_id uuid references hands(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  action text not null,
  amount int,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;
alter table players enable row level security;
alter table games enable row level security;
alter table hands enable row level security;
alter table actions enable row level security;
alter table messages enable row level security;

-- Public read of lobby metadata; gameplay mutations stay on the server.
create policy "rooms are readable" on rooms for select using (true);
create policy "messages readable" on messages for select using (true);
