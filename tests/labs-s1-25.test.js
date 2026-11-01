// Run: node aiot-guide/tests/labs-s1-25.test.js
const assert = require('assert');
const {KEYS, PURPOSES, EVENTS, evaluateKey, judgeEvent} = require('../static/assets/labs/s1-25.js');

// [owner, kind] -> [usable, receiver, outsider, ok], reasoned by hand from who holds which key.
const expected = {
  encrypt: {
    'platform:public': [true, true, false, true], // only the platform can open
    'platform:private': [false, true, true, false], // the device does not hold it
    'device:public': [true, false, false, false], // not even the platform can open
    'device:private': [true, true, true, false], // everyone can open
  },
  sign: {
    'platform:private': [true, true, false, true], // only the platform can sign, the device verifies
    'platform:public': [true, false, true, false], // anyone can forge, the device cannot verify
    'device:public': [true, true, true, false], // anyone can forge
    'device:private': [false, true, false, false], // the platform does not hold it, though the device could verify
  },
};
for (const p of Object.keys(expected)) for (const k of Object.keys(expected[p])) {
  const [owner, kind] = k.split(':'), r = evaluateKey(p, owner, kind), e = expected[p][k];
  assert.deepStrictEqual([r.usable, r.receiver, r.outsider, r.ok], e, p + ' ' + k);
  assert(r.say, 'feedback text ' + p + ' ' + k);
}

// Exactly one key is right for each purpose.
const right = id => KEYS.filter(k => evaluateKey(id, k[0], k[1]).ok);
assert.deepStrictEqual(right('encrypt'), [['platform', 'public']]);
assert.deepStrictEqual(right('sign'), [['platform', 'private']]);
assert.strictEqual(evaluateKey('encrypt', 'platform', 'public').pair, '平台的私鑰');
assert.strictEqual(evaluateKey('sign', 'platform', 'private').pair, '平台的公鑰');
assert.strictEqual(PURPOSES.length, 2);

// CIA events: answers follow the attack table in the chapter (sniffing C, tampering I, DDoS A, jamming A, replay I, unauthorised access C).
assert.deepStrictEqual(EVENTS.map(e => e.a), [0, 1, 2, 2, 1, 0]);
EVENTS.forEach((e, i) => {
  [0, 1, 2].forEach(c => assert.strictEqual(judgeEvent(i, c).ok, c === e.a));
  assert(judgeEvent(i, (e.a + 1) % 3).say);
});
assert.strictEqual(judgeEvent(2, 0).answer, '可用性');

console.log('labs-s1-25: all assertions passed');
