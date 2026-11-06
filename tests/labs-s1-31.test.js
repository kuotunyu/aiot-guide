// Run: node aiot-guide/tests/labs-s1-31.test.js
const assert = require('assert');
const L = require('../static/assets/labs/s1-31.js');
const near = (a, b, e = 1e-9) => assert(Math.abs(a - b) <= e, a + ' != ' + b);

// Fixed sequence: same settings, same shots
assert.deepStrictEqual(L.makeShots(3131, 12), L.SHOTS);
assert.notDeepStrictEqual(L.makeShots(1, 12), L.SHOTS);
assert.strictEqual(L.SHOTS.length, 12);
assert.deepStrictEqual(L.readings(1.3, 0.7, 0.1), L.readings(1.3, 0.7, 0.1));

// Hand-checked statistics: mean 5, deviations -2 and +2, sample SD sqrt(8/1)
let s = L.stats([3, 7], 4);
near(s.mean, 5); near(s.error, 1); near(s.sd, Math.sqrt(8));
// Chapter's example of a stable but biased probe: 6.1, 6.2, 6.1, 6.2 against 4.0
s = L.stats([6.1, 6.2, 6.1, 6.2], 4);
near(s.mean, 6.15); near(s.error, 2.15); near(s.sd, Math.sqrt(0.01 / 3));

// No spread: every reading equals true value + bias, SD 0
const flat = L.stats(L.readings(2, 0, 0.1), L.TRUE_TEMP);
near(flat.mean, 6, 1e-6); near(flat.error, 2, 1e-6); near(flat.sd, 0, 1e-6);

// The four verdicts, and the boundary belongs to "not good"
assert.strictEqual(L.judge(0, 0.2).label, '又準又精');
assert.strictEqual(L.judge(2, 0.2).label, '精但不準');
assert.strictEqual(L.judge(-2, 0.2).label, '精但不準');
assert.strictEqual(L.judge(0, 1.2).label, '準但不精');
assert.strictEqual(L.judge(2.5, 1.2).label, '不準也不精');
assert.strictEqual(L.judge(0.5, 0).accurate, false);
assert.strictEqual(L.judge(0, 0.5).precise, false);
// The lab's presets must land on the verdict they are named after
for (const [b, sp, want] of [[0, 0.2, '又準又精'], [2, 0.2, '精但不準'], [0, 1.2, '準但不精'], [2.5, 1.2, '不準也不精']]) {
  const r = L.stats(L.readings(b, sp, 0.1), L.TRUE_TEMP);
  assert.strictEqual(L.judge(r.error, r.sd).label, want, want + ' ' + JSON.stringify(r));
}

// Resolution: rounding, no leftover binary noise
assert.strictEqual(L.quantize(6.34, 0.1), 6.3);
assert.strictEqual(L.quantize(6.26, 1), 6);
// A finer scale does not remove the bias
const fine = L.stats(L.readings(2, 0.2, 0.01), L.TRUE_TEMP), mid = L.stats(L.readings(2, 0.2, 0.1), L.TRUE_TEMP);
assert(Math.abs(fine.error - mid.error) < 0.05 && Math.abs(fine.error - 2) < 0.2);
// A coarse scale can hide the scatter: SD 0 though the probe still scatters
const coarse = L.stats(L.readings(0, 0.2, 1), L.TRUE_TEMP);
near(coarse.sd, 0); assert(fine.sd > 0.05);

// Pt100, values from the chapter
near(L.pt100R(0, 0.004), 100);
near(L.pt100R(100, 0.004), 140);
near(L.pt100R(100, 0.00385), 138.5);
near(L.pt100R(50, 0.004), 120);
near(L.pt100T(110, 0.004), 25);
near(L.pt100T(115.6, 0.0039), 40);
// Old opening state (T = 50): 120 ohm read back with 0.00385 gives 51.948 degC
near(L.pt100T(L.pt100R(50, 0.004), L.STD_ALPHA), 51.948, 0.001);
near(L.pt100R(50, 0.00385), 119.25);

// Type K, NIST table points
near(L.kMv(0), 0); near(L.kMv(25), 1.0); near(L.kMv(100), 4.096); near(L.kMv(-20), -0.778);
near(L.kTemp(4.096), 100, 1e-6); near(L.kTemp(1.0), 25, 1e-6); near(L.kTemp(-0.778), -20, 1e-6);
near(L.kTemp(L.kMv(37)), 37, 1e-6);
// Chapter's worked example: 3.10 mV with reference 25 degC -> 4.10 mV -> about 100 degC
near(L.kTemp(3.10 + L.kMv(25)), 100, 0.1);
// Same temperature on both ends gives no voltage
near(L.thermocouple(25, 25).measured, 0);
// Hand-checked: freezer at -20 with instrument at 25
const tc = L.thermocouple(-20, 25);
near(tc.measured, -1.778, 1e-6);
near(tc.none, -46.93, 0.01);
near(tc.addTemp, -21.93, 0.01);
near(tc.compensated, -20, 1e-6);
// Compensation recovers the hot-end temperature over the full slider range, and no value leaves the table
for (let hot = -40; hot <= 200; hot += 5) for (let ref = 0; ref <= 40; ref++) {
  const r = L.thermocouple(hot, ref);
  near(r.compensated, hot, 1e-6);
  assert(r.measured >= -3.554 && r.measured <= 8.138);
}

// Verdict wording follows the numbers at the boundaries of the sliders.
const v = (h, r) => L.tcVerdicts(h, r);
// Reference at 0 degC: table reading is already right, so "no compensation" must not be called wrong.
assert.strictEqual(v(100, 0)[0].cls, 'ok');
assert(v(100, 0)[0].why.includes('100.0°C'));
assert.strictEqual(v(100, 0)[1].st, '碰巧相同');
// Both ends equal: 0 mV reads as 0 degC (wrong), adding the reference happens to give the right answer.
assert.strictEqual(v(25, 25)[0].cls, 'no');
assert(v(25, 25)[0].why.includes('0.0°C'));
assert.strictEqual(v(25, 25)[1].st, '碰巧相同');
// Ordinary case: 100 degC with 25 degC reference, 3.096 mV -> 75.9 degC, plus 25 = 100.9 degC.
assert.strictEqual(v(100, 25)[0].cls, 'no');
assert.strictEqual(v(100, 25)[1].st, '有落差');
assert(v(100, 25)[1].why.includes('100.9°C'));
assert(v(-20, 25)[1].why.includes('−21.9°C'));
assert.strictEqual(v(-20, 25)[2].cls, 'ok');

// Lab's opening state matches the chapter's worked example on one screen:
// Pt100 at 100 degC with alpha 0.004 -> 140 ohm; standard 0.00385 -> 138.5 ohm; 140 ohm misread with 0.00385 -> 103.896 degC.
near(L.pt100R(100, 0.004), 140);
near(L.pt100T(140, L.STD_ALPHA), 103.896, 0.001);
// Type K at 100 degC with reference 25 degC: 4.096 - 1.000 = 3.096 mV (the chapter's "about 3.10 mV").
const open = L.thermocouple(100, 25);
near(open.measured, 3.096, 1e-6);
near(open.compensated, 100, 1e-6);

console.log('s1-31 labs ok');
