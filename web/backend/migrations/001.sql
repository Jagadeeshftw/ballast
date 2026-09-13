CREATE TABLE IF NOT EXISTS wallets (
 address text PRIMARY KEY CHECK (address ~ '^0x[0-9a-f]{40}$'),
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz
);
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 address text NOT NULL REFERENCES wallets(address),
 kind text NOT NULL CHECK (kind IN ('cover_opened','cover_declined','cover_settled_won','cover_settled_lost','cover_settled_voided','vault_low','vault_empty','engine_low','engine_stopped')),
 title text NOT NULL, body text NOT NULL, data jsonb,
 read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 dedupe_key text NOT NULL, UNIQUE(address, dedupe_key)
);
CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(address, created_at DESC) WHERE NOT read;
CREATE TABLE IF NOT EXISTS engine_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engine_address text NOT NULL,
 balance_stt numeric NOT NULL, callbacks_per_hour numeric, hours_remaining numeric,
 snapshot_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS engine_snapshots_latest ON engine_snapshots(engine_address, snapshot_at DESC);
-- Atomic checkpoint, last wallet states and measured burn sample survive restarts.
CREATE TABLE IF NOT EXISTS watcher_state (
 engine_address text PRIMARY KEY, checkpoint bigint NOT NULL,
 block_hash text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_challenges (
 token_hash text PRIMARY KEY, address text NOT NULL,
 message text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, address text NOT NULL REFERENCES wallets(address),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
