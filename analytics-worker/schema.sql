CREATE TABLE IF NOT EXISTS game_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind TEXT NOT NULL CHECK (kind IN ('result', 'vote')),
  course TEXT NOT NULL CHECK (course IN ('normal', 'training')),
  input TEXT NOT NULL CHECK (input IN ('microphone', 'demo')),
  duration_tenths INTEGER NOT NULL CHECK (duration_tenths BETWEEN 0 AND 730),
  glyph_count INTEGER NOT NULL CHECK (glyph_count BETWEEN 1 AND 73),
  complete INTEGER NOT NULL CHECK (complete IN (0, 1))
);

CREATE VIEW IF NOT EXISTS round_results AS
SELECT datetime(created_at, '+9 hours') AS time_jst,
       course, input, duration_tenths / 10.0 AS seconds,
       glyph_count AS characters, complete
FROM game_events WHERE kind = 'result' ORDER BY created_at DESC;

CREATE VIEW IF NOT EXISTS summary AS
SELECT course, input,
       sum(kind = 'result') AS results,
       sum(kind = 'result' AND complete = 1) AS full_completions,
       round(avg(CASE WHEN kind = 'result' THEN duration_tenths / 10.0 END), 1) AS average_seconds,
       max(CASE WHEN kind = 'result' THEN duration_tenths / 10.0 END) AS longest_seconds,
       round(avg(CASE WHEN kind = 'result' THEN glyph_count END), 1) AS average_characters,
       sum(kind = 'vote') AS vote_clicks
FROM game_events GROUP BY course, input;

CREATE VIEW IF NOT EXISTS daily_summary AS
SELECT date(created_at, '+9 hours') AS day_jst, course, input,
       sum(kind = 'result') AS results,
       sum(kind = 'result' AND complete = 1) AS full_completions,
       round(avg(CASE WHEN kind = 'result' THEN duration_tenths / 10.0 END), 1) AS average_seconds,
       sum(kind = 'vote') AS vote_clicks
FROM game_events GROUP BY day_jst, course, input ORDER BY day_jst DESC;
