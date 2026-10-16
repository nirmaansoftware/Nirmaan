/*
  tour.js: the "See it work" demo on /products/outreach.html.

  The HTML holds all seven beats in their finished state, so without JS the
  demo is an ordinary list of steps. With JS the beats are stacked in one place
  (the stage keeps the height of the tallest, so nothing below it jumps), the
  step buttons become tabs, and the beats are shown one at a time:

    - plays once, a beat every few seconds, when it scrolls into view;
    - Pause / Play is always visible (WCAG 2.2.2), and Replay starts again;
    - the numbered steps are tabs (click, or arrow keys / Home / End);
    - choosing a step, or moving keyboard focus into the demo, stops autoplay;
    - hovering with a mouse pauses it, and so does switching browser tab.

  With "reduce motion" on nothing plays by itself and nothing animates; the
  steps, Play and Replay still work.
*/
(function () {
  'use strict';

  var tour = document.querySelector('[data-tour]');
  if (!tour) return;

  var row = tour.querySelector('.tour__steps');
  var tabs = Array.prototype.slice.call(row.querySelectorAll('button'));
  var panels = Array.prototype.slice.call(tour.querySelectorAll('.tour__beat'));
  var bar = tour.querySelector('[data-tour-progress]');
  var toggle = tour.querySelector('[data-tour-toggle]');
  var replay = tour.querySelector('[data-tour-replay]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var BEAT = 5200; // ms each beat stays on screen while playing

  var current = 0, timer = null, playing = false, held = false;

  // Tab semantics only exist with JS, so they're added here, not in the HTML.
  row.setAttribute('role', 'tablist');
  tabs.forEach(function (tab) { tab.setAttribute('role', 'tab'); });
  panels.forEach(function (panel) { panel.setAttribute('role', 'tabpanel'); });

  function label() {
    if (!toggle) return;
    toggle.textContent = playing ? 'Pause' : 'Play';
    toggle.setAttribute('aria-pressed', playing ? 'false' : 'true');
  }

  function keepStepInView(tab) {
    var left = tab.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + tab.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: Math.max(0, left - 16), behavior: reduce.matches ? 'auto' : 'smooth' });
    }
  }

  function show(i) {
    current = i;
    tabs.forEach(function (tab, k) {
      var on = k === i;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
    panels.forEach(function (panel, k) {
      var on = k === i;
      // Re-adding the class replays the beat's entrance, even for the same beat.
      panel.classList.remove('is-active');
      if (on) { void panel.offsetWidth; panel.classList.add('is-active'); }
      if (on) panel.removeAttribute('inert'); else panel.setAttribute('inert', '');
    });
    if (bar) bar.style.setProperty('--p', ((i + 1) / tabs.length).toFixed(3));
    keepStepInView(tabs[i]);
  }

  function stop() { playing = false; clearTimeout(timer); label(); }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
  function tick() {
    if (!playing || held || document.hidden) return;
    if (current >= tabs.length - 1) { stop(); return; }
    show(current + 1);
    schedule(BEAT);
  }
  function play(from) {
    playing = true;
    label();
    show(from);
    schedule(BEAT);
  }

  tour.classList.add('is-ready');
  show(0);
  label();

  tabs.forEach(function (tab, k) {
    tab.addEventListener('click', function () { stop(); show(k); });
    tab.addEventListener('keydown', function (e) {
      var n = { ArrowRight: (k + 1) % tabs.length, ArrowLeft: (k - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault();
      stop();
      show(n);
      tabs[n].focus();
    });
  });

  if (toggle) toggle.addEventListener('click', function () {
    if (playing) stop();
    else play(current >= tabs.length - 1 ? 0 : current);
  });
  if (replay) replay.addEventListener('click', function () { play(0); });

  // Keyboard focus inside the demo means someone is reading or operating it,
  // so autoplay stops. The Pause / Play button is exempt: focusing it with a
  // mouse click comes just before the click, and must not flip its state.
  tour.addEventListener('focusin', function (e) {
    if (e.target !== toggle && e.target !== replay) stop();
  });

  // Hover pauses with a mouse only: on touch screens a tap can fire an enter
  // with no matching leave, which would freeze the demo.
  tour.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { held = true; clearTimeout(timer); } });
  tour.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { held = false; if (playing) schedule(BEAT / 2); } });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && playing && !held) schedule(BEAT / 2);
  });

  // Play once, the first time most of the stage is on screen.
  if (!reduce.matches && 'IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { seen.disconnect(); if (current === 0) play(0); }
    }, { threshold: 0.35 });
    seen.observe(tour.querySelector('.tour__stage'));
  }
})();
