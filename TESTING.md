# Testing

## Run the implemented unit suite

Run `npm run test:unit` from the project directory. No .env file, database, SMTP account,
or Databento account is needed. Node's built-in runner and strict assertions are used.

The suite covers independent logic plus configuration and external-service boundaries.
Configuration tests use fresh child processes with explicit dummy settings and no inherited
credentials. Socket connections and real fetch requests are blocked in those processes.
Database query/acquisition and email delivery recorders throw at the boundary: these tests
check validation, arguments, and error propagation, not SQL results or real message delivery.
The rate-limit checks record library configuration and handlers, not live HTTP traffic.

The support helper is in `test/support/isolated-process.js`. Test files end in `.test.js`.
`npm test` uses Node's default discovery, which can also report support files; `test:unit`
selects only the unit test files. Keep future integration tests in a separately selected location.

Current implementation: 65 passing tests including nested rate-limit checks. See TEST-PLAN.md
for the broader backlog. Database results, transaction commit/rollback behavior, provider response
processing, and actual browser interaction still need their respective follow-up tests.

## Remaining testing backlog

Use Node's built-in `node:test` runner unless the project later needs a browser-specific test tool.
Keep unit tests independent of the live Postgres database and Databento account.

## Highest priority

- Trade validation and calculations: malformed payloads, quarter-point prices, candle bounds,
  scaling, reversals, breakeven trades, and mismatched buy/sell contract totals.
- Statistics: empty histories, all-winning and all-losing histories, process deviation,
  scaling-event counts, averages, and deleting a submitted trading day.
- Password resets: invalid, expired, reused, and concurrent tokens; session invalidation; and
  SMTP failure without account enumeration.
- Transactions: successful commit, operation failure, rollback, and rollback failure while
  preserving the original error.
- Session and authentication behavior: cookie flags, expiration, invalidation, missing users,
  and API versus page responses.

## Market-data services

- Databento NDJSON parsing, malformed records, request failures, and timeouts.
- Status-event interpretation for normal, shortened, closed, unavailable, and unsupported days.
- Candlestick validation for ordering, duplicate timestamps, incomplete ranges, invalid OHLC
  relationships, and five-minute aggregation boundaries.
- Promise locks: concurrent success, concurrent failure, cleanup, and retry after rejection.
- Data-condition caching and the five-minute pending versus 24-hour stable refresh behavior.

## API and interface behavior

- API validation and status codes, including malformed JSON and unauthenticated requests.
- Analyze-card order validation and persistence.
- Visualization axis compatibility, date filtering, slope, maximum drawdown, rates, and empty data.
- Input-page draft behavior and server-side rejection of modified or incomplete trade summaries.
- Trades-page pagination, selection, deletion, degraded chart access, and stale request handling.
- Canvas and SVG interaction checks for resizing, crosshairs, marker collision, and empty datasets.

## Deployment checks

- Nginx proxy/IP behavior before enabling Express `trust proxy` in production.
- Rate limits behind the proxy and across restarts or multiple Node processes.
- Production cookies, HTTPS redirects, CSP, SMTP, Postgres TLS, backups, and restore drills.
