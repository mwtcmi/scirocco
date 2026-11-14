// Build photo viewer: tap a photo to open it full screen, then step through
// that section's photos (arrows, keys or swipe). Same behaviour as /photos/.
(() => {
  'use strict';
  const d = document.createElement('dialog');
  if (typeof d.showModal !== 'function') return;
  d.className = 'lightbox'; d.setAttribute('aria-label', 'Photo viewer');
  d.innerHTML = '<button class="lb-close" aria-label="Close">×</button><button class="lb-prev" aria-label="Previous photo">‹</button><img alt=""><button class="lb-next" aria-label="Next photo">›</button><div class="lb-info"><strong></strong><span class="count" role="status"></span></div>';
  document.body.appendChild(d);
  const img = d.querySelector('img'), cap = d.querySelector('strong'), count = d.querySelector('.count');
  let list = [], cur = 0, back, overflow;
  function show(i) {
    cur = (i + list.length) % list.length;
    const a = list[cur], c = a.closest('figure')?.querySelector('figcaption b');
    img.src = a.href; img.alt = a.querySelector('img')?.alt || '';
    cap.textContent = c ? c.textContent : '';
    count.textContent = (cur + 1) + ' / ' + list.length;
    const n = list[(cur + 1) % list.length]; if (n) new Image().src = n.href;
  }
  document.querySelectorAll('.gal').forEach(g => {
    const links = [...g.querySelectorAll('figure > a')];
    links.forEach((a, i) => a.addEventListener('click', e => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); list = links; back = a; overflow = document.body.style.overflow;
      show(i); d.showModal(); document.body.style.overflow = 'hidden'; d.querySelector('.lb-close').focus();
    }));
  });
  d.addEventListener('close', () => { img.removeAttribute('src'); document.body.style.overflow = overflow; back?.focus({ preventScroll: true }); });
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show(cur + (e.key === 'ArrowRight' ? 1 : -1)); }
  });
  let x0 = null;
  d.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  d.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
  d.querySelector('.lb-close').addEventListener('click', () => d.close());
  d.querySelector('.lb-prev').addEventListener('click', () => show(cur - 1));
  d.querySelector('.lb-next').addEventListener('click', () => show(cur + 1));
})();
