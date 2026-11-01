// Run: node aiot-guide/tests/labs-s2-23.test.js
const assert = require('assert');
const {computeOee, computePayback, chartHorizon, pct, money} = require('../static/assets/labs/s2-23.js');
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-9, (msg || '') + ' got ' + a + ' want ' + b);
const base = {planned: 500, downtime: 50, cycle: 6, total: 3600, good: 3420};

// Hand-worked chapter example: 450/500, 360/450, 3420/3600, 342/500
let r = computeOee(base);
assert(r.ok);
near(r.avail, 0.9); near(r.perf, 0.8); near(r.quality, 0.95); near(r.oee, 0.684);
near(r.oee, r.avail * r.perf * r.quality);
near(r.runMin, 450); near(r.netMin, 360); near(r.goodMin, 342);
near(r.loss.down, 50); near(r.loss.speed, 90); near(r.loss.defect, 18);
near(r.goodMin + r.loss.down + r.loss.speed + r.loss.defect, 500, 'losses add up to planned');
assert.strictEqual(r.lowest, 'perf'); assert.strictEqual(r.largest, 'speed');
near(r.average, (0.9 + 0.8 + 0.95) / 3); assert(r.average > r.oee);

// The chapter's worked exam-style example: 400/500, 0.5 min = 30 s, 648 good of 720
r = computeOee({planned: 500, downtime: 100, cycle: 30, total: 720, good: 648});
near(r.avail, 0.8); near(r.perf, 0.9); near(r.quality, 0.9); near(r.oee, 0.648);
assert.strictEqual(r.lowest, 'avail');

// Lowest rate and largest minute loss can disagree: A 85% (75 min) vs P 83.8% (69 min)
r = computeOee({planned: 500, downtime: 75, cycle: 6, total: 3560, good: 3380});
assert(r.ok); assert.strictEqual(r.lowest, 'perf'); assert.strictEqual(r.largest, 'down');
near(r.loss.down, 75); near(r.loss.speed, 425 - 356);

// Tie in minutes (speed 60, defect 60): name the loss that matches the lowest rate
r = computeOee({planned: 500, downtime: 40, cycle: 6, total: 4000, good: 3400});
near(r.loss.speed, 60); near(r.loss.defect, 60);
assert.strictEqual(r.lowest, 'quality'); assert.strictEqual(r.largest, 'defect');

// Guards: impossible input
assert(!computeOee({...base, good: 3601}).ok);
assert(computeOee({...base, good: 3600}).ok, 'all good is possible');
assert(!computeOee({...base, downtime: 501}).ok);
assert(!computeOee({...base, planned: 0, downtime: 0}).ok);
assert(!computeOee({...base, cycle: 0}).ok);
assert(!computeOee({...base, downtime: -1}).ok);
assert(!computeOee({...base, total: NaN}).ok);
assert(!computeOee({...base, total: '3600'}).ok);
// Faster than the ideal cycle allows: 450 min at 6 s = 4500 boxes at most
assert(computeOee({...base, total: 4500, good: 4500}).ok);
near(computeOee({...base, total: 4500, good: 4500}).oee, 0.9);
r = computeOee({...base, total: 4520, good: 3000});
assert(!r.ok); assert(r.errors[0].includes('4500'));
// Both problems at once are both reported
assert.strictEqual(computeOee({...base, downtime: 600, total: 10, good: 20}).errors.length, 2);

// Edges that are possible: no output, or down for the whole shift
r = computeOee({...base, total: 0, good: 0});
assert(r.ok); assert.strictEqual(r.quality, null); near(r.perf, 0); near(r.oee, 0);
assert.strictEqual(r.average, null);
r = computeOee({...base, downtime: 500, total: 0, good: 0});
assert(r.ok); near(r.avail, 0); assert.strictEqual(r.perf, null); near(r.oee, 0);
assert(!computeOee({...base, downtime: 500, total: 20, good: 0}).ok, 'cannot produce with no run time');
// Perfect shift: 500 min at 6 s = 5000 boxes
r = computeOee({planned: 500, downtime: 0, cycle: 6, total: 5000, good: 5000});
near(r.oee, 1); assert(r.noLoss);

// Payback, chapter table: 120000 / (15000 - 3000) = 10 months
let p = computePayback({invest: 120000, saving: 15000, fee: 3000});
assert(p.ok && p.recovers);
near(p.net, 12000); near(p.months, 10); near(p.naiveMonths, 8);
near(p.roiNet, 0.2); near(p.roiTco, 24000 / 156000); near(p.yearEnd, 24000);
// Exactly one year: ROI is 0
p = computePayback({invest: 180000, saving: 20000, fee: 5000});
near(p.months, 12); near(p.roiNet, 0);
// Saving below fee, or equal: never recovers
p = computePayback({invest: 120000, saving: 4000, fee: 6000});
assert(!p.recovers); assert.strictEqual(p.months, null); near(p.net, -2000); assert(p.roiNet < -1);
p = computePayback({invest: 120000, saving: 6000, fee: 6000});
assert(!p.recovers); assert.strictEqual(p.months, null); near(p.roiNet, -1);
p = computePayback({invest: 120000, saving: 0, fee: 0});
assert(!p.recovers); assert.strictEqual(p.naiveMonths, null);
// Guards
assert(!computePayback({invest: 0, saving: 1, fee: 0}).ok);
assert(!computePayback({invest: 1, saving: -1, fee: 0}).ok);
assert(!computePayback({invest: 1, saving: Infinity, fee: 0}).ok);

// Chart span
assert.strictEqual(chartHorizon(null), 24);
assert.strictEqual(chartHorizon(5), 12);
assert.strictEqual(chartHorizon(10), 12);
assert.strictEqual(chartHorizon(24), 29);
assert.strictEqual(chartHorizon(600), 60);

// Formatting
assert.strictEqual(pct(0.684), '68.4%');
assert.strictEqual(money(-120000), '−120,000');
console.log('labs-s2-23: all passed');
