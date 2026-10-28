// Loaded only by /photos/. The native dialog handles modal focus and Escape.
(() => {
  'use strict';
  const photos = JSON.parse(document.getElementById('photos-data').textContent);
  const viewer = document.getElementById('viewer');
  const preview = document.getElementById('preview');
  const caption = document.getElementById('caption');
  const counter = document.getElementById('counter');
  const download = document.getElementById('download');
  const tiles = [...document.querySelectorAll('.gallery [data-index]')];

  // GitHub Pages/edge caches can temporarily serve 404s for newly published
  // binary assets. Keep local files first, then use the same committed originals
  // from GitHub's public CDN or raw source if an individual request fails.
  const cdnBase = 'https://cdn.jsdelivr.net/gh/mwtcmi/scirocco@main/photos/';
  const rawBase = 'https://raw.githubusercontent.com/mwtcmi/scirocco/main/photos/';
  const locations = path => [path, cdnBase + path, rawBase + path];

  tiles.forEach(tile => {
    const photo = photos[Number(tile.dataset.index)];
    const img = tile.querySelector('img');
    const thumbUrls = locations(photo.thumb);
    const fullUrls = locations(photo.href);
    let attempt = 0;
    const retry = () => {
      if (attempt >= thumbUrls.length - 1) {
        img.alt = 'Photo ' + photo.name + ' is temporarily unavailable';
        return;
      }
      attempt++;
      tile.dataset.imageSource = String(attempt);
      tile.href = fullUrls[attempt];
      img.src = thumbUrls[attempt];
    };
    img.addEventListener('error', retry);
    // A cached error may have occurred before this deferred script ran.
    if (img.complete && img.naturalWidth === 0) retry();
  });

  if (typeof viewer.showModal !== 'function') return;

  let current = 0, previousFocus, previousOverflow, previewAttempt = 0;

  function show(index) {
    current = (index + photos.length) % photos.length;
    const photo = photos[current];
    const tile = tiles[current];
    previewAttempt = Number(tile.dataset.imageSource || 0);
    const url = locations(photo.href)[previewAttempt];
    preview.src = url;
    preview.alt = 'Grattan Track Sprints photo ' + photo.name;
    caption.textContent = photo.name;
    counter.textContent = (current + 1) + ' / ' + photos.length;
    download.href = url;
    download.download = photo.name + '.webp';
  }

  preview.addEventListener('error', () => {
    if (!viewer.open) return;
    const urls = locations(photos[current].href);
    if (previewAttempt + 1 < urls.length) {
      previewAttempt++;
      preview.src = urls[previewAttempt];
      download.href = urls[previewAttempt];
    } else {
      caption.textContent = photos[current].name + ' - photo temporarily unavailable';
    }
  });
  preview.addEventListener('load', () => {
    if (viewer.open) download.href = preview.currentSrc || preview.src;
  });

  tiles.forEach(tile => {
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

  // Browsers ignore the download attribute on cross-origin URLs. Download
  // fallback images as a blob so the same free-download button still works.
  download.addEventListener('click', async event => {
    const url = new URL(download.href, location.href);
    if (url.origin === location.origin) return;
    event.preventDefault();
    try {
      const response = await fetch(url.href, { mode: 'cors' });
      if (!response.ok) throw new Error('Photo download unavailable');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = photos[current].name + '.webp';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      // If a CDN blocks cross-origin fetch, still let visitors open the photo.
      window.location.href = url.href;
    }
  });
})();
