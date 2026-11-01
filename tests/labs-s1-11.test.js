// Run: node aiot-guide/tests/labs-s1-11.test.js
const assert = require('assert');
const {quantize, assess, fmtVolume, fmtMs, fmtMB} = require('../static/assets/labs/s1-11.js');

const near = (a, b) => assert(Math.abs(a - b) < 1e-9, a + ' != ' + b);
const base = {kbps: 20, oneWayMs: 50, limitMs: 100, stability: 99, modelMB: 20, int8: false, device: 1};
const run = o => assess(Object.assign({}, base, o));

// Quantization: 4 bytes to 1 byte. 20 MB -> 5 MB (same figures as the chapter text).
near(quantize(20), 5);
near(run({int8: true}).modelMB, 5);
near(run({}).modelMB, 20);

// 20 KB/s = 0.16 Mbps; a day is 86,400 s -> 1.728 GB; one second of data on 10 Mbps = 16 ms.
let r = run({});
near(r.mbps, 0.16);
near(r.perDayGB, 1.728);
near(r.sendMs, 16);
near(r.rttMs, 116);          // 50 x 2 + 16
near(r.downMin, 14.4);       // 1% of 1,440 minutes
assert.strictEqual(r.verdict, 'edge');

// Latency boundary: exactly at the limit still counts as in time.
assert.strictEqual(run({kbps: 0, oneWayMs: 50, limitMs: 100}).tooSlow, false);
assert.strictEqual(run({kbps: 1, oneWayMs: 50, limitMs: 100}).tooSlow, true);   // 100.8 ms

// Uplink: 1,250 KB/s is exactly 10 Mbps and already saturated; just below is not.
assert.strictEqual(run({kbps: 1250, limitMs: 60000}).saturated, true);
assert.strictEqual(run({kbps: 1000, limitMs: 60000}).saturated, false);
assert.strictEqual(run({kbps: 2000, limitMs: 60000}).verdict, 'edge');

// Model fit at the device boundary: MCU holds 1 MB.
assert.strictEqual(run({device: 0, modelMB: 1}).fits, true);
assert.strictEqual(run({device: 0, modelMB: 2}).fits, false);
assert.strictEqual(run({device: 0, modelMB: 4, int8: true}).fits, true);        // 4 / 4 = 1 MB

// Each verdict is reachable.
assert.strictEqual(run({limitMs: 5000, stability: 99.9}).verdict, 'either');
assert.strictEqual(run({limitMs: 5000, stability: 98}).verdict, 'lean-edge');          // outage only
assert.strictEqual(run({limitMs: 5000, stability: 99, kbps: 200}).verdict, 'lean-edge'); // 17.28 GB per day
assert.strictEqual(run({limitMs: 5000, device: 0}).verdict, 'cloud');
assert.strictEqual(run({device: 0}).verdict, 'stuck');

// The four presets teach what their labels promise.
const preset = {kbps: 1, oneWayMs: 50, limitMs: 100, stability: 98, modelMB: 3, device: 0};
assert.strictEqual(assess(Object.assign({}, preset, {int8: false})).verdict, 'stuck');
assert.strictEqual(assess(Object.assign({}, preset, {int8: true})).verdict, 'edge');   // 0.75 MB fits
const video = assess({kbps: 500, oneWayMs: 80, limitMs: 1000, stability: 95, modelMB: 200, int8: false, device: 1});
near(video.rttMs, 560);      // 160 + 400
near(video.perDayGB, 43.2);
near(video.downMin, 72);
assert.strictEqual(video.verdict, 'lean-edge');
const trend = assess({kbps: 0.01, oneWayMs: 20, limitMs: 5000, stability: 99.9, modelMB: 5, int8: true, device: 0});
assert.strictEqual(trend.verdict, 'cloud');   // 1.25 MB still exceeds the MCU

// Formatting
assert.strictEqual(fmtVolume(1.728), '1.7 GB');
assert.strictEqual(fmtVolume(0.000864), '0.9 MB');
assert.strictEqual(fmtMs(116), '116 ms');
assert.strictEqual(fmtMs(1000), '1 秒');
assert.strictEqual(fmtMB(0.75), '0.75 MB');
assert.strictEqual(fmtMB(2000), '2 GB');

console.log('labs-s1-11 ok');
