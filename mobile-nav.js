// Native <details> provides the menu; these are optional closing conveniences.
(() => {
  'use strict';
  const menu = document.querySelector('.mobile-nav');
  if (!menu) return;
  const toggle = menu.querySelector('summary');
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) menu.open = false;
  });
  menu.addEventListener('focusout', event => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  });
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault();
      menu.open = false;
      toggle.focus();
    }
  });
  matchMedia('(max-width:960px)').addEventListener('change', () => { menu.open = false; });
})();
