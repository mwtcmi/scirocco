# 799motorsport.com

Static site hosted on Cloudflare Pages (project `scirocco`), deployed automatically from the root of `main`. scirocco799.com redirects every page to 799motorsport.com (Cloudflare redirect rule).

- Match the existing style exactly: copy the head, inline styles, desktop menu and mobile menu (`details.mobile-nav`) from an existing page. Never restyle or rewrite existing pages unless asked.
- Every page must end with the shared footer: paste `scripts/site-footer.html` exactly as the page's footer and add `<link rel="stylesheet" href="/footer.css?v=2">` to its `<head>`. Never create a page without it, and never edit the footer on one page. Change `scripts/site-footer.html` and `footer.css`, then copy the footer to every page. Only the full-screen game pages (`mountain-run/index.html`, `the-run.html`) are exempt.
- A new public page needs a `<title>`, meta description, canonical link (`https://799motorsport.com/<name>` without `.html`), and the favicon and Open Graph tags used on the other pages. A test or draft page gets `<meta name="robots" content="noindex,nofollow">` and no menu entry.
- Before every commit, run `node scripts/wrap-up.mjs`. It rebuilds `sitemap.xml` and `robots.txt` and must report 0 errors. Commit the updated sitemap together with the change.
