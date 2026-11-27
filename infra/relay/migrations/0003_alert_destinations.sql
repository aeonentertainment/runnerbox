-- Where a user's alerts go beyond the app. The webhook and token are encrypted with the relay's
-- own key, so a copy of the database alone can't post to the channel.
CREATE TABLE slack_destinations (
  user_id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  channel TEXT NOT NULL,
  webhook_encrypted TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,
  connected_at TEXT NOT NULL
);
CREATE INDEX slack_destinations_team ON slack_destinations (team_id);

-- Alerts sent per user per hour, for the hourly limit.
CREATE TABLE alert_counts (
  user_id TEXT NOT NULL,
  hour INTEGER NOT NULL,
  sent INTEGER NOT NULL,
  PRIMARY KEY (user_id, hour)
);
