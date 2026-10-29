# scirocco799.com

Static site published by GitHub Pages from the root of `main`.

- Match the existing style exactly: copy the head, inline styles, desktop menu and mobile menu (`details.mobile-nav`) from an existing page. Never restyle or rewrite existing pages unless asked.
- A new public page needs a `<title>`, meta description, canonical link (`https://scirocco799.com/<name>` without `.html`), and the favicon and Open Graph tags used on the other pages. A test or draft page gets `<meta name="robots" content="noindex,nofollow">` and no menu entry.
- Before every commit, run `node scripts/wrap-up.mjs`. It rebuilds `sitemap.xml` and `robots.txt` and must report 0 errors. Commit the updated sitemap together with the change.
