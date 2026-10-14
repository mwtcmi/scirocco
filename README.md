# scirocco
1976 Volkswagen Scirocco #799 Hill Climb Car

## Mountain Run

A point-to-point time attack with a 25% longer V4 climb. Hay-bale contact costs speed; a third wildlife hit ends the run. Going wide is allowed until three-quarters of the visible car is beyond the painted white road line, then the run ends. The HUD tracks wildlife hits, and only completed summit runs can save a personal best.

The course has five three-gate chicanes and seven marked apexes on the inside of actual corners. Touch an apex at any speed for an immediate boost and 2.5 seconds of extra acceleration; no braking or precise centering is required. Gates remain 1,000 course units apart, with long clear sections between groups. Wildlife crosses once per run: deer in 2 seconds, foxes in 1.5, and rabbits in 1.1.

Engine sound is enabled by default and starts on the first Start tap/click; the Sound button or M mutes it. Phones get split steering/pedal controls, larger touch targets, a compact HUD and map, a portrait camera that keeps the road lines visible, and a wider landscape camera. The mobile welcome screen keeps Start visible without scrolling and shows the HUD and driving controls after the race starts. Rotating the phone pauses the run and clears held controls. Rendering follows the viewport and caps its backing resolution at 2× for mobile performance.

The redesigned welcome screen features the supplied Scirocco and the gameplay version. Best times are saved separately for V4, preserving earlier course records. A shared, named leaderboard is deferred until a backend is connected; no leaderboard service or credentials are needed for this release.

Steering uses the left and right halves of a quick-release wheel with a yellow center mark; press and hold a half to keep turning. Gas and brake use distinct pedal graphics with the same input behavior. Distance checkpoint popups have been removed; the distance HUD and route map show progress.

Serve the static site from the repository root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Run the gameplay regression tests with Node.js:

```sh
node --test tests/mountain-run.test.cjs
```

With the server running, Playwright and Chromium available, run the browser checks:

```sh
node tests/mountain-run.browser.cjs
node tests/mountain-run.mobile.cjs
```

The browser checks cover desktop/mobile rendering, controls, off-road crash/replay, a driven summit run, best-time persistence, and portrait/landscape welcome layouts. The phone check verifies that Start is visible without scrolling and the map stays compact at nine phone sizes, then emulates touch hardware to check simultaneous steering/gas, release/cancel, default audio from a tap, and rotation pause. Set `GAME_URL` to test a different server and `CHROMIUM_PATH` to select a Chromium executable. Screenshots are written to `/tmp/gameplay-chicane.png` and `/tmp/gameplay-mobile.png`.
