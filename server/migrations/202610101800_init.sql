-- Runs with search_path set to the caller's schema, then public.
CREATE TABLE buildings (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  aliases   text[] NOT NULL DEFAULT '{}',
  lng       double precision NOT NULL,
  lat       double precision NOT NULL,
  footprint jsonb NOT NULL,
  height_m  double precision NOT NULL
);

CREATE TABLE ingest_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status            text NOT NULL DEFAULT 'running',
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  items             integer NOT NULL DEFAULT 0,
  events_created    integer NOT NULL DEFAULT 0,
  duplicates_merged integer NOT NULL DEFAULT 0,
  sent_to_review    integer NOT NULL DEFAULT 0
);

CREATE TABLE raw_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid REFERENCES ingest_runs(id),
  source_type  text NOT NULL CHECK (source_type IN ('upload', 'instagram', 'board')),
  source_ref   text NOT NULL,
  content_hash text NOT NULL UNIQUE,
  mime         text NOT NULL,
  bytes        bytea,
  caption      text,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title               text NOT NULL,
  description         text NOT NULL DEFAULT '',
  category            text NOT NULL,
  building_id         text NOT NULL REFERENCES buildings(id),
  room                text,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  expected_attendance integer,
  tags                text[] NOT NULL DEFAULT '{}',
  free_food           boolean NOT NULL DEFAULT false,
  source              text NOT NULL,
  status              text NOT NULL CHECK (status IN ('published', 'needs_review')),
  confidence          double precision NOT NULL DEFAULT 1,
  embedding           vector(768),
  raw_item_ids        uuid[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX events_time_idx ON events (start_at, end_at);
CREATE INDEX events_building_idx ON events (building_id);
