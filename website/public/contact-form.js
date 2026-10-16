/*
  contact-form.js: the problem-first intake on contact.html.

  Three steps (the problem → optional context → timing and contact). With
  JavaScript they appear one at a time; without it, all three show as one
  ordinary form, so nothing depends on this script to be usable.

  WHERE IT SENDS (src/_data/site.json)
    web3formsKey set    → data-format="web3forms": emailed through Web3Forms
                          to the address the key belongs to, one readable
                          email per enquiry, reply-to set to the customer.
    intakeEndpoint set  → data-format="json": the Nirmaan OS intake API
                          (os/src/app/api/intake/route.ts), which creates a
                          LEAD- in the pipeline.
    Without data-format the form sends multipart form data.

  Until an endpoint is set the form says plainly that it isn't connected and
  shows the email address instead. It never reports success for a message
  that was not actually received.
*/
(function () {
  'use strict';

  var form = document.querySelector('[data-enquiry]');
  if (!form) return;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var MIN_PROBLEM = 20;
  var fallbackEmail = (form.getAttribute('data-fallback-email') || '').trim();
  var reachUs = fallbackEmail ? ' Please email us at ' + fallbackEmail + ' instead.' : '';

  var MSG = {
    problem: 'Tell us a little more about the problem (at least ' + MIN_PROBLEM + ' characters).',
    name: 'Please tell us your name.',
    email: 'That email address doesn’t look right. Please check it.',
    notConnected: 'This form isn’t connected yet, so your message was not sent.' + reachUs,
    network: 'Your message didn’t go through. Check your connection and try again.' + reachUs,
    server: 'Something went wrong on our side, so your message was not sent. Please try again in a moment.' + reachUs,
  };

  var steps = Array.prototype.slice.call(form.querySelectorAll('[data-step]'));
  var ok = form.querySelector('[data-form-ok]');
  var err = form.querySelector('[data-form-error]');
  var errText = err.querySelector('[data-form-error-text]');
  var button = form.querySelector('[type="submit"]');
  var buttonLabel = button.querySelector('[data-label]');
  var idleLabel = buttonLabel.textContent;
  var current = 0;

  /* ---- Steps ---- */
  form.classList.add('is-stepped');

  function show(index, focus) {
    current = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach(function (step, i) {
      step.hidden = i !== current;
    });
    if (focus) {
      var legend = steps[current].querySelector('legend');
      if (legend) legend.focus({ preventScroll: true });
      form.scrollIntoView({ block: 'start' });
    }
  }

  function stepOf(field) {
    for (var i = 0; i < steps.length; i++) if (steps[i].contains(field)) return i;
    return -1;
  }

  function fieldError(field, message) {
    var owner = stepOf(field);
    if (owner !== -1 && owner !== current) show(owner, false);
    showError(message);
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }

  /** Validates the fields that live in the current step. True when it can be left. */
  function stepValid() {
    clearState();
    var problem = steps[current].querySelector('#problem');
    if (problem && problem.value.trim().length < MIN_PROBLEM) {
      fieldError(problem, MSG.problem);
      return false;
    }
    return true;
  }

  form.addEventListener('click', function (e) {
    if (e.target.closest('[data-next]') && stepValid()) show(current + 1, true);
    if (e.target.closest('[data-back]')) {
      clearState();
      show(current - 1, true);
    }
  });

  /* ---- Messages ----
     Errors are shown in the step where the problem is, so the person
     always sees the message next to the field it's about. */
  function showError(message) {
    ok.hidden = true;
    errText.textContent = message;
    steps[current].appendChild(err);
    err.hidden = false;
  }
  function clearState() {
    ok.hidden = true;
    err.hidden = true;
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (f) { f.removeAttribute('aria-invalid'); });
  }
  function busy(on) {
    button.disabled = on;
    buttonLabel.textContent = on ? 'Sending…' : idleLabel;
  }

  form.addEventListener('input', function (e) {
    if (e.target.hasAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
  });

  /* ---- Submit ---- */
  function sent() {
    form.reset();
    var about = form.querySelector('[data-interest]');
    if (about) { about.hidden = true; about.querySelector('[data-interest-input]').value = ''; }
    show(steps.length - 1, false);
    ok.hidden = false;
    ok.focus();
  }

  // One readable email: the form's own labels as keys, in the order asked.
  function web3formsPayload() {
    var name = form.elements.contactName.value.trim();
    var payload = {
      access_key: form.getAttribute('data-access-key'),
      subject: 'New enquiry from ' + name + ' (nirmaan.online)',
      from_name: 'Nirmaan website',
      name: name,
      email: form.elements.contactEmail.value.trim(), // Web3Forms makes this the reply-to
      botcheck: '',
    };
    Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (field) {
      if (!field.name || field.name === '_gotcha' || field.name === 'contactName' || field.name === 'contactEmail') return;
      var value = (field.value || '').trim();
      if (!value) return;
      var label = field.name === 'interest' ? 'Asking about' : field.labels && field.labels[0]
        ? field.labels[0].textContent.replace(/\*|\(optional\)/g, '').trim()
        : field.name;
      payload[label] = value;
    });
    return payload;
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearState();

    var problem = form.elements.problem;
    var name = form.elements.contactName;
    var email = form.elements.contactEmail;
    if (problem.value.trim().length < MIN_PROBLEM) return fieldError(problem, MSG.problem);
    if (!name.value.trim()) return fieldError(name, MSG.name);
    if (!EMAIL_RE.test(email.value.trim())) return fieldError(email, MSG.email);

    // Spam trap: people never see or fill this field; bots do.
    if (form.elements._gotcha && form.elements._gotcha.value) { form.reset(); ok.hidden = false; return; }

    var endpoint = (form.getAttribute('data-endpoint') || '').trim();
    if (!endpoint) {
      if (window.console) console.error('[contact-form] Not connected. Set web3formsKey or intakeEndpoint in src/_data/site.json.');
      return showError(MSG.notConnected);
    }

    busy(true);
    var format = form.getAttribute('data-format');
    var init = { method: 'POST', headers: { Accept: 'application/json' } };
    if (format === 'web3forms') {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(web3formsPayload());
    } else if (format === 'json') {
      var data = {};
      new FormData(form).forEach(function (v, k) { if (typeof v === 'string' && v.trim()) data[k] = v; });
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(data);
    } else {
      init.body = new FormData(form);
    }

    fetch(endpoint, init)
      .then(function (res) {
        if (format === 'web3forms') {
          // Web3Forms answers { success, message }; only success means it was delivered.
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (res.ok && body.success) return sent();
            if (window.console) console.error('[contact-form] Web3Forms:', res.status, body && body.message);
            showError(MSG.server);
          });
        }
        if (res.ok) return sent();
        return res.json().catch(function () { return null; }).then(function (body) {
          var first = body && body.errors && body.errors[0];
          var field = first && first.field && form.elements[first.field];
          if (res.status === 422 && field) return fieldError(field, first.message);
          showError(res.status < 500 && first && first.message ? first.message : MSG.server);
        });
      })
      .catch(function () { showError(MSG.network); })
      .then(function () { busy(false); });
  });

  /* ---- Where the visitor came from ----
     ?plan=, ?care=, ?service= or ?product= (a "Start with…" button elsewhere on the
     site) shows what they're asking about and sends it as `interest`;
     ?estimate= (the estimator, which also sends ?plan=) replaces the
     plan's budget range with that exact ballpark. */
  var params;
  try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
  var budget = form.querySelector('#budgetRange');

  function chooseBudget(text) {
    if (!budget || !text || budget.value) return;
    var match = Array.prototype.find.call(budget.options, function (o) { return o.text === text; });
    if (!match) {
      match = document.createElement('option');
      match.textContent = text.slice(0, 200);
      budget.appendChild(match);
    }
    match.selected = true;
  }

  var box = form.querySelector('[data-interest]');
  var interests = {};
  try { interests = JSON.parse(form.querySelector('[data-interests]').textContent); } catch (e) { /* no context available */ }
  var kind = params && ['plan', 'care', 'service', 'product'].filter(function (k) { return params.get(k); })[0];
  var chosen = kind && interests[kind] && interests[kind][params.get(kind)];
  if (box && chosen) {
    box.querySelector('[data-interest-link]').textContent = chosen.label;
    box.querySelector('[data-interest-link]').href = chosen.href;
    box.querySelector('[data-interest-detail]').textContent = chosen.detail;
    box.querySelector('[data-interest-input]').value = chosen.label + ' (' + chosen.detail + ')';
    box.hidden = false;
    chooseBudget(chosen.budget);
    box.querySelector('[data-interest-clear]').addEventListener('click', function () {
      box.querySelector('[data-interest-input]').value = '';
      box.hidden = true;
      if (budget && budget.value === chosen.budget) budget.value = '';
      var problem = form.querySelector('#problem');
      if (problem) problem.focus();
    });
  }
  if (params && params.get('estimate')) {
    budget.value = '';
    chooseBudget(params.get('estimate'));
  }

  show(0, false);
})();
