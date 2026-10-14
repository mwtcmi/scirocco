# scirocco
1976 Volkswagen Scirocco #799 Hill Climb Car

## Mountain Run

A point-to-point time attack with a 25% longer V4 climb. Hay-bale contact costs speed; a third wildlife hit ends the run. Going wide is allowed until three-quarters of the visible car is beyond the painted white road line, then the run ends. The HUD tracks wildlife hits, and only completed summit runs can save a personal best.

The course has five three-gate chicanes and seven marked apexes on the inside of actual corners. Touch an apex at any speed for an immediate boost and 2.5 seconds of extra acceleration; no braking or precise centering is required. Gates remain 1,000 course units apart, with long clear sections between groups. Wildlife crosses once per run: deer in 2 seconds, foxes in 1.5, and rabbits in 1.1.

The redesigned welcome screen features the supplied Scirocco and the gameplay version. Best times are saved separately for V4, preserving earlier course records. A shared, named leaderboard is deferred until a backend is connected; no leaderboard service or credentials are needed for this release.

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
```

The browser checks cover desktop/mobile rendering, controls, off-road crash/replay, a driven summit run, best-time persistence, and portrait/landscape welcome layouts. Set `GAME_URL` to test a different server and `CHROMIUM_PATH` to select a Chromium executable. Screenshots are written to `/tmp/gameplay-chicane.png` and `/tmp/gameplay-mobile.png`.
