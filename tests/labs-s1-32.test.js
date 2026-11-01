// Run: node aiot-guide/tests/labs-s1-32.test.js
const assert = require('assert');
const {WINDOW_MS, aliasInfo, adcInfo, quantize, signalAt, samples, aliasAt, describe, rankBus} = require('../static/assets/labs/s1-32.js');

// Alias frequency, worked by hand: nearest multiple of fs, then the absolute difference.
const fa = (f, fs) => aliasInfo(f, fs).fa;
assert.strictEqual(fa(300, 1000), 300);   // below Nyquist: unchanged, k = 0
assert.strictEqual(fa(499, 1000), 499);
assert.strictEqual(fa(500, 1000), 500);   // folding point
assert.strictEqual(fa(501, 1000), 499);
assert.strictEqual(fa(900, 1000), 100);   // |900 - 1000|
assert.strictEqual(fa(1000, 1000), 0);    // looks constant
assert.strictEqual(fa(1100, 1000), 100);  // |1100 - 1000|
assert.strictEqual(fa(1500, 1000), 500);
assert.strictEqual(fa(1600, 1000), 400);  // |1600 - 2000|, not 600
assert.strictEqual(fa(2000, 1000), 0);
assert.strictEqual(fa(1900, 800), 300);   // |1900 - 2*800|
assert.strictEqual(fa(2000, 300), 100);   // |2000 - 7*300|

// Nyquist states: must be strictly greater than 2f.
assert.strictEqual(aliasInfo(499, 1000).state, 'ok');
assert.strictEqual(aliasInfo(500, 1000).state, 'edge');
assert.strictEqual(aliasInfo(501, 1000).state, 'alias');
assert.strictEqual(aliasInfo(900, 1000).need, 1800);

// The alias is real: the drawn slow wave must pass through every sample, for every slider combination tested.
for (const [f, fs] of [[900, 1000], [1100, 1000], [1600, 1000], [1000, 1000], [2000, 1000], [510, 1000], [1990, 200], [1950, 650], [770, 1200]]) {
  for (const s of samples(f, fs, 16, 3.3, WINDOW_MS)) {
    assert(Math.abs(s.v - aliasAt(s.t, f, fs, 3.3)) < 1e-6, f + '/' + fs + ' at ' + s.t);
  }
}
// Sample values agree with the continuous signal at the sampling instants.
for (const s of samples(700, 1000, 10, 5, WINDOW_MS)) assert(Math.abs(s.v - signalAt(s.t, 700, 5)) < 1e-6);
// Sample count: 1000 Hz over 20 ms gives n = 0..20. 4000 Hz gives 81 points.
assert.strictEqual(samples(100, 1000, 8, 5, 20).length, 21);
assert.strictEqual(samples(100, 4000, 8, 5, 20).length, 81);
assert.strictEqual(samples(100, 250, 8, 5, 20).length, 6);
// f = fs/2 and f = fs with zero phase: all samples at mid range, one code only, no one-step flicker.
for (const [f, fs] of [[500, 1000], [1000, 1000], [2000, 1000]]) {
  const codes = new Set(samples(f, fs, 10, 5, WINDOW_MS).map(s => s.code));
  assert.deepStrictEqual([...codes], [512], f + '/' + fs);
}

// ADC: levels and step
assert.deepStrictEqual(adcInfo(3, 4), {levels: 8, step: 0.5});
assert.strictEqual(adcInfo(10, 5).levels, 1024);
assert(Math.abs(adcInfo(10, 5).step - 0.0048828125) < 1e-12);  // about 4.88 mV
assert(Math.abs(adcInfo(8, 5).step - 0.01953125) < 1e-12);     // about 19.5 mV
assert(Math.abs(adcInfo(12, 3.3).step - 0.000805664) < 1e-8);  // about 0.81 mV
assert.strictEqual(adcInfo(16, 5).levels, 65536);
// One more bit halves the step.
assert.strictEqual(adcInfo(9, 5).step, adcInfo(8, 5).step / 2);

// Quantizing
assert.deepStrictEqual(quantize(1.26, 3, 4), {code: 2, volt: 1});
assert.deepStrictEqual(quantize(0.49, 3, 4), {code: 0, volt: 0});
assert.deepStrictEqual(quantize(0.5, 3, 4), {code: 1, volt: 0.5});
assert.strictEqual(quantize(2.5, 10, 5).code, 512);
assert.strictEqual(quantize(5, 10, 5).code, 1023);    // top of range stays in the last code
assert.strictEqual(quantize(-0.1, 10, 5).code, 0);
assert.strictEqual(quantize(9, 3, 4).code, 7);
// Chapter example: 12-bit 0 to 2.048 V, reading 1000 is 0.5 V.
assert.strictEqual(quantize(0.5, 12, 2.048).code, 1000);
// Error never exceeds one step, and the signal never leaves the range.
for (const s of samples(730, 1000, 3, 3.3, WINDOW_MS)) {
  assert(s.v >= s.volt - 1e-9 && s.v - s.volt < adcInfo(3, 3.3).step + 1e-9);
  assert(s.v > 0 && s.v < 3.3);
}

// Wording carries the right numbers.
assert(describe(900, 1000).includes('100 Hz') && describe(900, 1000).includes('|900−1×1000|') && describe(900, 1000).includes('1800'));
assert(describe(1600, 1000).includes('|1600−2×1000|＝400'));
assert(describe(1000, 1000).includes('固定值'));
assert(describe(500, 1000).includes('正好 2 倍'));
assert(describe(300, 1000).startsWith('取樣足夠'));
// f = 1.5 fs and 2.5 fs: all samples on zero crossings, so the text must not promise a visible 500 Hz wave.
for (const f of [1500, 2500]) {
  assert.strictEqual(new Set(samples(f, 1000, 10, 3.3, WINDOW_MS).map(s => s.code)).size, 1);
  assert(describe(f, 1000).includes('取樣點全落在零點上') && !describe(f, 1000).includes('資料看起來卻是'));
}
assert(describe(1500, 1000).includes('|1500−2×1000|＝500') && describe(1500, 1000).includes('3000'));

// ----- interfaces -----
const base = {wires: 8, devices: 1, dist: 0, speed: 0, duplex: false, clock: 0};
const rank = o => rankBus(Object.assign({}, base, o));
const get = (o, id) => rank(o).find(x => x.id === id);
const fine = o => rank(o).filter(x => x.status !== 'no').map(x => x.id).sort();

// SPI wire count: 3 + one CS per slave; three slaves is 6 as stated in the chapter.
assert.strictEqual(get({devices: 1}, 'spi').wireCount, 4);
assert.strictEqual(get({devices: 3}, 'spi').wireCount, 6);
assert.strictEqual(get({devices: 3, wires: 5}, 'spi').status, 'no');
assert.strictEqual(get({devices: 3, wires: 6}, 'spi').status, 'ok');
// I2C stays at two lines however many devices.
assert.strictEqual(get({devices: 12, wires: 2}, 'i2c').status, 'ok');
// UART is point to point.
assert.strictEqual(get({devices: 1}, 'uart').status, 'ok');
assert.strictEqual(get({devices: 2}, 'uart').status, 'no');
// RS-485: two wires half duplex, four wires for full duplex.
assert.strictEqual(get({duplex: false}, 'rs485').wireCount, 2);
assert.strictEqual(get({duplex: true}, 'rs485').wireCount, 4);
assert.strictEqual(get({duplex: true, wires: 2, dist: 1}, 'rs485').status, 'no');
// Long distance lowers RS-485 rate.
assert.strictEqual(get({dist: 2, speed: 0}, 'rs485').status, 'ok');
assert.strictEqual(get({dist: 2, speed: 2}, 'rs485').status, 'no');
assert.strictEqual(get({dist: 1, speed: 2}, 'rs485').status, 'ok');
// RS-485 works but is overkill on the same board.
assert.strictEqual(get({dist: 0}, 'rs485').status, 'maybe');
// Clock conditions
assert.deepStrictEqual(fine({clock: 1}), ['i2c', 'spi']);
assert.deepStrictEqual(fine({clock: 2}), ['rs485', 'uart']);
// I2C is half duplex.
assert.strictEqual(get({duplex: true}, 'i2c').status, 'no');
assert.strictEqual(get({duplex: true}, 'spi').status, 'ok');

// The four presets in the lab each lead to the interface the text names.
const first = o => rank(o)[0].id;
assert.strictEqual(first({wires: 2, devices: 3}), 'i2c');
assert.strictEqual(first({wires: 5, devices: 1, speed: 2, duplex: true}), 'spi');
assert.strictEqual(first({wires: 2, devices: 1, dist: 1, duplex: true, clock: 2}), 'uart');
assert.deepStrictEqual(fine({wires: 2, devices: 12, dist: 2}), ['rs485']);
assert.deepStrictEqual(fine({wires: 2, devices: 1, dist: 1, duplex: true, clock: 2}), ['uart']);

console.log('labs-s1-32: all assertions passed');
