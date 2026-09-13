-- Research store for the multifractal volatility lab.
-- Target: Neon Postgres free tier. Holds 5-minute bars for the intraday assets.
-- The dashboard never queries this directly; a batch job derives the curves it serves.

create table if not exists asset (
  id              smallint primary key,
  symbol          text     not null unique,   -- Polygon symbol: MSFT, X:BTCUSD, C:EURUSD
  class           text     not null check (class in ('stocks','crypto','fx')),
  label           text     not null,
  session_tz      text     not null,          -- timezone the trading session is defined in
  resolution_min  smallint not null,
  adjusted        boolean  not null default true,
  has_volume      boolean  not null default true
);

-- One row per bar. `session`, `bucket` and `gap_min` are derived after loading
-- (see derive_bar_context) so that dropping overnight and weekend returns is a
-- query filter rather than a reprocessing step.
create table if not exists bar (
  asset_id  smallint         not null references asset(id) on delete cascade,
  ts        timestamptz      not null,        -- bar START, as returned by Polygon
  open      double precision,
  high      double precision,
  low       double precision,
  close     double precision not null,
  volume    double precision,
  session   date,                             -- trading session this bar belongs to
  bucket    smallint,                         -- 0-based index of the bar within its session
  gap_min   integer,                          -- minutes since the previous bar; null on the first
  primary key (asset_id, ts)
);

-- Backfill bookkeeping, so a rate-limited run can resume where it stopped.
create table if not exists ingest_chunk (
  asset_id   smallint    not null references asset(id) on delete cascade,
  month      date        not null,            -- first day of the month covered
  status     text        not null check (status in ('ok','empty','error')),
  bars       integer     not null default 0,
  fetched_at timestamptz not null default now(),
  note       text,
  primary key (asset_id, month)
);
