-- Poker Night schema (optional persistence)
-- Play-money chips only. No payments.

create table if not exists rooms (
  id uuid primary key,
  room_code text unique not null,
  name text not null,
  host_id text not null,
  max_players int not null,
  starting_chips int not null,
  small_blind int not null,
  big_blind int not null,
  status text not null,
  created_at timestamptz default now()
);

create table if not exists players (
  id uuid primary key,
  room_id uuid references rooms(id) on delete cascade,
  session_id text not null,
  display_name text not null,
  seat_number int not null,
  chip_balance int not null,
  is_host boolean default false,
  is_connected boolean default true,
  camera_enabled boolean default false,
  microphone_enabled boolean default false,
  joined_at timestamptz default now()
);

create table if not exists games (
  id uuid primary key,
  room_id uuid references rooms(id) on delete cascade,
  dealer_position int,
  current_player_position int,
  phase text,
  pot int default 0,
  hand_number int default 0,
  created_at timestamptz default now()
);

create table if not exists hands (
  id uuid primary key,
  game_id uuid references games(id) on delete cascade,
  community_cards jsonb,
  deck_state jsonb,
  phase text,
  created_at timestamptz default now()
);

create table if not exists actions (
  id uuid primary key,
  hand_id uuid references hands(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  action text not null,
  amount int,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key,
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  message text not null,
  created_at timestamptz default now()
);

alter table rooms enable row level security;
alter table players enable row level security;
alter table games enable row level security;
alter table hands enable row level security;
alter table actions enable row level security;
alter table messages enable row level security;
