CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    creation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hashed_token TEXT NOT NULL UNIQUE,
    request_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_time TIMESTAMPTZ NOT NULL,
    reset_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_change_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    change_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_change_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_email VARCHAR(255) NOT NULL,
    next_email VARCHAR(255) NOT NULL,
    change_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    ip_address INET,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_time TIMESTAMPTZ,
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    color_scheme VARCHAR(20) NOT NULL DEFAULT 'light',
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    earnings NUMERIC (10, 3) NOT NULL,
    process_deviation BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT CHECK (length(notes) <= 1500),
    creation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_stats (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_trades INTEGER NOT NULL DEFAULT 0,
    total_earnings NUMERIC(10, 3) NOT NULL DEFAULT 0,
    total_days_traded INTEGER NOT NULL DEFAULT 0,
    days_since_first_trade INTEGER,
    expectancy_per_contract NUMERIC(10, 3),
    expectancy_per_trade NUMERIC(10, 3),
    expectancy_with_process_deviation NUMERIC(10, 3),
    expectancy_without_process_deviation NUMERIC(10, 3),
    average_scale_ins NUMERIC(5,2),
    average_scale_outs NUMERIC(5,2),
    biggest_win_per_contract NUMERIC(10, 3),
    biggest_loss_per_contract NUMERIC(10, 3),
    biggest_win_per_trade NUMERIC(10, 3),
    biggest_loss_per_trade NUMERIC(10, 3),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_data (
    id BIGSERIAL PRIMARY KEY,
    open_time TIMESTAMPTZ NOT NULL UNIQUE,
    open NUMERIC(10, 2) NOT NULL,
    high NUMERIC(10, 2) NOT NULL,
    low NUMERIC(10, 2) NOT NULL,
    close NUMERIC(10, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS password_reset_events_user_id_idx
    ON password_reset_events (user_id);

CREATE INDEX IF NOT EXISTS password_reset_events_expiration_time_idx
    ON password_reset_events (expiration_time);

CREATE INDEX IF NOT EXISTS password_change_events_user_id_idx
    ON password_change_events (user_id);

CREATE INDEX IF NOT EXISTS password_change_events_change_time_idx
    ON password_change_events (change_time);

CREATE INDEX IF NOT EXISTS email_change_events_user_id_idx
    ON email_change_events (user_id);

CREATE INDEX IF NOT EXISTS email_change_events_change_time_idx
    ON email_change_events (change_time);

CREATE INDEX IF NOT EXISTS login_rate_limits_expiration_time_idx
    ON login_rate_limits (expiration_time);
