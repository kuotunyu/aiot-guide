// Run: node aiot-guide/tests/labs-s1-24.test.js
const assert = require('assert');
const L = require('../static/assets/labs/s1-24.js');

// Volumes, checked by hand: 500 x 1440 = 720,000; 30 x 2 / 8 x 3600 x 10 / 1000 = 270.
assert.strictEqual(L.dailyRows(500, 1), 720000);
assert.strictEqual(L.dailyRows(1, 1), 1440);
assert.strictEqual(L.dailyRows(0, 1), 0);
assert.strictEqual(L.videoGbPerDay(30, 2, 10), 270);
assert.strictEqual(L.videoGbPerDay(1, 8, 1), 3.6);

// Every data type has an opinion on every store, and exactly one best fit.
const expected = {temp: 'tsdb', order: 'rdb', event: 'nosql', video: 'object'};
for (const d of L.DATA) {
  assert.strictEqual(d.best, expected[d.id], d.id);
  for (const s of L.STORES) {
    const r = L.evaluateStore(d.id, s.id);
    assert(r && r.why && r.cost && r.label, d.id + '/' + s.id);
    assert.strictEqual(r.verdict === 'ok', s.id === d.best, d.id + '/' + s.id);
    assert.strictEqual(r.best, s.id === d.best);
  }
}
assert.strictEqual(L.evaluateStore('nope', 'rdb'), null);
assert.strictEqual(L.evaluateStore('temp', 'nope'), null);
// Wrong tools stay wrong; workable-with-a-cost stays workable.
assert.strictEqual(L.evaluateStore('video', 'rdb').verdict, 'no');
assert.strictEqual(L.evaluateStore('video', 'tsdb').verdict, 'no');
assert.strictEqual(L.evaluateStore('temp', 'rdb').verdict, 'maybe');
assert.strictEqual(L.evaluateStore('order', 'nosql').verdict, 'maybe');
assert.strictEqual(L.evaluateStore('order', 'object').verdict, 'no');

// Nothing is finished on open.
assert.deepStrictEqual(L.summarize({}), {pending: ['temp', 'order', 'event', 'video'], better: [], finished: false});
assert.strictEqual(L.summarize({temp: 'tsdb'}).finished, false);
assert.deepStrictEqual(L.summarize(expected), {pending: [], better: [], finished: true});
assert.deepStrictEqual(L.summarize(Object.assign({}, expected, {video: 'rdb'})).better, ['video']);

// Responsibility: counts of layers you manage are 6, 4, 2, 1 and never increase.
const count = m => L.LAYERS.filter(l => L.owner(m, l.id) === 'you').length;
assert.deepStrictEqual(L.MODELS.map(m => count(m.id)), [6, 4, 2, 1]);
assert.strictEqual(L.owner('iaas', 'os'), 'you');
assert.strictEqual(L.owner('iaas', 'hw'), 'vendor');
assert.strictEqual(L.owner('paas', 'data'), 'you');
assert.strictEqual(L.owner('paas', 'app'), 'you');
assert.strictEqual(L.owner('paas', 'runtime'), 'vendor');
assert.strictEqual(L.owner('saas', 'app'), 'vendor');
// SaaS: data permissions remain yours in every model.
for (const m of L.MODELS) assert.strictEqual(L.owner(m.id, 'data'), 'you', m.id);
assert.strictEqual(L.layerLabel('saas', 'data'), '資料權限與設定');
assert.strictEqual(L.layerLabel('paas', 'data'), '資料');

assert.deepStrictEqual(L.handoff('onprem', 'iaas'), ['virt', 'hw']);
assert.deepStrictEqual(L.handoff('iaas', 'paas'), ['runtime', 'os']);
assert.deepStrictEqual(L.handoff('paas', 'saas'), ['app']);
assert.deepStrictEqual(L.handoff('saas', 'saas'), []);
assert.deepStrictEqual(L.handoff('saas', 'paas'), ['app']);

// Quiz answers come from the model.
const ans = L.TASKS.map(t => L.owner(t.model, t.layer));
assert.deepStrictEqual(ans, ['you', 'vendor', 'vendor', 'you', 'you', 'vendor']);

console.log('labs-s1-24: all passed');
