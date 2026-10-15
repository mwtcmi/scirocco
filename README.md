# scirocco
1976 Volkswagen Scirocco #799 Hill Climb Car

## Mountain Run

Play at [scirocco799.com/mountain-run](https://scirocco799.com/mountain-run). The homepage links there, and the game has a permanent Home link back to the website. The game lives in `mountain-run/index.html`; static hosts serve that directory at `/mountain-run` (some add a trailing slash). The older `mountain-run.html` address redirects to it.

A point-to-point time attack spanning all nine venues in the planned 2027 schedule. Every event is available from the season selector, with venue-inspired scenery: Empire has dunes and Lake Michigan, Reading has the pagoda and city overlooks, and Waumandee has rolling farmland, barns and cornfields. The events have distinct road profiles without a progressive difficulty ladder; each retains the same 30,000-unit length, road width, speeds and hazard counts.

Deer contact ends the run immediately. Fox contact drops the car to a near stop and briefly limits acceleration. Uno is a black-and-white dappled rabbit with one ear, and always gets away safely. Hay-bale contact only costs speed; the chicanes have no pass-left/pass-right text. Going wide ends the run when three-quarters of the visible car is beyond the painted white road line.

Each event has five three-gate chicanes and at least five clear apex opportunities on actual corners. Green double chevrons match the welcome screen's boost symbol and point forward along the road; touching them at any speed gives an immediate boost and 2.5 seconds of extra acceleration. Gates stay 1,000 course units apart, and chevrons avoid chicanes, crossings and potholes. The route map marks FINISH with small checkered flags. Race labels and the map stay hidden during loading and on the welcome screen, appearing when a run starts.

Engine sound is enabled by default and starts on the first Start tap/click; the Sound button or M mutes it. Phones get split steering/pedal controls, larger touch targets, a compact HUD and map, a portrait camera that keeps the road lines visible, and a wider landscape camera. The mobile welcome screen keeps Start visible without scrolling and shows the HUD and driving controls after the race starts. Rotating the phone pauses the run and clears held controls. Rendering follows the viewport and caps its backing resolution at 2× for mobile performance.

The welcome screen keeps the website's branding and features the supplied Scirocco, Gameplay V5 and the season selector. A signature-green season tagline and compact symbol briefing explain apex boosts, wildlife, the road limit and controls. The optional driver-name field sits with event selection, and the 799 MOTORSPORT logo links home. Start stays accessible without scrolling on phones. Finish an event to continue to the next one, replay it or return to the season menu. Per-event bests and season completion save on the player's device under separate V5 keys, preserving earlier records.

PODIUMS opens shared event and season standings, powered by a Cloudflare Worker and D1. Each hill has a King of the Hill, a top-three podium, and one best time per named driver. Finishing all nine qualifies for the season podium, ranked by combined event bests. Driver identity stays in the browser; first-time finishers can choose a name or keep racing. Device bests remain available during outages, and ticketed finishes retry posting after reconnecting. The shared board becomes available after the two dashboard publication steps in [leaderboard/README.md](leaderboard/README.md). Course layouts and driving rules remain fixed at Gameplay V5.

Driver names are checked for common bad language and slurs in both the game and the Worker, including common disguised spellings. Existing blocked names get a neutral public alias while retaining their scores; choosing a clean name lets that driver post again. Filter updates require redeploying the Worker code, with no database changes.

Steering uses the left and right halves of an unbranded quick-release wheel with solid spokes and a yellow center mark; press and hold a half to keep turning. Gas and brake use distinct pedal graphics with the same input behavior. Distance checkpoint popups have been removed; the distance HUD and route map show progress.

Three chipped-asphalt potholes are spread across each dry course, clear of other hazards and apexes. Contact costs 25% of speed, cancels an apex boost, and causes a sideways skid with reduced grip for about half a second. Counter-steering still works and braking restores grip sooner. Each pothole can be avoided and only applies its penalty once per run. Screen-wide speed streaks have been removed.

Starting a run gives a brief front-wheel burnout with smoke and tire squeal. Pothole skids also squeal. Tire sound follows the same mute, pause, and end-of-run behavior as the engine.

Serve the static site from the repository root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Run the gameplay regression tests with Node.js:

```sh
node tests/mountain-run.test.cjs
node tests/leaderboard.test.mjs
node tests/name-policy.test.cjs
```

With the server running, Playwright and Chromium available, run the browser checks:

```sh
node tests/mountain-run.browser.cjs
node tests/mountain-run.mobile.cjs
node tests/leaderboard.browser.cjs
node tests/mountain-run.loading.cjs
```

The browser checks drive all nine season events through real controls, verify next-event/replay/menu flow and saved bests, and check engine and tire audio, crash/replay, sprite proportions and mobile input. The phone check verifies that the season selector and Start fit without scrolling at nine phone sizes, then checks simultaneous steering/gas, release/cancel, default audio and rotation pause. Set `GAME_URL` to test a different server and `CHROMIUM_PATH` to select a Chromium executable. Screenshots are written to `/tmp/gameplay-chicane.png` and `/tmp/gameplay-mobile.png`.
