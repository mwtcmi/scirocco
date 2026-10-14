# scirocco
1976 Volkswagen Scirocco #799 Hill Climb Car

## Mountain Run

A point-to-point time attack: hay-bale contact, wildlife contact, and grass cost speed rather than damage. The course has five three-gate chicanes, deer/fox/rabbit crossings, and eight marked apexes. Brake on approach, clip an apex cleanly, then accelerate to use the short exit boost. Wildlife crosses once per run and clears while you slow down. Best times for these rules are stored separately from the original damage-based game.

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
