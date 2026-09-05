# Trade Tank test plan

This is a behavior checklist based on the current working tree, not a completed test suite.
Use it alongside TESTING.md. No application changes or test implementations accompany this plan.
A checkbox can become one test or several table-driven cases. It is not a target test count.

## Approach and preparation

Use node:test and node:assert/strict. Keep CommonJS, four-space indentation, descriptive names,
and lines of at most 100 characters. Test observable behavior rather than private function names.
Do not export private helpers just to test them. Do not copy production algorithms into assertions.

The user's preference is to avoid fake databases. Under that approach:

- Run independent JavaScript logic as unit tests with no database queries.
- Run database-dependent behavior against a dedicated disposable PostgreSQL test database.
  Those are integration tests, even if a test calls just one service function.
- Databento and email require controlled local responses or injected clients for offline tests.
  A test database does not replace these external dependencies. Never contact live providers.
- If database test doubles are later accepted, some integration scenarios can also receive isolated
  unit tests for orchestration and failure handling. These cannot establish SQL correctness.

Preparation notes (database-importing modules can wait until after isolated learning tests):

1. Correct the assertion import in test/services/trading-sessions.test.js:
   `const assert = require("node:assert/strict");`
   The current destructured `{ assert }` import does not retrieve the assertion module.
   The existing `{ test }` import is valid. There are no test bodies yet in the four files.
2. Decide how to handle services/db.js requiring DATABASE_URL on import. A temporary unused URL
   permits the original date and candle tests without queries, but does not block connections.
   A cleaner optional change is lazy pool initialization: importing a service needs no database
   configuration; the first actual database operation creates the pool. Keep startup validation
   explicit so deployment configuration errors remain visible. This change is proposed, not made.
3. Use fixed input Dates for date tests and controlled promises for locks. Do not use real sleeps.
4. Do not import server.js in unit tests: it loads dotenv and immediately opens a listening socket.
5. Use the ten isolated learning tests below; defer database-importing modules for now.

Preparation before the larger suite:

- Separate unit and integration commands so a normal unit run never selects database tests.
  The current `npm test` is `node --test`, which will discover both unless narrowed later.
- Keep existing test/services files for learning. Add test/utilities, test/middleware, and
  test/browser-logic as needed. Put database and HTTP tests in a separately selected integration
  directory. Store reusable sample data under test/fixtures and setup under test/support.
- Provide harmless test-only APP_ORIGIN and SESSION_SECRET before importing CSRF/session modules.
  They currently read required configuration during import. Restore altered environment state.
- Arrange offline HTTP and email substitutes before loading modules that capture dependencies.
  Many CommonJS imports destructure functions; changing an exported function afterward may not
  change the reference already held by its caller. Prefer explicit dependency parameters/factories
  where needed, discussed first. Avoid broad require.cache replacement as the default design.
- Reset caches, request state, timers, transporters, and mocks between tests. Do not concurrently
  run tests that mutate the same process-wide configuration or module state.
- For browser logic, agree on a way to load the actual source without running page initialization.
  TradeDraft is a browser class with no CommonJS export; most other files immediately run DOM code.
  A guarded export for an existing public class is one option to discuss. Do not expose all helpers
  or reproduce a complete browser using hand-written objects just to claim unit coverage.
- Use small, hand-calculated fixtures: long/short wins and losses, unequal contract sizes,
  breakeven trades, two trading days, scheduled statuses, candles, and malformed provider records.
- Add a fail-fast guard at the application's external I/O boundaries for unit runs. An unused URL
  alone is not this guard. Verify the guard before using broad automatic test discovery.
- Establish a baseline run before changing business behavior. A failing test can uncover a bug or
  an unclear requirement; do not automatically rewrite its expectation to match the implementation.

Preparation for the optional real database suite:

- Use a local isolated PostgreSQL instance and a dedicated role without live-database access.
- Require TEST_DATABASE_URL with no fallback to the normal application DATABASE_URL.
- If using a local .env.test, ignore it before creating it. Current .gitignore ignores only .env,
  not .env.test. Commit placeholders only. No credential file needs to be read by this assistant.
- Create tables from db/schema.sql in that disposable environment, seed known rows, and arrange
  cleanup. Do not reuse scripts/db-init.js or scripts/db-check.js unchanged: they load normal .env.
- Keep tests isolated with separate databases/schemas or an agreed reset strategy. A transaction
  rollback around a test will not contain service writes made through unrelated pool connections.
- Close clients and pools. Use independent connections for actual concurrency/row-lock tests.

## Unit checklist: available logic and early priorities

### Account input utilities — utilities/validation.js

- [ ] getStringInput preserves strings, including whitespace, and returns empty for other types.
- [ ] Username lengths: empty, 1, 32, and 33 characters.
- [ ] Email accepts valid basic shapes and rejects missing parts, whitespace, and repeated @ signs.
- [ ] Email length boundary: 255 versus 256 characters with otherwise valid shapes.
- [ ] Password lengths: empty, 1, 128, and 129 characters; preserve spaces and Unicode input.
- [ ] Reset tokens: exactly 64 lowercase hexadecimal characters versus wrong length/case/characters.
- [ ] Define raw non-string behavior for validators before adding defensive-input expectations;
      several validators currently assume getStringInput has already normalized their input.

### Trading dates — services/trading-sessions.js

- [ ] Original test 1: accept 2026-09-01.
- [ ] Original test 2: weekends, impossible dates, missing zeroes, wrong order, empty, non-strings.
- [ ] Accept a valid leap-day weekday and reject invalid leap days/month and day boundaries.
- [ ] Original test 3: the instant before and at New York midnight yields the correct date.
- [ ] Cover winter and summer UTC offsets, and date formatting across year boundaries.
- [ ] Invalid Date and non-Date arguments to getNewYorkDate throw.
- [ ] Verify the default current date using controlled time, independent of the machine timezone.
- [ ] Document that weekday validation does not determine exchange holidays or inception
      eligibility.

### Candle calculations — services/price-data.js

- [ ] Original test 4: five ordered candles produce expected open/high/low/close and interval time.
- [ ] Original test 5: crossing an exact five-minute boundary creates separate output candles.
- [ ] Original test 6: duplicate/reversed times, invalid OHLC relationships, and non-array input.
- [ ] Empty aggregation input returns an empty array.
- [ ] Single-candle and partial intervals preserve their actual OHLC values; no invented candles.
- [ ] Interval flooring works across hour/day boundaries and equivalent timezone representations.
- [ ] Reject invalid dates, missing candle objects, NaN/Infinity, and nonnumeric OHLC values.
- [ ] Equal open/high/low/close prices remain valid.
- [ ] Aggregation does not mutate source candles or their Date objects.
- [ ] Original test 7: valid range response; duplicates, out-of-range times, invalid OHLC,
      non-minute times, and empty responses.
- [ ] Range start is included; range end is excluded.
- [ ] Seconds and milliseconds must both be zero; candle times must be Date objects here.
- [ ] Reject invalid, equal, reversed, or non-Date range boundaries and non-array responses.
- [ ] Reject missing first, middle, or last minutes, extra candles, and sparse array slots.
- [ ] saveCandlesticks rejects malformed input and returns zero for an empty array without querying.

### Promise locks — services/promise-lock.js

- [ ] Original test 8: simultaneous same-key calls execute once and both receive the value.
- [ ] Success removes the completed operation from the map.
- [ ] Original test 9: rejection reaches both callers unchanged, clears the map, and allows retry.
- [ ] Different keys run independently.
- [ ] A pre-existing pending entry is reused without invoking the new operation factory.
- [ ] Completion does not delete a newer replacement promise stored under the same key.
- [ ] A synchronously throwing operation factory leaves no stale lock and allows retry.
- [ ] Results such as zero, false, null, and undefined are preserved.
      Check shared work/results, not equality of callers' outer Promise objects.

### Password hashing — services/password.js

- [ ] hashPassword output has the expected salt/hash representation, not the input password.
- [ ] A password verifies against its own hash; a different password does not.
- [ ] Hashing the same password twice produces different salted values that both verify.
- [ ] Spaces, Unicode, and valid length boundaries round-trip without normalization.
- [ ] Missing hash parts, malformed hexadecimal data, and wrong derived-key lengths fail safely.
- [ ] Cryptographic failures propagate as rejections using controlled failures if needed.
      Use real local crypto for normal behavior; do not test library internals or timing security.

### Small shared utilities — utilities/messages.js and utilities/redirects.js

- [ ] Known message keys return their configured messages; unknown/missing keys return empty text.
- [ ] Redirect parameters preserve values containing spaces, &, =, #, Unicode, and URL characters.
- [ ] redirectWithQuery returns the response's redirect result.
      A tiny response recorder is sufficient; no Express server or database is involved.

### Same-origin middleware — middleware/csrf.js

- [ ] GET, HEAD, and OPTIONS continue without origin headers.
- [ ] POST, PUT, PATCH, and DELETE accept the configured Origin and reject another Origin.
- [ ] Similar domains, different schemes, and different ports are not the same origin.
- [ ] An explicitly foreign Origin is not overridden by a trusted Referer.
- [ ] Missing Origin with same-origin Referer continues; malformed/foreign/missing Referer rejects.
- [ ] Specify and test the existing Origin: null fallback behavior.
- [ ] Rejection sends 403 once without calling next; acceptance calls next once.
- [ ] Missing or invalid APP_ORIGIN fails configuration in an isolated import test.

## Unit candidates requiring access to dependencies or browser code

These are unit behaviors, but not all can currently be reached without database work or DOM setup.
Under the no-fake-database preference, cover database-dependent entry points as integration tests.
Private helpers below describe behavior to reach through public operations, not proposed exports.

### Trade validation and formatting — services/trades.js

- [ ] Invalid user IDs, dates, and pages reject before querying.
- [ ] Original test 10: page 2 requests six rows at offset five, displays five, reports hasNext,
      preserves page, and converts numeric columns. Use a test database if avoiding a fake query.
- [ ] Pagination with zero, fewer than five, exactly five, and six rows; final and later pages.
- [ ] Numeric conversion includes fractional/negative points and points per contract.
- [ ] Missing trading days return false; no latest day returns null.
- [ ] Empty/non-array trade lists and malformed trade objects reject before starting a transaction.
- [ ] Only long/short trades and well-formed nonempty buy/sell collections are accepted.
- [ ] Reject invalid order dates, nonpositive/non-quarter prices, nonfinite prices,
      and fractional/nonpositive/unsafe contract counts.
- [ ] Require balanced bought/sold totals across multiple orders with unequal sizes.
- [ ] Recalculate wins, losses, breakeven, long/short, scale-in, and scale-out results from orders.
- [ ] Ignore forged browser contract totals and point totals; discard extra order fields.
- [ ] Normalize order timestamps to ISO; do not mutate submitted data.
- [ ] Require an exact candle time; accept prices at both high/low boundaries; reject outside
      prices.
- [ ] Validate processDeviation as a boolean; trim notes and enforce the 1500-character boundary.
- [ ] Specify missing/falsy non-string notes behavior and order chronology before adding assertions.
- [ ] A valid save writes the day and all trades, recalculates stats, and returns saved count.
- [ ] Delete returns false and skips recalculation for no row, true and recalculates for deletion.
- [ ] Save/delete failures propagate and do not report success.

### Transaction control — services/db.js

- [ ] Reject a nonfunction operation before acquiring a client.
- [ ] Success sequence: acquire, BEGIN, operation, COMMIT, release; preserve operation result.
- [ ] Operation rejection triggers ROLLBACK, preserves the error, and releases the client.
- [ ] BEGIN or COMMIT failure triggers appropriate cleanup and does not report success.
- [ ] ROLLBACK failure preserves the original error and still releases the client.
- [ ] Client acquisition failure propagates without trying to use a nonexistent client.
- [ ] Specify release-failure behavior if the original operation also failed.
      Exact failure sequencing is easiest with a recording client. Without one, verify actual
      atomicity in PostgreSQL integration tests rather than pretending a unit test covers it.

### Statistics response mapping — services/stats.js

- [ ] Invalid user IDs and missing/invalid recalculation clients reject.
- [ ] Missing statistics row raises the expected error.
- [ ] Convert every numeric database value, preserving null rather than converting it to zero.
- [ ] Preserve zero and negative values and fractional rates correctly.
- [ ] Recalculation uses the supplied transaction client and propagates failures.
      Actual totals, averages, scaling metrics, and elapsed-day arithmetic are SQL integration
      tests.

### Visualization calculations — services/visualizations.js

- [ ] Validate every allowed/disallowed axis pair, including matching-axis exclusions and day axes.
- [ ] Reject invalid IDs, malformed dates, and reversed ranges; allow omitted/equal valid
      boundaries.
- [ ] Empty history: empty points, null slope/range dates, zero drawdown, correct flags.
- [ ] Sort by trading date, earliest order time, then numeric ID; test equal-time ties.
- [ ] Fall back to the trading-date timestamp when no valid order time exists.
- [ ] Cumulative points and expected values per contract, trade, and trading day.
- [ ] Counts/rates for wins, losses, breakeven, long/short, process adherence, and scaling.
- [ ] Test every supported y-axis against hand-calculated fixtures, including unequal trade sizes.
- [ ] Day counts increment once per date; day win/loss classification uses the complete day.
- [ ] Day-only output contains one point per completed trading day.
- [ ] Cumulative x axes behave when consecutive trades leave the x value unchanged.
- [ ] Slope: rising, falling, flat, one point, repeated x values; time slopes measured per day.
- [ ] Drawdown: initial loss from zero, increasing values, new peaks, recoveries, repeated declines.
- [ ] Correct xIsTime/yIsRate flags and availableFrom/availableTo dates.
      This logic currently lives behind getUserVisualization, which always queries PostgreSQL.
      No fake database means integration coverage unless a calculation API is deliberately designed.

### Databento adapter — services/databento.js

- [ ] Recognize only available/degraded/pending/missing conditions.
- [ ] Scheduled statuses: filter invalid times/reasons/events/trading flags, deduplicate, sort.
- [ ] Preserve opposite trading flags at one timestamp; decide precedence in session interpretation.
- [ ] Non-array scheduled-status input rejects; empty input returns empty output.
- [ ] Public fetch operations parse valid NDJSON with blank lines and both newline conventions.
- [ ] Malformed JSON rejects the response rather than returning partially parsed records.
- [ ] Convert numeric price/status fields; malformed/missing fields remain detectably invalid.
- [ ] Verify request schema, symbol, dataset, date boundaries, method, encoding, and auth header
      using a test-only dummy API key and an offline request recorder.
- [ ] Non-success HTTP status, transport rejection, body decoding error, and timeout propagate.
- [ ] Condition lookup selects the requested date and rejects absent/unknown conditions.
- [ ] Metadata range checks accept exact boundaries and reject ranges outside availability.
- [ ] Invalid schema/date/order rejects; malformed metadata dates produce unavailable results.
- [ ] Missing API key fails without making a request.
      Exercise private parsing helpers through exported operations with controlled fetch responses.

### Trading-session resolution — services/trading-sessions.js

- [ ] Return a cached stored session without fetching statuses again.
- [ ] Dates before inception return unsupported and are not stored as resolved sessions.
- [ ] Unavailable status ranges return unavailable and are not saved.
- [ ] Latest relevant state at/before opening determines normal/closed/unavailable behavior.
- [ ] Trading halt within planned hours yields shortened; at planned close does not shorten.
- [ ] Ignore irrelevant/unscheduled statuses and duplicate records.
- [ ] Closed sessions have null boundaries; open sessions have valid ordered boundaries.
- [ ] Concurrent resolution shares work and can retry after failure.
- [ ] Valid resolved sessions are saved and reread; invalid states/boundaries reject.
- [ ] Marking synced, delaying retry, and updating condition validate dates and report missing rows.
- [ ] Update condition accepts all four known values and rejects unknown/non-string values.
      These public workflows need controlled dependencies or the integration environment.

### Candlestick synchronization — services/candlestick-sync.js

- [ ] Closed, unavailable, and unsupported sessions return no candles and skip downloads.
- [ ] Fresh pending condition lasts five minutes; other known conditions last 24 hours.
- [ ] Exact expiration, invalid/missing checked times, and invalid conditions trigger refresh.
- [ ] Concurrent condition refreshes share work; failures clear locks for retry.
- [ ] Future retry deadline suppresses downloads; exact deadline/expired/invalid dates allow retry.
- [ ] Pending versus degraded/missing conditions produce correct states without saving candles.
- [ ] Unavailable provider range yields pending without fetching candles.
- [ ] Invalid provider candles schedule retry and are not saved or marked synced.
- [ ] Valid candles are saved before marking synced; failures do not prematurely mark success.
- [ ] Concurrent first sync downloads once, then callers read saved candles.
- [ ] Already-synced days read saved candles and refresh quality status without downloading again.
- [ ] Latest search skips weekends and unusable dates and stops at its 14-calendar-day limit.
- [ ] Latest search requires both available candles and available data quality.
- [ ] Latest-result cache expires after five minutes and on a New York date change.
- [ ] Concurrent latest searches share work; failure permits retry; no-result shape stays
      consistent.
      Use controlled clocks and dependencies. Module-level caches need isolated lifetime per test.

### Chart response rules — services/chart-data.js

- [ ] Input permits submission only for unsubmitted days with available candles and quality.
- [ ] Already-submitted input remains uneditable.
- [ ] Input hides degraded/pending/missing/unavailable candles.
- [ ] Trades with no submitted day return early without resolving market data.
- [ ] Trades show available or degraded saved candles, retaining the quality flag.
- [ ] Trades hide unavailable/pending/missing candles without losing the hasTrades indication.
- [ ] Returned visible candles are aggregated to five minutes.
- [ ] Latest input handles no date, submitted dates, and unsubmitted dates correctly.
- [ ] Dependencies rejecting do not produce a successful or partially trusted chart response.

### Sessions and authentication — services/session.js, middleware/authentication.js

- [ ] Missing, empty, malformed, and badly percent-encoded cookies do not crash authentication.
- [ ] Tokens must be 64 lowercase hexadecimal characters; malformed tokens skip database work.
- [ ] New sessions store the HMAC rather than the raw token and use correct expiration durations.
- [ ] Returned database IDs become positive safe numbers; missing/invalid IDs produce null.
- [ ] Request authentication caches both a user ID and null, avoiding repeated lookup.
- [ ] Cookie flags: Path, HttpOnly, SameSite, Priority, production Secure, and deletion Max-Age.
- [ ] Both cookie choices persist: one-day Max-Age normally, thirty days with Remember me.
- [ ] Session creation failure does not emit a valid login cookie.
- [ ] Logout invalidates the current session and clears cached authentication.
- [ ] Invalidate-all returns affected count; invalidate-others requires a valid current token.
- [ ] Protected pages redirect missing sessions; API authentication returns JSON 401.
- [ ] Missing users clear cookies; optional authentication still allows public pages.
- [ ] Logged-in visitors redirect away from login/signup; guests may continue.
- [ ] Loaded users receive market-data permission and a default tank color scheme when needed.
- [ ] Protected responses receive no-store headers.
- [ ] Missing market-data permission/user returns 403 and does not reach the restricted operation.
- [ ] Middleware errors reach next(error) without continuing or sending duplicate responses.
      Expiration filtering and actual invalidation require SQL integration checks as well.

### Email — services/email.js

- [ ] Missing SMTP configuration and invalid port boundaries reject without delivery.
- [ ] Port 465 selects implicit TLS; port 587 requires STARTTLS; sender fallback is correct.
- [ ] Transporter is created lazily and reused; isolate its cached state between cases.
- [ ] Reset email has correct recipient, URL, text/HTML bodies, and 15-minute message.
- [ ] Email change notifies both old and new addresses with their appropriate messages.
- [ ] Password-change notification has the correct recipient and no password/token disclosure.
- [ ] Delivery failures propagate to callers; no live sendMail is allowed.
      Use an injected recording sender or intercept transport construction before sending.

### Browser draft state — public/js/trade-draft.js

- [ ] New/cleared draft has no trades, position, or undo history.
- [ ] Buy opens long; sell opens short; invalid orders leave state and history unchanged.
- [ ] Same-side order scales in; smaller opposite order scales out.
- [ ] Exact opposite size completes a trade; larger size splits close and reversal correctly.
- [ ] Reversal works both directions, preserving prices/times and dividing contract counts.
- [ ] Net contract count, active state, and completed counts remain correct through sequences.
- [ ] Reject starting another active trade and completing an absent/open trade.
- [ ] Submission rejects empty/open drafts and returns a deep copy of completed trades.
- [ ] Active details require an open trade, boolean deviation, and notes up to 1500 characters.
- [ ] Undo restores the exact prior state for open, scaling, close, and reversal operations.
- [ ] Repeated undo exhausts history safely; clear removes undo availability.
- [ ] Completed-note edits validate index/type/length and survive undo through prior snapshots.
- [ ] Display copies/marker lists preserve order-side labels without exposing mutable draft state.
- [ ] Caller changes to supplied order objects do not alter recorded orders.

### Browser calculations and response handling

- [ ] Date parsing/formatting: strict format, impossible dates, leap years, leading zeroes.
- [ ] Month boundaries cross years correctly; range checks include endpoints.
- [ ] Date clamping copies values and handles before/inside/after range without mutation.
- [ ] Weekday selection agrees with server weekday rules for supported dates.
- [ ] readAPIResponse handles JSON success/errors, non-JSON errors, 204, and broken JSON.
- [ ] Password confirmation clears previous validity and identifies mismatches.
- [ ] Statistics formatting covers null, zero, negative values, percentages, and singular/plural.
- [ ] Visualization numbers/dates/rates handle nonfinite values, rounding, and New York time.
- [ ] Browser/server supported axis relationships agree.
- [ ] Candlestick price/y conversion round-trips and quarter-point crosshair snapping is bounded.
- [ ] Candle selection handles edges, right padding, one candle, and points outside the plot.
- [ ] Marker grouping combines same side/time/price, sums contracts, and preserves separate prices.
- [ ] Marker labels sort by price without mutating source events and use correct buy/sell prefixes.
- [ ] Collision calculations keep labels clear of candles/other labels or return no available slot.
- [ ] Empty/flat price ranges and crowded marker padding remain finite.
      Only unit-test calculations with a small deliberate interface. Actual canvas/SVG output and
      DOM events belong in browser checks; do not assert thousands of drawing calls.

## HTTP/application checklist — separate from isolated units

Prefer exercising public routes over exporting their private handlers. A future app factory would
allow app creation without dotenv/listen; server.js would remain the production startup entry.
These HTTP checks can use node:test, but they are application/integration tests, not offline units.

- [ ] Login: missing/invalid input, unknown user, wrong password, valid login, Remember me,
      session errors, and account limiter reset only after successful verification.
- [ ] Signup: normalization, mismatched fields, duplicate username/email, uniqueness races,
      creation of preferences/stats, rollback, and login after successful creation.
- [ ] Logout clears the browser cookie even when invalidation fails.
- [ ] Forgot-password requests for known/unknown accounts have the same confirmation; delivery and
      database errors do not disclose account existence through a different result.
- [ ] Reset page rejects malformed/unknown/expired/used/invalidated tokens and validates new input.
- [ ] Successful reset changes the password, consumes/invalidate links, and invalidates sessions;
      notification failure after commit does not turn the change into an apparent failure.
- [ ] Profile handles deleted users, default preferences, allowed themes, email normalization,
      mismatches, unchanged/duplicate email, password rules, and exact DELETE confirmation.
- [ ] Profile changes record account events; password changes retain only the current session.
- [ ] Market-data APIs require both authentication and permission; saved trade details remain
      accessible without market-data permission, as intended by the current route structure.
- [ ] API date/page validation rejects malformed and overflow inputs; defaults/latest dates work.
- [ ] Trade submission requires JSON (415), validates input (400), returns 201 on save, and 409
      for previously submitted days or unavailable data, including uniqueness conflicts.
- [ ] Delete returns 204 for a deleted day and 404 for no matching day.
- [ ] Analyze order accepts exactly one of every allowed stat name; rejects missing/duplicate/extra
      names and malformed input; successful update returns 204.
- [ ] Signup availability normalizes inputs and independently reports username/email availability.
- [ ] Public/info/app routes select correct layouts, current-page flags, themes, and date bounds.
- [ ] Unknown routes use 404; invalid/oversized bodies use 400/413; unexpected errors use 500.
- [ ] API errors use JSON; page errors use text; headersSent delegates without another response.
- [ ] Verify security headers and middleware ordering through requests, not library implementation.
- [ ] Rate limits: boundaries, different users/IPs/accounts, successful-login reset, timeout reset,
      429 body/redirect shape, valid retained fields, and independent counters across test cases.

## PostgreSQL integration checklist

- [ ] Schema constraints reject invalid trade/session records and enforce unique user/day keys.
- [ ] User/date filters prevent reading or deleting another user's data.
- [ ] Pagination returns the correct ordered slices with six-row lookahead and numeric conversion.
- [ ] Candle range query includes start/excludes end; bulk insertion is idempotent and reports
      count.
- [ ] Session upserts preserve resolved data and update only eligible open-session rows.
- [ ] Planned New York market hours are correct across daylight-saving transitions.
- [ ] Trade-day save is atomic, rejects duplicate submissions, and updates stats in the same commit.
- [ ] Day deletion cascades to trades and recalculates stats; missing deletion changes nothing.
- [ ] Stats: empty history, one trade, all wins/losses, breakeven, multiple days, weighted contract
      inputs, deviation groups, long/short scaling counts, zero denominators, and deleting last day.
- [ ] Days-total calculation uses New York calendar dates and includes its intended first day.
- [ ] Visualization query filters both date boundaries and isolates the selected user.
- [ ] Session lookup excludes expired/invalidated rows; invalidation affects only intended rows.
- [ ] Concurrent password resets consume a token only once using independent connections.
- [ ] Signup/account changes roll back completely on errors; duplicate races obey unique
      constraints.
- [ ] Account deletion cascades through user-owned records but leaves shared market data intact.
- [ ] Validate actual parameterized SQL and database type conversions; fake results cannot do this.

## Browser and deployment checklist

- [ ] Input: permitted actions, candle bounds, undo/reset, notes, saving, errors, and remembered
      date.
- [ ] Input: overlapping date loads cannot submit orders against mismatched chart/date state.
- [ ] Trades: pagination/selection/deletion, cached charts, degraded warning, and stale
      success/error
      responses after changing date, selection, page, or deleting a day.
- [ ] Visualize: axis restrictions, date controls, latest-request wins, empty/error state,
      crosshair.
- [ ] Analyze: display formatting, reorder threshold, unchanged-order no-op, queued saves/failures.
- [ ] Calendar/select controls: range-disabled choices, keyboard navigation, focus, Escape,
      outside clicks, selection events, and only one open popup.
- [ ] Account forms: validation, availability failures, deleted-account confirmation, Back/Forward
      password clearing, private-page reload, and query cleanup preserving reset tokens.
- [ ] Carousel wrapping, navbar scrolling/focus, resizing, canvas pixel ratio, SVG coordinates,
      marker collisions, responsive layouts, and accessibility require actual browser review.
- [ ] Templates escape user-provided notes/messages and connect controls to the intended endpoints.
- [ ] Deployment smoke checks cover startup/configuration, HTTPS/proxy behavior, schema readiness,
      provider configuration, backups/restores, and service availability. Unit tests are not these.

## Decisions and focused fixes

The following behavior is now explicit:

1. Candle validation requires exactly one valid candle for every minute from session open up to,
   but excluding, session close. Both boundaries must be exact minutes. Shortened sessions use
   their actual range. Partial five-minute aggregation remains a separate supported behavior.
   Previously synced database rows are not retroactively downloaded or repaired by this change.
2. Both session cookie choices persist across browser restarts: one day normally, thirty days
   with Remember me. The comment now matches the existing durations; cookie logic is unchanged.
3. Analyze averages each trade's points per contract equally. Visualize divides cumulative points
   by cumulative contracts. Comments now explicitly describe the different weighting; formulas
   are unchanged.
4. Signup blocks submission on failed or malformed availability responses. Changed account fields
   require another check; password/form validity is rechecked after waiting. Concurrent checks
   are suppressed. The server remains responsible for validation and unique constraints.
5. Input ignores stale load success/error responses, submits the loaded chart's date, and prevents
   chart replacement while a save is pending. Failed saves retain the draft and allow retry.

Still to decide: falsy non-string notes are normalized with `trade.notes || ""`; server order
validation checks balanced quantities and candle bounds, but not chronological position history.

## Ten isolated learning tests

These exported functions can be imported without a database, dummy DATABASE_URL, server startup,
or browser environment. No fake database or network service is needed. No tests have been written
for the user. Continue one at a time, reviewing work when the user says done.

1. utilities/validation.js: getStringInput preserves strings and returns empty for non-strings.
2. utilities/validation.js: isValidUsername accepts lengths 1 and 32, rejects 0 and 33.
3. utilities/validation.js: isValidEmail accepts an ordinary valid email and rejects malformed
   shapes using a table of cases.
4. utilities/validation.js: isValidPassword accepts lengths 1 and 128, rejects 0 and 129.
5. utilities/validation.js: isValidResetPasswordToken accepts 64 lowercase hexadecimal characters
   and rejects wrong length, uppercase, and non-hexadecimal characters.
6. services/password.js: hashPassword followed by verifyPassword accepts the original password.
7. services/password.js: verifyPassword rejects a different password against a valid stored hash.
8. services/databento.js: getScheduledDatabentoStatuses filters irrelevant records, removes exact
   duplicates, and returns relevant records in time order without reordering the input array.
9. services/promise-lock.js: simultaneous same-key callers share one operation, receive its result,
   and leave no pending map entry after completion.
10. services/promise-lock.js: shared rejection preserves the error, clears the map, and allows
   retry.

Suggested files: test/utilities/validation.test.js, test/services/password.test.js,
test/services/databento.test.js, and the existing test/services/promise-lock.test.js.
Only use node:test and node:assert/strict. Each lock test creates its own Map and controlled
   promise.
Password tests use real local crypto. The status test calls only the filtering function, not fetch.

Other ready isolated candidates: isValidDatabentoCondition, message lookup, redirect encoding,
additional password round-trip/malformed-hash cases, and additional promise-lock cases.

The original date and candle tests remain in the full backlog, but their modules currently import
services/db.js and therefore require configuration. Defer them for this strictly context-free
learning sequence. Also defer any operation that queries a table, even if only a single function
is called. TradeDraft needs a deliberate browser/CommonJS loading decision before direct imports.

After the user hands off, implement the remaining agreed isolated cases in small groups. Database,
provider-adapter, and browser coverage should wait for their respective setup decisions. Do not
silently introduce a fake database, expose private helpers, or restructure services to grow
   coverage.
