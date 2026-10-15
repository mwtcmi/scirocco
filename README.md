# scirocco
1976 Volkswagen Scirocco #799 Hill Climb Car

## Mountain Run

Play at [scirocco799.com/mountain-run](https://scirocco799.com/mountain-run). The homepage links there, and the game has a permanent Home link back to the website. The game lives in `mountain-run/index.html`; static hosts serve that directory at `/mountain-run` (some add a trailing slash). The older `mountain-run.html` address immediately replaces itself with the game in browser history. Its two fallback links are only shown when JavaScript is disabled, so they cannot appear between the homepage and game during normal navigation. The complete welcome screen appears after its styles, controls and car image are ready.

A point-to-point time attack spanning all nine venues in the planned 2027 schedule. Every event is available from the season selector, with venue-inspired scenery: Empire has dunes and Lake Michigan, Reading has the pagoda and city overlooks, and Waumandee has rolling farmland, barns and cornfields. Gameplay V6 gives every venue an authored sequence of bends, straights and hazard positions. All nine are available immediately, without a progressive difficulty ladder. Each retains the same 30,000-unit distance, road width and car handling. The routes are game designs inspired by the venues, not surveyed reproductions of the real roads.

The V6 route styles are:

| Event | Character | Boost corners | Chicanes |
| --- | --- | --- | --- |
| Pine Mountain | Flowing forest bends | 6 | 4 |
| Spring Weatherly | Village turns & linked sweepers | 6 | 3 |
| Pagoda | Tight turns & short straights | 7 | 3 |
| Flag Rock | Long ledges & broad bends | 5 | 3 |
| Giants Despair | Sharp bends & punchy exits | 7 | 3 |
| Duryea | Double bends & technical links | 7 | 3 |
| Waumandee | Fast straights & farm chicanes | 5 | 5 |
| Empire | Open dunes & fast sweepers | 5 | 2 |
| Shamrock Mountain | Woodland esses & flowing exits | 6 | 4 |

Deer contact ends the run immediately. Fox contact drops the car to a near stop and briefly limits acceleration. Uno is a black-and-white dappled rabbit with one ear, and always gets away safely. Hay-bale contact only costs speed; the chicanes have no pass-left/pass-right text. Going wide ends the run when three-quarters of the visible car is beyond the painted white road line.

Each event has two to five three-gate chicanes and five to seven clear inside-apex opportunities. Course definitions in `mountain-run/courses.js` specify the turns, chicanes, wildlife and potholes; smooth transitions connect the authored turns and leave straight launch/finish areas. Green double chevrons match the welcome screen's boost symbol and point forward along the road; touching them at any speed gives an immediate boost and 2.5 seconds of extra acceleration. Gates stay 1,000 course units apart, and chevrons avoid chicanes, crossings and potholes. The route map uses the earlier compact diagonal presentation, with gentle bends rather than stretching lateral road offsets across the display. It is a schematic of the game layout, not a traced real-world route. Progress follows race distance, and FINISH has small checkered flags. Race labels and the map stay hidden during loading and on the welcome screen, appearing when a run starts.

Engine sound is enabled by default and starts on the first Start tap/click; the Sound button or M mutes it. `mountain-run/audio.js` synthesizes a carb-fed 2.0-litre eight-valve inline four with four combustion pulses per cycle, a rough idle, throttle-sensitive intake noise and a resonant race-exhaust note. A separate five-speed sound model produces pitch drops and short ignition cuts on upshifts, with downshifts as speed falls. It changes sound only, without changing acceleration or race times; it is an approximation rather than a recording of the car. Phones get split steering/pedal controls, larger touch targets, a compact HUD and map, a portrait camera that keeps the road lines visible, and a wider landscape camera. The mobile welcome screen keeps Start visible without scrolling and shows the HUD and driving controls after the race starts. Rotating the phone pauses the run and clears held controls. Rendering follows the viewport and caps its backing resolution at 2× for mobile performance.

The welcome screen stages the supplied rear-view Scirocco on a painted start line beneath a checkered banner. Selecting an event changes its scenery and venue caption using the existing course palettes and themes, including Empire's lake and dunes and Waumandee's farmland. Subtle exhaust animation respects reduced-motion preferences. The separate `mountain-run/welcome.js` and `welcome.css` generate the preview, including a small schematic of the selected game route. Gameplay V6, a signature-green season tagline and a compact symbol briefing explain the driving rules. Driver-name entry sits with event selection, and the 799 MOTORSPORT logo links home. The scene, entry fields and green Start button fit without scrolling on phones, including short landscape screens. Finish an event to continue, replay or return to the season menu. Per-event bests and season completion save on the player's device under separate V6 keys, preserving earlier V5 records. Driver names and credentials remain the same.

A compact King of the Hill strip shows the selected event's real leader and record and opens that event's podium. Empty hills invite the first time; unavailable shared standings show a reconnect message. Record loading never delays the welcome screen or Start. Reads are cached for thirty seconds, delayed responses cannot replace another event's record, and posting a new result updates the strip. The Worker must use the V6 course manifest to share new-layout times; replace its code and deploy as described below. No database migration is required.

PODIUMS opens shared event and season standings, powered by a Cloudflare Worker and D1. Each hill has a King of the Hill, a top-three podium, and one best time per named driver. Finishing all nine qualifies for the season podium, ranked by combined event bests. Driver identity stays in the browser; first-time finishers can choose a name or keep racing. Device bests remain available during outages, and ticketed finishes retry posting after reconnecting. The shared board becomes available after the two dashboard publication steps in [leaderboard/README.md](leaderboard/README.md). The active ruleset is `2027-v6`. Earlier `2027-v5` rows and device bests are retained separately and do not qualify for the new layouts. The old pending-results key is left intact; V6 uses its own queue. A cached V5 page cannot obtain a V6 ticket.

Driver names are checked for common bad language and slurs in both the game and the Worker, including common disguised spellings. Existing blocked names get a neutral public alias while retaining their scores; choosing a clean name lets that driver post again. Filter updates require redeploying the Worker code, with no database changes.

Steering uses the left and right halves of an unbranded quick-release wheel with solid spokes and a yellow center mark; press and hold a half to keep turning. Gas and brake use distinct pedal graphics with the same input behavior. Distance checkpoint popups have been removed; the distance HUD and route map show progress.

Three chipped-asphalt potholes are spread across each dry course, clear of other hazards and apexes. Contact costs 25% of speed, cancels an apex boost, and causes a sideways skid with reduced grip for about half a second. Counter-steering still works and braking restores grip sooner. Each pothole can be avoided and only applies its penalty once per run. Screen-wide speed streaks have been removed.

Five freestanding sponsor billboards replace the small roadside 799 signs on each course. Large “YOUR BRAND HERE” lettering, a “2027 SPONSOR SPACE” header and “SPONSOR SCIROCCO 799” footer advertise space for future partners in the site’s black, white and green. Their positions are chosen on straights, away from hazards and boost markers, with clear scenery approaches. The signs are decorative and do not change courses, collisions, scoring or the current ruleset.

Starting a run gives a brief front-wheel burnout with smoke and tire squeal. Pothole skids also squeal. Tire sound follows the same mute, pause, and end-of-run behavior as the engine.

Serve the static site from the repository root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Run the gameplay regression tests with Node.js:

```sh
node tests/courses.test.cjs
node tests/audio.test.cjs
node tests/mountain-run.test.cjs
node tests/leaderboard.test.mjs
node tests/name-policy.test.cjs
```

With the server running, Playwright and Chromium available, run the browser checks:

```sh
node tests/mountain-run.browser.cjs
node tests/mountain-run.mobile.cjs
node tests/audio.browser.cjs
node tests/leaderboard.browser.cjs
node tests/mountain-run.loading.cjs
```

The browser checks drive all nine season events through real controls, verify next-event/replay/menu flow and saved bests, and check engine and tire audio, crash/replay, sprite proportions and mobile input. The phone check verifies that the season selector and Start fit without scrolling at nine phone sizes, then checks simultaneous steering/gas, release/cancel, default audio and rotation pause. Set `GAME_URL` to test a different server and `CHROMIUM_PATH` to select a Chromium executable. Screenshots are written to `/tmp/gameplay-chicane.png` and `/tmp/gameplay-mobile.png`.
