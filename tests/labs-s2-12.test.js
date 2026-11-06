// Run: node aiot-guide/tests/labs-s2-12.test.js
const assert = require('assert');
const {CASES, findCase, suspects, judge, nextStep, i2cRiseTime} = require('../static/assets/labs/s2-12.js');

assert(CASES.length >= 3 && CASES.length <= 4);

for (const c of CASES) {
  const causeIds = c.causes.map(x => x.id), all = c.checks.map(k => k.id);
  assert(causeIds.includes(c.truth), c.id);
  assert.strictEqual(new Set(all).size, all.length, c.id + ' check ids unique');
  for (const k of c.checks) {
    for (const x of k.rules.concat(k.supports)) assert(causeIds.includes(x), c.id + '/' + k.id + '/' + x);
    assert(k.result.length && k.can && k.cannot, c.id + '/' + k.id);
    // No check may exclude the true cause, and none may both exclude and support one cause.
    assert(!k.rules.includes(c.truth), c.id + '/' + k.id);
    assert(!k.rules.some(x => k.supports.includes(x)), c.id + '/' + k.id);
  }
  // Starts undecided: nothing is excluded or solid before any check.
  assert(suspects(c, []).every(x => x.status === 'maybe'), c.id);
  for (const x of causeIds) assert.strictEqual(judge(c, x, []).kind, 'notYet', c.id + '/' + x);
  // With every check done: only the truth stands, and every other cause was excluded by something.
  assert.strictEqual(judge(c, c.truth, all).kind, 'solid', c.id);
  for (const x of causeIds.filter(y => y !== c.truth)) assert.strictEqual(judge(c, x, all).kind, 'ruledOut', c.id + '/' + x);
  // At least one check is a pure clue: it excludes and confirms nothing.
  assert(c.checks.some(k => !k.rules.length && !k.supports.length), c.id + ' has a clue-only check');
  // Unknown cause does not crash.
  assert.strictEqual(judge(c, 'nope', all).kind, 'unknown');
}

// ping failing does not mean no power.
const nd = findCase('nodata');
assert.strictEqual(suspects(nd, ['ping']).find(x => x.id === 'power').status, 'maybe');
assert.deepStrictEqual(nd.checks.find(k => k.id === 'ping').rules, []);
// The meter excludes power but says nothing about the firmware.
assert.strictEqual(suspects(nd, ['meter']).find(x => x.id === 'power').status, 'no');
assert.strictEqual(suspects(nd, ['meter']).find(x => x.id === 'hang').status, 'maybe');
// The change log is suggestive only; it cannot finish the case.
assert.strictEqual(judge(nd, 'wifi', ['changes', 'others']).kind, 'notYet');
// Minimal solid path.
assert.strictEqual(judge(nd, 'wifi', ['others', 'serial']).kind, 'solid');
// Evidence for it, but something still open.
const nd1 = judge(nd, 'wifi', ['serial']);
assert.deepStrictEqual([nd1.kind, nd1.supported, nd1.open], ['notYet', true, ['共同設備']]);
// Choosing an excluded cause names the check that did it.
assert.deepStrictEqual(judge(nd, 'power', ['meter']), {kind: 'ruledOut', by: '三用電錶量電源'});

// Garbled serial: matching settings do not end the case; the meter cannot exclude resets.
const ga = findCase('garbled');
assert.strictEqual(suspects(ga, ['settings']).find(x => x.id === 'baud').status, 'no');
assert.strictEqual(judge(ga, 'ground', ['settings']).kind, 'notYet');
assert.strictEqual(suspects(ga, ['volt']).find(x => x.id === 'reset').status, 'maybe');
assert.strictEqual(judge(ga, 'ground', ['settings', 'logic', 'continuity']).kind, 'solid');
assert.strictEqual(judge(ga, 'ground', ['settings', 'logic']).kind, 'notYet');

// DNS: ping is given in the symptom; the port check does not clear the login.
const dn = findCase('dns');
assert.strictEqual(suspects(dn, ['nc']).find(x => x.id === 'creds').status, 'maybe');
assert.strictEqual(judge(dn, 'resolver', ['lookup', 'lookup2', 'nc', 'brokerlog']).kind, 'solid');
assert.strictEqual(judge(dn, 'resolver', ['lookup', 'lookup2', 'nc']).kind, 'notYet');

// I2C: scan and meter do not settle an intermittent fault.
const i2 = findCase('i2c');
assert.strictEqual(suspects(i2, ['meter']).find(x => x.id === 'power').status, 'maybe');
assert.strictEqual(suspects(i2, ['scopevcc']).find(x => x.id === 'power').status, 'no');
assert.strictEqual(suspects(i2, ['scan']).find(x => x.id === 'signal').status, 'maybe');
assert.strictEqual(judge(i2, 'signal', ['scan', 'scopevcc', 'wiggle', 'swap', 'scopesda']).kind, 'solid');
assert.strictEqual(judge(i2, 'signal', ['scan', 'meter', 'wiggle', 'swap', 'scopesda']).kind, 'notYet');

// Hand check: 0.8473 x 4700 ohm x 350 pF = 1.394 us; 2200 ohm gives 0.652 us. 100 kHz limit is 1 us.
assert(Math.abs(i2cRiseTime(4700, 350e-12) - 1.394e-6) < 1e-9);
assert(Math.abs(i2cRiseTime(2200, 350e-12) - 0.652e-6) < 1e-9);
assert(i2cRiseTime(4700, 350e-12) > 1e-6 && i2cRiseTime(2200, 350e-12) < 1e-6);

// The verdict only counts checks whose interpretation was read; unread results are pointed out first.
assert.strictEqual(nextStep([], []), '再選一項檢查。');
assert.strictEqual(nextStep(['meter', 'serial'], ['meter', 'serial']), '再選一項檢查。');
assert.strictEqual(nextStep(['meter', 'serial'], ['meter']), '還有 1 項檢查的結果沒看解讀，先看過再算證據。');
assert.strictEqual(nextStep(['meter', 'serial', 'others'], []), '還有 3 項檢查的結果沒看解讀，先看過再算證據。');
// Same checks, before and after reading: the judgement follows what was read.
assert.strictEqual(judge(nd, 'wifi', []).kind, 'notYet');
assert.strictEqual(judge(nd, 'wifi', ['others', 'serial']).kind, 'solid');

console.log('labs-s2-12 ok');
