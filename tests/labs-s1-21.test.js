// Run: node aiot-guide/tests/labs-s1-21.test.js
const assert = require('assert');
const {LAYERS, ITEMS, gradeLayers, STATIONS, SEGMENTS, symptoms, CLUES, gradeClue} = require('../static/assets/labs/s1-21.js');

// ----- layer sorting -----
const layerOf = Object.fromEntries(ITEMS.map(i => [i.id, i.layer]));
assert.deepStrictEqual(LAYERS, ['感知層', '網路層', '應用層']);
// the items people tend to confuse
assert.strictEqual(layerOf.compressor, 0);
assert.strictEqual(layerOf.rfid, 0);
assert.strictEqual(layerOf.gps, 0);
assert.strictEqual(layerOf.modem, 1);
assert.strictEqual(layerOf.gateway, 1);
assert.strictEqual(layerOf.app, 2);
assert.strictEqual(layerOf.rule, 2);
for (const l of [0, 1, 2]) assert(ITEMS.filter(i => i.layer === l).length >= 3, 'every layer has several items');
assert.strictEqual(new Set(ITEMS.map(i => i.id)).size, ITEMS.length);
for (const i of ITEMS) assert(i.why.length > 0, i.id);

// no feedback at all until everything is answered
const empty = gradeLayers({});
assert.deepStrictEqual(empty, {complete: false, missing: ITEMS.length, results: []});
const almost = Object.fromEntries(ITEMS.slice(1).map(i => [i.id, i.layer]));
const partial = gradeLayers(almost);
assert.strictEqual(partial.complete, false);
assert.strictEqual(partial.missing, 1);
assert.strictEqual(partial.results.length, 0);
assert.strictEqual(gradeLayers(Object.assign({}, almost, {[ITEMS[0].id]: 3})).complete, false, 'out-of-range layer is not an answer');

const right = Object.fromEntries(ITEMS.map(i => [i.id, i.layer]));
assert(gradeLayers(right).complete);
assert(gradeLayers(right).results.every(r => r.match));
const oneWrong = gradeLayers(Object.assign({}, right, {modem: 0})).results.find(r => r.id === 'modem');
assert.strictEqual(oneWrong.match, false);
assert.strictEqual(oneWrong.chosen, '感知層');
assert.strictEqual(oneWrong.right, '網路層');
assert.strictEqual(gradeLayers(Object.assign({}, right, {modem: 0})).results.filter(r => !r.match).length, 1);

// ----- breakpoint: hand-checked list of working stations -----
const working = k => symptoms(k).filter(s => s.ok).map(s => s.name);
assert.strictEqual(STATIONS.length, 5);
assert.strictEqual(SEGMENTS.length, 6);
assert.deepStrictEqual(working(0), []);
assert.deepStrictEqual(working(1), ['探頭量到讀值']);
assert.deepStrictEqual(working(2), ['探頭量到讀值']);
assert.deepStrictEqual(working(3), ['探頭量到讀值', '閘道器收到讀值']);
assert.deepStrictEqual(working(4), ['探頭量到讀值', '閘道器收到讀值']);
assert.deepStrictEqual(working(5), ['探頭量到讀值', '閘道器收到讀值', '平台存入新資料', '平台能發超溫告警']);
for (let k = 0; k < SEGMENTS.length; k++) {
  const s = symptoms(k);
  assert.strictEqual(s[s.length - 1].ok, false, 'the screen never updates in any scenario');
  assert(s.every((x, i) => i === 0 || !x.ok || s[i - 1].ok), 'a station cannot work when the one before it stopped');
}

// every clue points at a real segment, and the lab does not open on one of them (selection starts at 2)
const DEFAULT = 2;
for (const c of CLUES) {
  assert(SEGMENTS[c.a], c.q);
  assert.notStrictEqual(c.a, DEFAULT, c.q);
}
assert.strictEqual(new Set(CLUES.map(c => c.a)).size, CLUES.length);

// clues are answered, not ticked by the selection: only the matching segment counts
CLUES.forEach((c, i) => {
  for (let k = 0; k < SEGMENTS.length; k++) {
    const g = gradeClue(i, k);
    assert.strictEqual(g.right, k === c.a, c.q + ' / ' + k);
    assert(g.text.startsWith(g.right ? '對。先查：' : '再想想。'));
  }
});
// the opening selection (閘道器) answers none of the clues
assert(CLUES.every((c, i) => !gradeClue(i, DEFAULT).right));
assert.strictEqual(gradeClue(1, 3).text, '對。先查：Wi-Fi、路由器、對外網路。');
assert(gradeClue(1, 2).text.includes('「閘道器」'));

console.log('labs-s1-21: all assertions passed');
