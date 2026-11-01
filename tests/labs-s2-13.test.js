// Run: node aiot-guide/tests/labs-s2-13.test.js
const assert = require('assert');
const {SCENARIOS, at, fmt, newLock, receive, runScenario, compare, packetText, outcome} = require('../static/assets/labs/s2-13.js');

const msg = o => Object.assign({kind: 'msg', from: 'app', cmd: 'open', seq: 41, nonce: 'n1', ts: at(8, 0), arrive: at(8, 0), sig: true}, o);

assert.strictEqual(fmt(at(8, 0, 5)), '08:00:05');
assert.strictEqual(fmt(at(20, 0)), '20:00:00');

// Bad signature is rejected first in every mode.
for (const m of ['sig', 'window', 'seq', 'nonce', 'both']) {
  assert.strictEqual(receive(newLock(), m, msg({sig: false})).code, 'signature');
}

// Time window: the boundary value is accepted, one second more is not; works both ways.
assert(receive(newLock(), 'window', msg({arrive: at(8, 0, 30)}), 30).accepted);
assert.strictEqual(receive(newLock(), 'window', msg({arrive: at(8, 0, 31)}), 30).code, 'expired');
assert(receive(newLock(), 'window', msg({ts: at(8, 0, 30), arrive: at(8, 0)}), 30).accepted);
assert.strictEqual(receive(newLock(), 'window', msg({ts: at(8, 0, 31), arrive: at(8, 0)}), 30).code, 'expired');

// Sequence: lock starts at 40; equal is rejected, greater updates, gaps are fine.
assert.strictEqual(receive(newLock(), 'seq', msg({seq: 40})).code, 'seq');
assert.strictEqual(receive(newLock(), 'seq', msg({seq: 41})).after.last, 41);
assert.strictEqual(receive(newLock(), 'seq', msg({seq: 90})).after.last, 90);

// Rejection never changes the door or the memory; the input lock is never mutated.
{
  const l = newLock();
  const r = receive(l, 'seq', msg({seq: 40}));
  assert.strictEqual(r.after.door, 'locked');
  assert.strictEqual(r.after.last, 40);
  receive(l, 'nonce', msg());
  assert.deepStrictEqual(l.used, []);
}

// Nonce memory keeps the latest 3, oldest out first.
{
  let l = newLock();
  for (const n of ['a', 'b', 'c', 'd']) l = receive(l, 'nonce', msg({nonce: n})).after;
  assert.deepStrictEqual(l.used, ['b', 'c', 'd']);
  assert(receive(l, 'nonce', msg({nonce: 'a'})).accepted);
  assert.strictEqual(receive(l, 'nonce', msg({nonce: 'b'})).code, 'nonce');
}

// In the combined mode a rejected (expired) message does not consume nonce memory.
assert.deepStrictEqual(receive(newLock(), 'both', msg({arrive: at(9, 0)}), 30).after.used, []);

assert.strictEqual(outcome('attacker', true), 'breach');
assert.strictEqual(outcome('attacker', false), 'stopped');
assert.strictEqual(outcome('app', true), 'pass');
assert.strictEqual(outcome('app', false), 'false-reject');

// Hand-worked table with a 30 s window: outcome per step (null = event step) and final door.
const P = 'pass', F = 'false-reject', S = 'stopped', B = 'breach', E = null, O = 'open', L = 'locked';
const EXPECT = {
  // replay 1 is 25 s old (inside the window), replay 2 is 12 h old.
  replay: {sig: [[P, P, B, B], O], window: [[P, P, B, S], O], seq: [[P, P, S, S], L], nonce: [[P, P, S, S], L], both: [[P, P, S, S], L]},
  hold: {sig: [[E, B], O], window: [[E, S], L], seq: [[E, B], O], nonce: [[E, B], O], both: [[E, S], L]},
  tamper: {sig: [[P, P, S], L], window: [[P, P, S], L], seq: [[P, P, S], L], nonce: [[P, P, S], L], both: [[P, P, S], L]},
  // replay is 300 s old; RAM cleared, clock kept.
  reboot: {sig: [[P, P, E, B], O], window: [[P, P, E, S], L], seq: [[P, P, E, B], O], nonce: [[P, P, E, B], O], both: [[P, P, E, S], L]},
  // a7f3 is pushed out by three later nonces; the replay is 31 min old.
  full: {sig: [[P, P, P, P, B], O], window: [[P, P, P, P, S], L], seq: [[P, P, P, P, S], L], nonce: [[P, P, P, P, B], O], both: [[P, P, P, P, S], L]},
  // first message is 45 s late.
  delay: {sig: [[P, P], O], window: [[F, P], O], seq: [[P, P], O], nonce: [[P, P], O], both: [[F, P], O]},
  reorder: {sig: [[P, P, P], O], window: [[P, P, P], O], seq: [[P, F, P], O], nonce: [[P, P, P], O], both: [[P, P, P], O]},
  // Only the sequence check keeps the door locked.
  // Rejecting the late "open" keeps the user's intent (door locked), so it is not a false reject.
  swap: {sig: [[P, P], O], window: [[P, P], O], seq: [[P, 'right-reject'], L], nonce: [[P, P], O], both: [[P, P], O]},
  // Lock clock +120 s: first message reads as 121 s old; after NTP sync the retry is 1 s old.
  clock: {sig: [[P, E, P], O], window: [[F, E, P], O], seq: [[P, E, P], O], nonce: [[P, E, P], O], both: [[F, E, P], O]},
};
assert.deepStrictEqual(Object.keys(EXPECT).sort(), SCENARIOS.map(s => s.id).sort());
for (const id of Object.keys(EXPECT)) {
  for (const row of compare(id, 30)) {
    const [out, door] = EXPECT[id][row.mode];
    assert.deepStrictEqual(row.outcomes, out, id + '/' + row.mode);
    assert.strictEqual(row.door, door, id + '/' + row.mode + ' door');
  }
}

// Window slider: 60 s stops the false reject on the 45 s delay; 10 s stops the 25 s replay.
assert.strictEqual(runScenario('delay', 'window', 60).rows[0].outcome, 'pass');
assert.strictEqual(runScenario('replay', 'window', 10).rows[2].outcome, 'stopped');
// The reboot replay is 300 s old, beyond the largest slider value.
assert.strictEqual(runScenario('reboot', 'both', 120).rows[3].outcome, 'stopped');
assert.strictEqual(compare('reboot', 30).find(r => r.mode === 'both').outcomes[3], 'stopped');

// Opening state is meaningful and unfinished: door locked, memory at its start values.
for (const s of SCENARIOS) {
  const r = runScenario(s.id, 'sig');
  assert.strictEqual(r.initial.door, 'locked');
  assert(s.steps.length >= 2 && s.lesson && s.desc);
}

// The packet shows only the fields the mode checks.
const p = SCENARIOS[0].steps[0];
assert.strictEqual(packetText(p, 'sig'), '開門 · 簽章對');
assert.strictEqual(packetText(p, 'seq'), '開門 · seq=41 · 簽章對');
assert.strictEqual(packetText(p, 'both'), '開門 · ts=08:00:00 · nonce=a7f3 · 簽章對');

console.log('labs-s2-13: ok');
