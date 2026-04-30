CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    reset_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS email_change_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_email VARCHAR(255) NOT NULL,
    next_email VARCHAR(255) NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    changed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS login_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    login_identifier TEXT NOT NULL UNIQUE,
    ip_address INET,
    failed_attempt_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    color_scheme VARCHAR(20) NOT NULL DEFAULT 'light',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_trades (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    side VARCHAR(5) NOT NULL CHECK (side IN ('long', 'short')),
    total_contracts NUMERIC(5, 1) NOT NULL,
    initial_exit_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
    initial_entry_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
    actual_exit JSONB NOT NULL DEFAULT '{}'::jsonb,
    actual_entry JSONB NOT NULL DEFAULT '{}'::jsonb,
    result NUMERIC (10, 3) NOT NULL,
    process_deviation BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT CHECK (length(notes) <= 1500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_stats (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_trades INTEGER NOT NULL DEFAULT 0,
    total_result NUMERIC(10, 3) NOT NULL DEFAULT 0,
    total_days_traded INTEGER NOT NULL DEFAULT 0,
    days_since_first_trade INTEGER,
    expectancy_per_contract NUMERIC(10, 3),
    expectancy_per_trade NUMERIC(10, 3),
    expectancy_with_process_deviation NUMERIC(10, 3),
    expectancy_without_process_deviation NUMERIC(10, 3),
    avg_scale_ins NUMERIC(5,2),
    avg_scale_outs NUMERIC(5,2),
    biggest_win_per_contract NUMERIC(10, 3),
    biggest_loss_per_contract NUMERIC(10, 3),
    biggest_win_per_trade NUMERIC(10, 3),
    biggest_loss_per_trade NUMERIC(10, 3),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_data (
    id BIGSERIAL PRIMARY KEY,
    opened_at TIMESTAMPTZ NOT NULL UNIQUE,
    open NUMERIC(10, 2) NOT NULL,
    high NUMERIC(10, 2) NOT NULL,
    low NUMERIC(10, 2) NOT NULL,
    close NUMERIC(10, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS password_reset_events_user_id_idx
    ON password_reset_events (user_id);

CREATE INDEX IF NOT EXISTS password_reset_events_expires_at_idx
    ON password_reset_events (expires_at);

CREATE INDEX IF NOT EXISTS email_change_events_user_id_idx
    ON email_change_events (user_id);

CREATE INDEX IF NOT EXISTS email_change_events_expires_at_idx
    ON email_change_events (expires_at);

CREATE INDEX IF NOT EXISTS login_rate_limits_blocked_until_idx
    ON login_rate_limits (blocked_until);
