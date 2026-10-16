/*
  tour.js: the "See it work" demo on /products/marketing.html.

  The HTML holds all seven beats in their finished state, so without JS the
  demo is an ordinary list of steps. With JS the beats are stacked in one place
  (the stage keeps the height of the tallest, so nothing below it jumps) and
  shown one at a time:

    - plays once, a beat every few seconds, when it scrolls into view;
    - the numbered steps are tabs (click, or arrow keys / Home / End);
    - choosing a step or pressing Replay takes over from the autoplay;
    - hovering pauses it, and so does switching to another browser tab.

  With "reduce motion" on nothing plays by itself and nothing animates; the
  steps still switch beats.
*/
(function () {
  'use strict';

  var tour = document.querySelector('[data-tour]');
  if (!tour) return;

  var tabs = Array.prototype.slice.call(tour.querySelectorAll('[role="tab"]'));
  var panels = Array.prototype.slice.call(tour.querySelectorAll('[role="tabpanel"]'));
  var row = tour.querySelector('.tour__steps');
  var bar = tour.querySelector('[data-tour-progress]');
  var replay = tour.querySelector('[data-tour-replay]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var BEAT = 5200; // ms each beat stays on screen while playing

  var current = 0, timer = null, playing = false, held = false;

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

  function stop() { playing = false; clearTimeout(timer); }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
  function tick() {
    if (!playing || held || document.hidden) return;
    if (current >= tabs.length - 1) { playing = false; return; }
    show(current + 1);
    schedule(BEAT);
  }
  function play() { stop(); playing = true; show(0); schedule(BEAT); }

  tour.classList.add('is-ready');
  show(0);

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

  if (replay) replay.addEventListener('click', function () {
    if (reduce.matches) { stop(); show(0); } else { play(); }
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
      if (entries.some(function (e) { return e.isIntersecting; })) { seen.disconnect(); play(); }
    }, { threshold: 0.35 });
    seen.observe(tour.querySelector('.tour__stage'));
  }
})();
