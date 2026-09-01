CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    creation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hashed_token TEXT NOT NULL UNIQUE,
    creation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_time TIMESTAMPTZ NOT NULL,
    invalidated_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reset_password_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hashed_token TEXT NOT NULL UNIQUE,
    request_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_time TIMESTAMPTZ NOT NULL,
    reset_time TIMESTAMPTZ,
    invalidated_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_change_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    change_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_change_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_email VARCHAR(255) NOT NULL,
    new_email VARCHAR(255) NOT NULL,
    change_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    color_scheme VARCHAR(20) NOT NULL DEFAULT 'light',
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candlesticks (
    id BIGSERIAL PRIMARY KEY,
    open_time TIMESTAMPTZ NOT NULL UNIQUE,
    open_price NUMERIC(10, 2) NOT NULL,
    high_price NUMERIC(10, 2) NOT NULL,
    low_price NUMERIC(10, 2) NOT NULL,
    close_price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS trading_sessions (
    trading_date DATE PRIMARY KEY,
    state VARCHAR(10) NOT NULL
        CHECK (state IN ('normal', 'shortened', 'closed')),
    open_time TIMESTAMPTZ,
    close_time TIMESTAMPTZ,
    candlesticks_synced_time TIMESTAMPTZ,
    candlesticks_retry_time TIMESTAMPTZ,
    data_condition VARCHAR(10)
        CHECK (
            data_condition IN (
                'available',
                'degraded',
                'pending',
                'missing'
            )
        ),
    data_condition_checked_time TIMESTAMPTZ,
    CHECK (
        (
            state = 'closed' AND
            open_time IS NULL AND
            close_time IS NULL
        )
        OR
        (
            state IN ('normal', 'shortened') AND
            open_time IS NOT NULL AND
            close_time IS NOT NULL AND
            open_time < close_time
        )
    )
);

CREATE TABLE IF NOT EXISTS user_trading_days (
    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    trading_date DATE NOT NULL
        REFERENCES trading_sessions(trading_date),
    creation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, trading_date)
);

CREATE TABLE IF NOT EXISTS user_trades (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    trading_date DATE NOT NULL,
    side VARCHAR(5) NOT NULL CHECK (side IN ('long', 'short')),
    contract_count INTEGER NOT NULL
        CHECK (contract_count > 0),
    entries JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(entries) = 'array'),
    exits JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(exits) = 'array'),
    points NUMERIC (10, 3) NOT NULL,
    process_deviation BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT CHECK (length(notes) <= 1500),
    creation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id, trading_date)
        REFERENCES user_trading_days(user_id, trading_date)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_stats (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    trades_count INTEGER NOT NULL DEFAULT 0,
    points_count NUMERIC(10, 3) NOT NULL DEFAULT 0,
    days_traded_count INTEGER NOT NULL DEFAULT 0,
    days_total_count INTEGER,
    expectancy_per_contract NUMERIC(10, 3),
    expectancy_per_trade NUMERIC(10, 3),
    expectancy_with_process_deviation NUMERIC(10, 3),
    expectancy_without_process_deviation NUMERIC(10, 3),
    average_scale_ins NUMERIC(5,2),
    average_scale_outs NUMERIC(5,2),
    biggest_win_contract NUMERIC(10, 3),
    biggest_loss_contract NUMERIC(10, 3),
    biggest_win_trade NUMERIC(10, 3),
    biggest_loss_trade NUMERIC(10, 3),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
    ON user_sessions (user_id);

CREATE INDEX IF NOT EXISTS user_sessions_expiration_time_idx
    ON user_sessions (expiration_time);

CREATE INDEX IF NOT EXISTS reset_password_events_user_id_idx
    ON reset_password_events (user_id);

CREATE INDEX IF NOT EXISTS reset_password_events_expiration_time_idx
    ON reset_password_events (expiration_time);

CREATE INDEX IF NOT EXISTS password_change_events_user_id_idx
    ON password_change_events (user_id);

CREATE INDEX IF NOT EXISTS password_change_events_change_time_idx
    ON password_change_events (change_time);

CREATE INDEX IF NOT EXISTS email_change_events_user_id_idx
    ON email_change_events (user_id);

CREATE INDEX IF NOT EXISTS email_change_events_change_time_idx
    ON email_change_events (change_time);

CREATE INDEX IF NOT EXISTS user_trades_user_id_trading_date_idx
    ON user_trades (user_id, trading_date);
