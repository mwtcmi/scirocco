# Shared Mountain Run podiums

The game uses `https://scirocco799-leaderboard.mr-mikewhite.workers.dev`. The Worker uses the existing D1 binding named **DB**. Website hosting and the main website pages stay unchanged.

## Publish through the Cloudflare dashboard

1. Open **D1 SQLite Database → scirocco799-leaderboard → Console**.
2. Copy the entire contents of [schema.sql](schema.sql), paste into the SQL console, and run it. It creates the tables without deleting existing records; rerunning it is safe.
3. Open **Workers & Pages → scirocco799-leaderboard → Edit code**.
4. Replace the connection-test code with the entire contents of [worker.mjs](worker.mjs). This is a self-contained JavaScript module; it needs no package installation or other files in the Worker editor.
5. Click **Deploy**, then **Visit**. Expect:

   ```json
   {"ok":true,"service":"Scirocco 799 leaderboard","ruleset":"2027-v5"}
   ```

6. Open the game, select **PODIUMS**, and select **REFRESH**. An empty hill shows three open podium spots. Finish a new race, choose a driver name, and post the time. Check from a second browser/device that the time is shared.

The SQL must run before deploying the Worker. The existing `DB` binding is all that is required; no API keys, account tokens, signing secrets, custom domain, DNS changes, or additional Cloudflare products are needed for this version. The `wrangler` notice in the dashboard applies to command-line deployment; this setup uses the dashboard.

The game remains playable while the Worker still runs the connection test or the service is unavailable. It displays device-best status instead of a shared ranking. The shared service has only been verified locally until the dashboard publication and live checks above are complete.

## Scoring and driver experience

- Each venue has one best time per driver, a top-three podium, top twenty standings, and the driver's own rank even below twentieth.
- First place holds **King of the Hill** for that event. A new leader gets a crown message after the server accepts the result.
- The full-season podium requires all nine events. It ranks the sum of each driver's event bests. Replaying one event can improve that total. Equal times favor the earlier best; equal season totals favor the earlier completed set of bests, then a stable player ID as the final tiebreaker.
- Gameplay stays **V5**. Course layouts, length, hazards, physics, and apex behavior stay fixed. Scores use the separate `2027-v5` ruleset. A future physics change would need a different ruleset and leaderboard, while cosmetic changes can keep these records.
- Names use 2–18 characters and are unique ignoring case. Names appear publicly. Anonymous driver credentials are generated at the first shared run; only a hash of the private credential is stored in D1. A name is requested at the first finish. Skipping it allows racing to continue; the driver can post through PODIUMS later.
- The driver credential is remembered in the browser. Clearing browser data, using private browsing, or changing devices loses access to that driver; choose a different name for a new profile. Sign-in/recovery is outside this first version. If browser storage is unavailable, identity lasts for that page visit only.
- Existing device bests and season completion remain intact. Old device bests are not imported to the public board; a new run with a server ticket is required.
- Crashes never submit a result. Posted slower attempts never replace a faster best.
- A completed run whose finish request loses its connection waits in the browser and retries on reconnect, Refresh, or reload. Tickets expire two hours after starting. An offline run without a ticket remains a device best. At most ten unposted runs wait in the browser.
- Opening PODIUMS while racing pauses the game and releases held controls. Closing it leaves the game paused until Resume is pressed. Close/Back controls stay accessible on small screens while the standings scroll.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` or `/api/health` | Check deployed service and schema version |
| POST | `/api/players` | Issue an anonymous driver ID and private bearer credential |
| POST | `/api/profile` | Set/update the authenticated driver's public name |
| POST | `/api/runs` | Issue a two-hour ticket for a venue and ruleset |
| POST | `/api/runs/:id/finish` | Validate and accept a completed run; return event standings |
| GET | `/api/leaderboard?event=pagoda` | Get event standings; use `event=season` for season totals |

Leaderboard reads accept an optional public `player` ID to include that driver's rank and season progress. Authenticated requests use `Authorization: Bearer <private credential>`. Credentials are never returned by the public standings API.

The Worker allows browser requests from `https://scirocco799.com`, `https://www.scirocco799.com`, and `https://mwtcmi.github.io`. Other site origins are rejected. Optional Worker variable `ALLOWED_ORIGINS` can add comma-separated development origins; production needs no extra variable. CORS is a browser access policy, not proof that a result is legitimate.

## Validation and limits

Tickets belong to a driver, event, and fixed ruleset. Finishing is idempotent: retrying the same result does not create another score, and changing an already-posted ticket is rejected. D1 batches update run history and event bests atomically. Times must be integer milliseconds between the theoretical 31.250-second limit and twenty minutes. Apex counts must fit the selected course. Server elapsed time is checked with a five-second allowance for the asynchronous ticket request/network delay; pause time is allowed. Ticket requests and name/account creation are limited, and request bodies are capped at 4 KiB. Raw IP addresses are not saved; hashed hourly counters expire and are cleaned up on new runs.

This is a casual browser-game leaderboard. Client simulation cannot be made cheat-proof by these checks. A determined player can fabricate plausible results. Prize competitions would require stronger verification, such as server replay of recorded controls. The owner can remove inappropriate names or suspicious records in D1.

## Owner moderation

All moderation stays in the authenticated Cloudflare D1 console; there is no public admin endpoint. `players.id` is the public `playerId` in a standings response.

Remove a driver and their runs/scores (irreversible; inspect the exact ID first):

```sql
SELECT id, name FROM players WHERE id = 'DRIVER-UUID';
DELETE FROM players WHERE id = 'DRIVER-UUID';
```

To remove one suspicious run and restore that driver's next best on the same hill, inspect its ID, mark it disqualified, and rebuild the one event best. Replace both UUID placeholders and the event ID:

```sql
SELECT id, player_id, event_id, time_ms FROM runs WHERE id = 'RUN-UUID';
UPDATE runs SET disqualified = 1 WHERE id = 'RUN-UUID';
DELETE FROM event_bests
WHERE player_id = 'DRIVER-UUID' AND event_id = 'pagoda' AND ruleset = '2027-v5';
INSERT INTO event_bests (player_id, event_id, ruleset, time_ms, apexes, achieved_at, run_id)
SELECT player_id, event_id, ruleset, time_ms, apexes, finished_at, id FROM runs
WHERE player_id = 'DRIVER-UUID' AND event_id = 'pagoda' AND ruleset = '2027-v5'
  AND disqualified = 0 AND finished_at IS NOT NULL
ORDER BY time_ms, finished_at, id LIMIT 1;
```

The next public read recalculates the hill and season podiums. Rerunning a rejected ticket cannot restore a disqualified result.

## Local verification

Node.js 24 provides SQLite for the tests; the site itself has no build step or new runtime dependencies.

```sh
node --test tests/leaderboard.test.mjs tests/mountain-run.test.cjs
```

With the static site running, Playwright and Chromium available:

```sh
GAME_URL=http://127.0.0.1:8000/mountain-run/ node tests/leaderboard.browser.cjs
node tests/mountain-run.browser.cjs
node tests/mountain-run.mobile.cjs
```

The API tests execute the production Worker's fetch handler and real SQL against SQLite through a D1-compatible test adapter. Browser tests route requests to that same handler; they do not publish scores to the live service. They verify two independent player browsers, real driving, naming, podiums, persistence/retry, pause/input isolation, mobile fit, and crash exclusion. Local tests do not substitute for the Cloudflare deployment check above.
