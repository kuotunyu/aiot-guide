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

// "Forgot the fee" dashed line. Chapter example: H 12, zero line at 34 + 162 × 24000/144000 = 61,
// start (62, 196), wrong month 8 at x 62 + 366 × 8/12 = 306.
const {naiveMark, chartScale, textWidth} = require('../static/assets/labs/s2-23.js');
const mark = v => naiveMark(computePayback(v), v);
let m = mark({invest: 120000, saving: 15000, fee: 3000});
near(m.x0, 62); near(m.y0, 196); near(m.x1, 306); near(m.y1, 61);
assert.strictEqual(m.label, '忘了扣月費：第 8 個月（錯）');
near(m.w, 12 * 13 + 3 * 7.8);
// Under the zero line (baseline 79), ending 6 px left of where the dashed line is at y 82:
// 306 − 21 × 244/135 = 268.044…, so lx = 262.044…
near(m.ly, 79); assert.strictEqual(m.anchor, 'end');
near(m.lx, 306 - 21 * 244 / 135 - 6); assert(m.lx - m.w >= 66);
// Large investment: H 29, zero line at 34 + 162 × 125000/725000, wrong month 20 at 62 + 366 × 20/29
m = mark({invest: 600000, saving: 30000, fee: 5000});
near(m.x1, 62 + 366 * 20 / 29); near(m.y1, 34 + 162 * 125000 / 725000);
assert.strictEqual(m.label, '忘了扣月費：第 20 個月（錯）'); assert.strictEqual(m.anchor, 'end');
assert(m.lx !== null && m.lx - m.w >= 66);
// The scale is the same with or without the dashed line
near(chartScale(computePayback({invest: 600000, saving: 30000, fee: 5000}), {invest: 600000, saving: 30000, fee: 5000}).H, 29);
// No fee means no mistake to show; fee above saving: wrong month 30 is past the 24-month chart
assert.strictEqual(mark({invest: 120000, saving: 15000, fee: 0}), null);
assert.strictEqual(mark({invest: 120000, saving: 4000, fee: 6000}), null);
assert.strictEqual(mark({invest: 120000, saving: 0, fee: 3000}), null);
// Steep lines, no room left of the dashed line: label goes right of the true line.
// net 50000, months 2.4, H 12, zero line at 34 + 162 × 0.8 = 163.6
m = mark({invest: 120000, saving: 60000, fee: 10000});
near(m.y1, 163.6); assert.strictEqual(m.anchor, 'start');
// Starts 10 px right of the payback dot at x 62 + 366 × 2.4/12 = 135.2
// (the true line there is only at 135.2 − 5 × 73.2/32.4 + 8 ≈ 131.9)
near(m.lx, 62 + 366 * 2.4 / 12 + 10);
assert(m.lx + m.w <= 428);
// Zero line near the bottom (y 193.7): no room under it, line drawn without a label
m = mark({invest: 10000, saving: 60000, fee: 1000});
assert(m !== null); assert.strictEqual(m.lx, null);
assert.strictEqual(textWidth('第 8 個', 13), 2 * 13 + 3 * 7.8);

// Worked lines under the chart (they replace the chapter's old table).
const {paybackLines} = require('../static/assets/labs/s2-23.js');
const lines = v => paybackLines(computePayback(v), v);
// Chapter example: 15,000 − 3,000 = 12,000; 120,000 ÷ 12,000 = 10 (gross: ÷ 15,000 = 8);
// ROI (144,000 − 120,000) ÷ 120,000 = 20%; with the fee as cost: (180,000 − 156,000) ÷ 156,000 = 15.38…%
let L = lines({invest: 120000, saving: 15000, fee: 3000});
assert.deepStrictEqual(L.lines, [
  '每月淨節省＝15,000－3,000＝12,000 元',
  '回收期＝120,000÷12,000＝10 個月（忘了扣月費：120,000÷15,000＝8 個月，錯）',
  '首年 ROI＝(12,000×12－120,000)÷120,000＝20%',
]);
assert.strictEqual(L.note, '若把首年持續費用也算進成本，首年 ROI ≈ 15.4%。比較方案時口徑要一致。');
// No fee: no "forgot the fee" aside and no second ROI. 120,000 ÷ 15,000 = 8; (180,000 − 120,000) ÷ 120,000 = 50%
L = lines({invest: 120000, saving: 15000, fee: 0});
assert.strictEqual(L.lines[1], '回收期＝120,000÷15,000＝8 個月');
assert.strictEqual(L.lines[2], '首年 ROI＝(15,000×12－120,000)÷120,000＝50%');
assert.strictEqual(L.note, null);
// Rounded results get "≈": 120,000 ÷ 7,000 = 17.14…; 0.3 × 100 is not exactly 30 in floating point but is shown with "＝"
L = lines({invest: 120000, saving: 10000, fee: 3000});
assert.strictEqual(L.lines[1], '回收期＝120,000÷7,000≈17.1 個月（忘了扣月費：120,000÷10,000＝12 個月，錯）');
assert.strictEqual(L.lines[2], '首年 ROI＝(7,000×12－120,000)÷120,000＝−30%');
// Fee above saving: line 1 still shows the negative sum, line 2 says it never pays back.
// ROI (−24,000 − 120,000) ÷ 120,000 = −120%; with the fee as cost (48,000 − 192,000) ÷ 192,000 = −75%
L = lines({invest: 120000, saving: 4000, fee: 6000});
assert.deepStrictEqual(L.lines, [
  '每月淨節省＝4,000－6,000＝−2,000 元',
  '回不了本。每月節省小於費用，用越久虧越多。',
  '首年 ROI＝(−2,000×12－120,000)÷120,000＝−120%',
]);
assert.strictEqual(L.note, '若把首年持續費用也算進成本，首年 ROI ＝ −75%。比較方案時口徑要一致。');
L = lines({invest: 120000, saving: 6000, fee: 6000});
assert.strictEqual(L.lines[0], '每月淨節省＝6,000－6,000＝0 元');
assert(L.lines[1].startsWith('回不了本。節省剛好被費用抵銷'));
assert.strictEqual(L.lines[2], '首年 ROI＝(0×12－120,000)÷120,000＝−100%');
// Past five years: 600,000 ÷ 9,000 = 66.67 months
L = lines({invest: 600000, saving: 9000, fee: 0});
assert(L.lines[1].startsWith('回收期＝600,000÷9,000≈66.7 個月。超過 5 年才回本'));

// Line breaks on a phone: operands and "N 個月" stay whole; "＝" and the CJK words still break.
const {keepTogether} = require('../static/assets/labs/s2-23.js');
const WJ = '⁠';
// A long operand may still break right after "÷".
assert.strictEqual(keepTogether('120,000÷15,000＝8 個月，錯）'),
  ['1', '2', '0', ',', '0', '0', '0', '÷'].join(WJ) + '\u200b' + ['1', '5', ',', '0', '0', '0'].join(WJ) + '＝8 個' + WJ + '月' + WJ + '，' + WJ + '錯' + WJ + '）');
assert.strictEqual(keepTogether('首年 ROI＝(1－2)÷3').split(WJ).join('').replace('\u200b', ''), '首年 ROI＝(1－2)÷3', 'only joiners and one break are added');

// Formatting
assert.strictEqual(pct(0.684), '68.4%');
assert.strictEqual(money(-120000), '−120,000');
console.log('labs-s2-23: all passed');
