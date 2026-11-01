// Run: node aiot-guide/tests/labs-s1-12.test.js
const assert = require('assert');
const {HEALTHY, FAILING, SCENARIOS, T_MIN, T_MAX, confusion, strategyCosts, bestThreshold, tradeoffSay} = require('../static/assets/labs/s1-12.js');

const [fresh, vaccine, remote, cheap] = SCENARIOS;
assert.strictEqual(HEALTHY.length, 18);
assert.strictEqual(FAILING.length, 6);

// Hand-counted confusion values, including the "at or above" boundary
assert.deepStrictEqual(confusion(5.0), {falseAlarms: 1, caught: 3, missed: 3});
assert.deepStrictEqual(confusion(3.7), {falseAlarms: 5, caught: 6, missed: 0});
assert.deepStrictEqual(confusion(3.8), {falseAlarms: 5, caught: 5, missed: 1});
assert.deepStrictEqual(confusion(5.2), {falseAlarms: 1, caught: 3, missed: 3});
assert.deepStrictEqual(confusion(5.3), {falseAlarms: 0, caught: 3, missed: 3});
assert.deepStrictEqual(confusion(T_MIN), {falseAlarms: 18, caught: 6, missed: 0});
assert.deepStrictEqual(confusion(T_MAX), {falseAlarms: 0, caught: 0, missed: 6});

// No threshold on the slider is perfect, and lowering it never increases misses
let previous = null;
for (let i = T_MIN * 10; i <= T_MAX * 10; i++) {
  const c = confusion(i / 10);
  assert(c.falseAlarms + c.missed > 0, 'threshold ' + i / 10);
  assert.strictEqual(c.caught + c.missed, 6);
  if (previous) assert(c.falseAlarms <= previous.falseAlarms && c.missed >= previous.missed);
  previous = c;
}

// Hand-calculated costs, fresh scenario at the opening threshold 5.0: 6 + 1*3 + 3*2 + 3*10 = 45
assert.deepStrictEqual(strategyCosts(5.0, fresh), {reactive: 60, scheduled: 48, predictive: 45});
// A threshold above every reading costs more than never monitoring: 6 + 6*10 = 66
assert.strictEqual(strategyCosts(T_MAX, fresh).predictive, 66);

// The cheapest threshold moves with the cost of each error
assert.deepStrictEqual(bestThreshold(fresh), {cost: 32, lo: 4.4, hi: 4.4});     // 6 + 2*3 + 5*2 + 1*10
assert.deepStrictEqual(bestThreshold(vaccine), {cost: 33, lo: 3.7, hi: 3.7});   // 6 + 5*3 + 6*2
assert.deepStrictEqual(bestThreshold(remote), {cost: 42, lo: 5.3, hi: 5.5});    // 6 + 0 + 3*2 + 3*10
assert.deepStrictEqual(bestThreshold(cheap), {cost: 21, lo: 5.3, hi: 5.5});     // 6 + 0 + 3*2 + 3*3

// Which strategy wins depends on the scenario; cheap, replaceable machines favour reactive repair
assert.deepStrictEqual(strategyCosts(5.3, cheap), {reactive: 18, scheduled: 27, predictive: 21});
assert.strictEqual(strategyCosts(3.7, vaccine).reactive, 360);
assert.strictEqual(strategyCosts(5.3, remote).scheduled, 108);   // 24*3 + 3*2 + 3*10

// Messages cover the extremes
assert(tradeoffSay(confusion(T_MAX)).includes('完全不告警'));
assert(tradeoffSay(confusion(T_MIN)).includes('等於沒有判斷'));
assert(tradeoffSay(confusion(3.7)).includes('5 台'));
assert(tradeoffSay(confusion(5.3)).includes('3 台'));

console.log('s1-12 labs: all tests passed');
