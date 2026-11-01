/* Shared helpers for chapter labs (assets/labs/<chapter>.js). Each lab registers a render function by name. */
(function (root) {
  'use strict';
  const registry = {};
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const $$ = (s, r) => [...r.querySelectorAll(s)];
  function radios(name, label, options, value) {
    return '<fieldset class="lab-field"><legend>' + esc(label) + '</legend><div class="seg">' + options.map((o, i) =>
      '<label><input type="radio" name="' + name + '" value="' + i + '"' + (i === value ? ' checked' : '') + '><span>' + esc(o) + '</span></label>').join('') + '</div></fieldset>';
  }
  function slider(id, label, min, max, step, value, unit) {
    return '<label class="lab-slider" for="' + id + '"><span>' + esc(label) + '：<output for="' + id + '">' + esc(value) + esc(unit || '') + '</output></span><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"></label>';
  }
  root.AIOTLab = {esc, $$, radios, slider, register(name, fn) { registry[name] = fn; }};
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-lab]').forEach(el => { const f = registry[el.dataset.lab]; if (f) f(el); });
  });
})(this);
