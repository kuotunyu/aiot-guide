// Run: node aiot-guide/tests/labs-s2-11.test.js
const assert = require('assert');
const {RESEND_EVERY, simulateOutage, lesson} = require('../static/assets/labs/s2-11.js');

const base = {minutes: 20, perMinute: 30, capacity: 450, policy: 'old', dedupe: false};

// Hand check: 20 x 30 = 600 records, 450 fit, so 150 are lost. The buffer fills at 450 / 30 = 15 min.
let r = simulateOutage(base);
assert.strictEqual(RESEND_EVERY, 10);
assert.strictEqual(r.total, 600);
assert.strictEqual(r.kept, 450);
assert.strictEqual(r.lost, 150);
assert.strictEqual(r.fullAtMin, 15);
// Drop oldest: records 151..600 survive, measured from minute 150 / 30 = 5 to minute 20.
assert.strictEqual(r.keptFrom, 151);
assert.strictEqual(r.keptTo, 600);
assert.strictEqual(r.keptStartMin, 5);
assert.strictEqual(r.keptEndMin, 20);
// Every 10th replayed record is resent: 450 / 10 = 45. The 10th survivor is record 160.
assert.strictEqual(r.dups, 45);
assert.strictEqual(r.dupIds[0], 160);
assert.strictEqual(r.dupIds[44], 600);
// Without IDs the duplicates stay: 450 + 45 = 495 rows.
assert.strictEqual(r.dbRows, 495);
assert.strictEqual(r.excess, 45);
assert.strictEqual(r.removed, 0);

// With event IDs: back to 450 rows, and the lost records are not recovered.
r = simulateOutage({...base, dedupe: true});
assert.strictEqual(r.dbRows, 450);
assert.strictEqual(r.removed, 45);
assert.strictEqual(r.excess, 0);
assert.strictEqual(r.lost, 150);

// Drop newest: same counts, opposite end of the outage survives.
r = simulateOutage({...base, policy: 'new'});
assert.strictEqual(r.kept, 450);
assert.strictEqual(r.lost, 150);
assert.strictEqual(r.keptFrom, 1);
assert.strictEqual(r.keptTo, 450);
assert.strictEqual(r.keptStartMin, 0);
assert.strictEqual(r.keptEndMin, 15);
assert.strictEqual(r.dupIds[0], 10);
assert.strictEqual(r.dupIds[44], 450);

// Capacity to spare: 10 x 10 = 100 records, nothing lost, never full, 10 resent.
r = simulateOutage({...base, minutes: 10, perMinute: 10, capacity: 500});
assert.strictEqual(r.lost, 0);
assert.strictEqual(r.fullAtMin, null);
assert.strictEqual(r.peak, 100);
assert.strictEqual(r.dups, 10);
assert.strictEqual(r.dbRows, 110);

// Boundary: capacity exactly equals the records produced, so nothing overflows.
r = simulateOutage({...base, minutes: 10, perMinute: 10, capacity: 100});
assert.strictEqual(r.lost, 0);
assert.strictEqual(r.fullAtMin, null);
assert.strictEqual(r.peak, 100);

// Boundary: one record over capacity. Each policy loses exactly one, from a different end.
r = simulateOutage({...base, minutes: 10, perMinute: 10, capacity: 99});
assert.strictEqual(r.lost, 1);
assert.strictEqual(r.keptFrom, 2);
r = simulateOutage({...base, minutes: 10, perMinute: 10, capacity: 99, policy: 'new'});
assert.strictEqual(r.lost, 1);
assert.strictEqual(r.keptTo, 99);

// Fewer than 10 survivors: no resend happens.
r = simulateOutage({...base, minutes: 5, perMinute: 5, capacity: 9});
assert.strictEqual(r.kept, 9);
assert.strictEqual(r.dups, 0);
assert.strictEqual(r.dbRows, 9);
assert.strictEqual(r.excess, 0);

// Fractional full time: 50 / 15 minutes.
r = simulateOutage({...base, minutes: 5, perMinute: 15, capacity: 50});
assert(Math.abs(r.fullAtMin - 50 / 15) < 1e-9);

// Zero capacity keeps nothing under either policy.
['old', 'new'].forEach(policy => {
  r = simulateOutage({...base, capacity: 0, policy});
  assert.strictEqual(r.kept, 0);
  assert.strictEqual(r.lost, 600);
  assert.strictEqual(r.keptFrom, null);
  assert.strictEqual(r.dbRows, 0);
});

// Largest slider values stay consistent: 120 x 60 = 7200 records, 2000 kept, 200 resent.
r = simulateOutage({minutes: 120, perMinute: 60, capacity: 2000, policy: 'old', dedupe: false});
assert.strictEqual(r.total, 7200);
assert.strictEqual(r.kept + r.lost, r.total);
assert.strictEqual(r.dups, 200);
assert.strictEqual(r.dbRows, 2200);

// The on-screen sentence matches the outcome.
let say = lesson(simulateOutage(base), base);
assert(say.includes('第 15 分鐘'));
assert(say.includes('最前面 5 分鐘'));
assert(say.includes('多了 45 筆'));
const newest = {...base, policy: 'new', dedupe: true};
say = lesson(simulateOutage(newest), newest);
assert(say.includes('最後 5 分鐘'));
assert(say.includes('救不回遺失的 150 筆'));
const roomy = {minutes: 10, perMinute: 10, capacity: 500, policy: 'old', dedupe: true};
say = lesson(simulateOutage(roomy), roomy);
assert(say.includes('可撐 50 分鐘'));
assert(!say.includes('救不回'));

console.log('labs-s2-11: all passed');
