/*
  Page transitions: every page change is built block by block.

  1. Browsers with cross-document View Transitions (Chrome / Edge 126+, Safari 18.2+)
     animate through CSS (see "PAGE TRANSITIONS" in styles.css): the new page is laid
     over the old one a block at a time, bottom row first, like the logo. This file
     adds two things the CSS can't know:
       - direction: forward or back, from the menu order and how deep the page is
         (/pricing.html → /pricing/growth.html is forward, the way back is back);
       - the morph: when you click a card that leads to its own page (a plan, a care
         plan, a service), the card's title flies into that page's heading.
  2. Other browsers (e.g. Firefox) get the same block build from a small overlay:
     blocks cover the old page, the new page opens covered, and they clear away.

  On phones (up to 40rem) pages slide sideways instead, like a native app: the
  new page comes in from the right going forward, and from the left going back.
  A tapped card's title still flies into the new page's heading.

  Loaded in <head>, after styles.css, so it is ready before first paint.
*/
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Phones slide pages like a native app (styles.css); the title morph rides along.
  var phone = window.matchMedia('(max-width: 40rem)');
  var MORPH_KEY = 'nirmaan-morph';
  var CURTAIN_KEY = 'nirmaan-curtain';

  function session(op, key, value) {
    try {
      if (op === 'get') return sessionStorage.getItem(key);
      if (op === 'set') sessionStorage.setItem(key, value);
      if (op === 'del') sessionStorage.removeItem(key);
    } catch (e) { /* storage blocked: transitions still run, just without the morph */ }
    return null;
  }

  function urlOf(href) {
    try { return new URL(href, location.href); } catch (e) { return null; }
  }
  function sameDocument(a, b) {
    return a && b && a.origin === b.origin && a.pathname === b.pathname;
  }

  /* ---- Where a page sits: its menu section, then how deep it is ---- */
  // Page order comes from the nav (src/_data/navLinks.json via base.njk), so it can't drift.
  var ORDER = (root.getAttribute('data-pages') || 'index').split(/\s+/);
  function place(href) {
    var u = urlOf(href);
    if (!u || u.origin !== location.origin) return null;
    var parts = u.pathname.replace(/\.html$/, '').split('/').filter(Boolean);
    return { section: ORDER.indexOf(parts[0] || 'index'), depth: parts.length };
  }
  function direction(fromHref, toHref) {
    var a = place(fromHref), b = place(toHref);
    if (!a || !b || a.section < 0 || b.section < 0) return null;
    if (a.section !== b.section) return b.section > a.section ? 'forward' : 'back';
    if (a.depth !== b.depth) return b.depth > a.depth ? 'forward' : 'back';
    return a.depth > 1 ? 'forward' : null; // one detail page to its sibling
  }
  function setDirection(dir) {
    if (!dir && phone.matches) dir = 'forward'; // a slide always needs a side to come from
    if (dir) root.setAttribute('data-vt-dir', dir);
    else root.removeAttribute('data-vt-dir');
  }

  /* ---- Morph keys and the page each one opens ---- */
  var MORPH_PAGES = { plan: '/pricing/', care: '/pricing/care/', svc: '/services/' };
  function pageFor(key) {
    var m = /^(plan|care|svc)-([a-z0-9-]+)$/.exec(key || '');
    return m ? MORPH_PAGES[m[1]] + m[2] + '.html' : null;
  }
  function onScreen(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  // The link someone just activated, so the outgoing page knows which card was clicked.
  var lastLink = null;
  document.addEventListener('click', function (e) {
    lastLink = e.target.closest ? e.target.closest('a[href]') : null;
  }, true);

  /** The title to morph for a link: the link itself, its own titled child, or its card's title. */
  function morphSource(link, dest) {
    if (!link) return null;
    var candidates = [link].concat(
      Array.prototype.slice.call(link.querySelectorAll('[data-morph]')),
      Array.prototype.slice.call((link.closest('li, article') || link).querySelectorAll('[data-morph]'))
    );
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var key = el.getAttribute && el.getAttribute('data-morph');
      if (key && sameDocument(urlOf(pageFor(key)), dest) && onScreen(el)) return el;
    }
    return null;
  }

  /* ---- 1. Native cross-document view transitions ---- */
  if ('CSSViewTransitionRule' in window) {
    // Outgoing page: fires just before the old page is captured.
    window.addEventListener('pageswap', function (e) {
      if (!e.viewTransition || !e.activation || !e.activation.entry) return;
      var dest = urlOf(e.activation.entry.url);
      setDirection(direction(location.href, dest && dest.href));
      session('del', MORPH_KEY);
      if (reduceMotion.matches || e.activation.navigationType === 'traverse') return;
      var source = morphSource(lastLink && sameDocument(urlOf(lastLink.href), dest) ? lastLink : null, dest);
      if (!source) return;
      source.style.viewTransitionName = 'morph';
      session('set', MORPH_KEY, source.getAttribute('data-morph'));
    });

    // Incoming page: fires before its first paint, while the transition is being set up.
    window.addEventListener('pagereveal', function (e) {
      var key = session('get', MORPH_KEY);
      session('del', MORPH_KEY);
      if (!e.viewTransition) return;
      var nav = window.navigation, from = nav && nav.activation && nav.activation.from;
      setDirection(direction(from ? from.url : document.referrer, location.href));
      // On phones the page's own entrance starts as it slides in, not after.
      if (phone.matches) root.classList.add('vt-slide');

      // The heading's text span, not the full-width block, so both ends of the
      // morph are the same shape: a word, scaling and moving into place.
      var heading = key && document.querySelector('h1[data-morph="' + key + '"]');
      var target = heading && (heading.querySelector('.line > span') || heading);
      if (!target) return;
      target.style.viewTransitionName = 'morph';
      root.classList.add('vt-morph');
      // .vt-morph stays for the life of the page: removing it would restart
      // the heading's rise animation it switched off.
      e.viewTransition.finished.finally(function () { target.style.viewTransitionName = ''; });
    });

    // Back/forward cache: a restored page must not keep a name from when it was left.
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      Array.prototype.forEach.call(document.querySelectorAll('[data-morph]'), function (el) { el.style.viewTransitionName = ''; });
    });
    return;
  }

  /* ---- 2. Block-curtain fallback for browsers without view transitions ---- */
  var COLS = 8, ROWS = 5, LEAVE_MS = 380;

  function curtain(state) {
    var el = document.createElement('div');
    el.className = 'pt-curtain';
    el.setAttribute('aria-hidden', 'true');
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var b = document.createElement('i');
        // Bottom row first, sweeping left to right, like a structure going up.
        b.style.setProperty('--o', ((ROWS - 1 - y) * 0.55 + (x / COLS) * 2.2 + Math.random() * 0.6).toFixed(2));
        el.appendChild(b);
      }
    }
    el.setAttribute('data-state', state);
    return el;
  }

  // Phones without view transitions: the page slides out left and the next
  // one slides in from the right (html.pt-slide-* in styles.css).
  var SLIDE_KEY = 'nirmaan-slide';
  if (session('get', SLIDE_KEY) && !reduceMotion.matches) {
    session('del', SLIDE_KEY);
    root.classList.add('pt-slide-in');
    window.addEventListener('pageshow', function () {
      setTimeout(function () { root.classList.remove('pt-slide-in'); }, 600);
    });
  }

  // Arriving under a curtain: cover before first paint, then clear it block by block.
  if (session('get', CURTAIN_KEY) && !reduceMotion.matches) {
    session('del', CURTAIN_KEY);
    root.classList.add('pt-arriving');
    document.addEventListener('DOMContentLoaded', function () {
      var c = curtain('covered');
      document.body.appendChild(c);
      root.classList.remove('pt-arriving');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { c.setAttribute('data-state', 'clearing'); });
      });
      setTimeout(function () { c.remove(); }, 1200);
    });
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (reduceMotion.matches) return;

    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download')) return;
    if (a.target && a.target !== '_self') return;

    var url = urlOf(a.href);
    // Internal page-to-page links only (skips mailto:, external sites, same-page anchors)
    if (!url || url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;

    e.preventDefault();
    if (phone.matches) {
      root.classList.add('pt-slide-out');
      session('set', SLIDE_KEY, '1');
      setTimeout(function () { location.href = url.href; }, 260);
      return;
    }
    var c = curtain('open');
    document.body.appendChild(c);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { c.setAttribute('data-state', 'building'); });
    });
    session('set', CURTAIN_KEY, '1');
    setTimeout(function () { location.href = url.href; }, LEAVE_MS);
  });

  // Back/forward cache restores the covered page as it was; clear it.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    Array.prototype.forEach.call(document.querySelectorAll('.pt-curtain'), function (c) { c.remove(); });
    root.classList.remove('pt-slide-out');
    session('del', CURTAIN_KEY);
  });
})();
