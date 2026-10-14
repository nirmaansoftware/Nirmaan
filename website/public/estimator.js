/*
  estimator.js: the ballpark budget & timeline estimator on pricing.html.

  All prices and durations live in the markup (data-* on each option), so
  changing an offer never means touching this file:
    project type  <input name="est-type"  value="15000" data-weeks="1-2">
    complexity    <input name="est-scale" value="1.5"   data-time-mult="1.5">
    add-on        <input name="est-addon" value="10000" data-weeks="1" type="checkbox">

  Range: low = base × complexity + add-ons, high = low × 1.3.
  Weeks: base weeks × time multiplier + add-on weeks, drawn as one block per week.
*/
(function () {
  'use strict';

  var form = document.querySelector('[data-estimator]');
  if (!form) return;

  var out = {
    price: form.querySelector('[data-est-price]'),
    weeks: form.querySelector('[data-est-weeks]'),
    bar: form.querySelector('[data-est-bar]'),
    plan: form.querySelector('[data-est-plan]'),
  };
  var UPPER = 1.3;
  var rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  function checked(name) { return form.querySelector('input[name="' + name + '"]:checked'); }

  function weeksRange(spec) {
    var parts = String(spec).split('-').map(Number);
    return { min: parts[0], max: parts[1] || parts[0] };
  }

  function compute() {
    var type = checked('est-type');
    var scale = checked('est-scale');
    var addons = Array.prototype.slice.call(form.querySelectorAll('input[name="est-addon"]:checked'));

    var addonPrice = 0, addonWeeks = 0;
    addons.forEach(function (a) {
      addonPrice += Number(a.value);
      addonWeeks += Number(a.getAttribute('data-weeks'));
    });

    var low = Number(type.value) * Number(scale.value) + addonPrice;
    var high = low * UPPER;
    var base = weeksRange(type.getAttribute('data-weeks'));
    var mult = Number(scale.getAttribute('data-time-mult'));

    return {
      type: type,
      low: Math.round(low),
      high: Math.round(high),
      minWeeks: Math.round(base.min * mult + addonWeeks),
      maxWeeks: Math.round(base.max * mult + addonWeeks),
      addons: addons,
    };
  }

  function render() {
    var e = compute();
    out.price.textContent = rupees.format(e.low) + ' – ' + rupees.format(e.high);
    out.weeks.textContent = e.minWeeks === e.maxWeeks ? e.minWeeks + ' weeks' : e.minWeeks + '–' + e.maxWeeks + ' weeks';

    var frag = document.createDocumentFragment();
    for (var w = 1; w <= e.maxWeeks; w++) {
      var block = document.createElement('i');
      if (w > e.minWeeks) block.className = 'is-range';
      frag.appendChild(block);
    }
    out.bar.replaceChildren(frag);
    out.bar.setAttribute('aria-label', 'Timeline: ' + out.weeks.textContent);

    // The package this estimate falls under, one click away.
    if (out.plan) {
      out.plan.href = '/pricing/' + e.type.getAttribute('data-plan') + '.html';
      out.plan.firstChild.textContent = "See what's in " + e.type.getAttribute('data-plan-name') + ' ';
    }
  }

  // "Use this estimate": carry the ballpark into the intake's budget field.
  // On the pricing page there's no intake, so it travels to the contact
  // page in the URL (?estimate=…), where contact-form.js picks it up.
  function applyToEnquiry() {
    var e = compute();
    var enquiry = document.getElementById('enquiry');

    var label = function (input) { return input.closest('label').querySelector('b').textContent.trim(); };
    var summary = 'Estimator: ' + out.price.textContent + ', ' + out.weeks.textContent +
      ' (' + label(e.type) + ', ' + label(checked('est-scale')).toLowerCase() +
      (e.addons.length ? ', + ' + e.addons.map(label).join(', ').toLowerCase() : '') + ')';

    if (!enquiry) {
      location.href = '/contact.html?plan=' + encodeURIComponent(e.type.getAttribute('data-plan') || '') +
        '&estimate=' + encodeURIComponent(summary.slice(0, 200)) + '#enquiry';
      return;
    }
    var budget = enquiry.querySelector('#budgetRange');
    if (budget) {
      var option = budget.querySelector('option[data-estimate]');
      if (!option) {
        option = document.createElement('option');
        option.setAttribute('data-estimate', '');
        budget.appendChild(option);
      }
      option.value = option.textContent = summary.slice(0, 200);
      budget.value = option.value;
    }
    enquiry.scrollIntoView({ block: 'start' });
    var first = enquiry.querySelector('#problem');
    if (first) first.focus({ preventScroll: true });
  }

  form.addEventListener('change', render);
  form.addEventListener('submit', function (ev) { ev.preventDefault(); applyToEnquiry(); });
  render();
})();
