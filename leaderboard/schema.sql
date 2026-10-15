CREATE TABLE IF NOT EXISTS leaderboard_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
INSERT OR IGNORE INTO leaderboard_meta (id, version) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  name_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  ruleset TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  time_ms INTEGER CHECK (time_ms >= 31250 AND time_ms <= 1200000),
  apexes INTEGER CHECK (apexes >= 0 AND apexes <= 7),
  finished_at INTEGER,
  disqualified INTEGER NOT NULL DEFAULT 0 CHECK (disqualified IN (0, 1))
);
CREATE INDEX IF NOT EXISTS runs_expiry ON runs(expires_at) WHERE finished_at IS NULL;
CREATE INDEX IF NOT EXISTS runs_history ON runs(player_id, event_id, ruleset, time_ms);

CREATE TABLE IF NOT EXISTS event_bests (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  ruleset TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  apexes INTEGER NOT NULL,
  achieved_at INTEGER NOT NULL,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, event_id, ruleset)
);
CREATE INDEX IF NOT EXISTS bests_ranking ON event_bests(ruleset, event_id, time_ms, achieved_at, player_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS limits_expiry ON rate_limits(expires_at);
