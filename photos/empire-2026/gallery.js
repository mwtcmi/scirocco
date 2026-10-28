// Loaded only by /photos/. The native dialog handles modal focus and Escape.
(() => {
  'use strict';
  const photos = JSON.parse(document.getElementById('photos-data').textContent);
  const viewer = document.getElementById('viewer');
  if (typeof viewer.showModal !== 'function') return;
  const preview = document.getElementById('preview');
  const caption = document.getElementById('caption');
  const counter = document.getElementById('counter');
  const download = document.getElementById('download');
  let current = 0, previousFocus, previousOverflow;

  function show(index) {
    current = (index + photos.length) % photos.length;
    const photo = photos[current];
    preview.src = photo.href;
    preview.alt = 'Empire Hill Climb photo ' + photo.name;
    caption.textContent = photo.name + ' · ' + photo.original;
    counter.textContent = (current + 1) + ' / ' + photos.length;
    download.href = photo.href;
    download.download = photo.original;
  }

  document.querySelectorAll('.gallery [data-index]').forEach(tile => {
    tile.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      previousFocus = tile;
      previousOverflow = document.body.style.overflow;
      show(Number(tile.dataset.index));
      viewer.showModal();
      document.body.style.overflow = 'hidden';
      document.getElementById('close').focus();
    });
  });
  viewer.addEventListener('close', () => {
    preview.removeAttribute('src');
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus({ preventScroll: true });
  });
  viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const controls = [...viewer.querySelectorAll('button,a[href]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      show(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  document.getElementById('close').addEventListener('click', () => viewer.close());
  document.getElementById('prev').addEventListener('click', () => show(current - 1));
  document.getElementById('next').addEventListener('click', () => show(current + 1));
})();
