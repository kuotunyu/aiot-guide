// Run: node aiot-guide/tests/labs-s2-21.test.js
const assert = require('assert');
const {pinState, sampleReads, batteryEstimate, batteryAdvice, formatDays, BATTERY_PRESETS, labEstimate, vsExample} = require('../static/assets/labs/s2-21.js');

// Input pin truth table
const level = (m, p) => pinState(m, p).level;
assert.strictEqual(level('pullup', false), 'HIGH');
assert.strictEqual(level('pullup', true), 'LOW');
assert.strictEqual(level('pulldown', false), 'LOW');
assert.strictEqual(level('pulldown', true), 'HIGH');
assert.strictEqual(level('floating', true), 'LOW');
assert.strictEqual(level('floating', false), 'UNKNOWN');

// Wiring: the resistor sits on the opposite rail from the button; floating has no resistor at all
assert.strictEqual(pinState('pullup', false).top, 'resistor');
assert.strictEqual(pinState('pullup', false).bottom, 'button');
assert.strictEqual(pinState('pulldown', false).top, 'button');
assert.strictEqual(pinState('pulldown', false).bottom, 'resistor');
assert.strictEqual(pinState('floating', false).top, 'none');

// Reads: a driven pin is stable, a floating pin follows the noise source
assert.deepStrictEqual(sampleReads('HIGH', 3, () => 0), [1, 1, 1]);
assert.deepStrictEqual(sampleReads('LOW', 3, () => 0.9), [0, 0, 0]);
const noise = [0.1, 0.9, 0.4, 0.6];
assert.deepStrictEqual(sampleReads('UNKNOWN', 4, () => noise.shift()), [1, 0, 1, 0]);

// Battery. Hand-checked: (20×1 + 0.1×59) ÷ 60 = 25.9 ÷ 60 = 0.43167 mA; 2000 ÷ 0.43167 = 4633 h = 193 d
const near = (a, b, tol) => assert(Math.abs(a - b) <= tol, a + ' !~ ' + b);
const a = batteryEstimate({activeMa: 20, sleepUa: 100, activeSec: 1, intervalSec: 60, capacityMah: 2000});
near(a.avgMa, 0.43167, 1e-4);
near(a.hours, 4633, 1);
near(a.days, 193, 0.2);

// (40×2 + 0.1×198) ÷ 200 = 0.499 mA; 1200 ÷ 0.499 = 2405 h = 100 d
const b = batteryEstimate({activeMa: 40, sleepUa: 100, activeSec: 2, intervalSec: 200, capacityMah: 1200});
near(b.avgMa, 0.499, 1e-6);
near(b.days, 100.2, 0.1);

// Lab defaults: (80×5 + 0.1×295) ÷ 300 = 1.43167 mA; 2000 ÷ 1.43167 = 1397 h = 58.2 d
const c = batteryEstimate({activeMa: 80, sleepUa: 100, activeSec: 5, intervalSec: 300, capacityMah: 2000});
near(c.avgMa, 1.43167, 1e-4);
near(c.days, 58.2, 0.1);
near(c.workShare, 400 / 429.5, 1e-6);
near(c.workShare + c.sleepShare, 1, 1e-9);
near(c.maxDays, 833.3, 0.1); // 2000 ÷ 0.1 = 20000 h
near(c.halfCapacityDays, c.days / 2, 1e-9);

// The interval from the chapter's question: 12 times longer does not give 12 times the life
const d = batteryEstimate({activeMa: 80, sleepUa: 100, activeSec: 5, intervalSec: 3600, capacityMah: 2000});
near(d.avgMa, (400 + 359.5) / 3600, 1e-9);
assert(d.days / c.days > 6 && d.days / c.days < 8);
assert(d.days < d.maxDays);

// Boundaries: never asleep, and work time longer than the interval is clamped
const always = batteryEstimate({activeMa: 50, sleepUa: 100, activeSec: 60, intervalSec: 60, capacityMah: 1000});
near(always.avgMa, 50, 1e-9);
near(always.hours, 20, 1e-9);
assert.strictEqual(always.sleepShare, 0);
const clamped = batteryEstimate({activeMa: 50, sleepUa: 100, activeSec: 90, intervalSec: 60, capacityMah: 1000});
near(clamped.avgMa, 50, 1e-9);
const none = batteryEstimate({activeMa: 0, sleepUa: 0, activeSec: 1, intervalSec: 60, capacityMah: 1000});
assert.strictEqual(none.hours, Infinity);
assert.strictEqual(none.maxDays, Infinity);

// Advice follows where the charge goes
assert(batteryAdvice({workShare: 0.9, sleepShare: 0.1}).includes('拉長回報間隔'));
assert(batteryAdvice({workShare: 0.3, sleepShare: 0.7}).includes('休眠電流更低'));
assert(batteryAdvice({workShare: 0.6, sleepShare: 0.4}).includes('兩邊'));

// Day formatting
assert.strictEqual(formatDays(1.25), '1.3 天');
assert.strictEqual(formatDays(58.2), '58 天');
assert.strictEqual(formatDays(833.3), '833 天（約 2.3 年）');
assert.strictEqual(formatDays(Infinity), '無上限');

// The three chips, hand-calculated against the chapter's example (58.2 days)
const [ex, hour, hourLow] = BATTERY_PRESETS.map(p => p.v);
near(labEstimate(ex).days, 58.2, 0.1);                 // 2000 ÷ 1.43167 mA ÷ 24
assert.strictEqual(vsExample(ex), null);               // no comparison when the settings are the example
// 1 hour: (80×5 + 0.1×3595) ÷ 3600 = 0.21097 mA; 2000 ÷ 0.21097 = 9480 h = 395 d, about 6.8 times
near(labEstimate(hour).avgMa, 759.5 / 3600, 1e-9);
near(labEstimate(hour).days, 395, 0.5);
near(vsExample(hour), 6.8, 0.05);
// 1 hour and 10 µA sleep: (400 + 0.01×3595) ÷ 3600 = 0.12110 mA; 16515 h = 688 d, about 11.8 times
near(labEstimate(hourLow).avgMa, 435.95 / 3600, 1e-9);
near(labEstimate(hourLow).days, 688, 0.5);
near(vsExample(hourLow), 11.8, 0.05);
assert(vsExample(hourLow) < 12);                       // close to 12 times only once sleep current is low
assert.strictEqual(vsExample(Object.assign({}, ex, {cap: 2100})) !== null, true);

console.log('labs-s2-21: all passed');
