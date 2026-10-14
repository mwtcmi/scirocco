# scirocco
1976 Volkswagen Scirocco #799 Hill Climb Car

## Mountain Run

A point-to-point time attack: hay-bale contact, wildlife contact, and grass cost speed rather than damage. The course has four three-gate chicanes, deer/fox/rabbit crossings, and six marked apexes at the inside of actual corners. Touch a marker at any speed for an immediate boost and 2.5 seconds of extra acceleration; no braking or precise centering is required. Chicane gates are spaced 1,000 course units apart for more room to change direction, with longer clear sections between the four groups. Wildlife crosses once per run, with deer crossing in 2 seconds, foxes in 1.5 seconds, and rabbits in 1.1 seconds. Best times for these rules are stored separately for the V3 course, preserving earlier records without comparing different rules.

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

The browser checks cover desktop/mobile rendering, controls, a complete summit run, replay, and best-time persistence. Set `GAME_URL` to test a different server and `CHROMIUM_PATH` to select a Chromium executable. Screenshots are written to `/tmp/gameplay-chicane.png` and `/tmp/gameplay-mobile.png`.
