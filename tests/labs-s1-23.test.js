// Run: node aiot-guide/tests/labs-s1-23.test.js
const assert = require('assert');
const {POINTS, POINT_ORDER, BRANDS, ADDRESSES, toSigned, decode, pduOffset, requestPdu, responsePdu, judge, nodeOf, typeHint, trackFreezer, hex16} = require('../static/assets/labs/s1-23.js');

// Two's complement boundaries for a 16-bit register
assert.strictEqual(toSigned(0), 0);
assert.strictEqual(toSigned(32767), 32767);
assert.strictEqual(toSigned(32768), -32768);
assert.strictEqual(toSigned(65535), -1);
assert.strictEqual(toSigned(65351), -185); // 65351 - 65536

// Hand-checked decoding
assert.strictEqual(decode(253, 'UINT16', 0.1), 25.3);
assert.strictEqual(decode(253, 'UINT16', 1), 253);
assert.strictEqual(decode(253, 'UINT16', 0.01), 2.53);
assert.strictEqual(decode(65351, 'INT16', 0.1), -18.5);
assert.strictEqual(decode(65351, 'UINT16', 0.1), 6535.1);
assert.strictEqual(decode(63686, 'INT16', 0.01), -18.5); // 63686 - 65536 = -1850

// 40001 is a conventional label; the PDU carries a zero-based offset. FC 03, offset, quantity 1.
assert.strictEqual(pduOffset(40001), 0);
assert.strictEqual(pduOffset(40011), 10);
assert.strictEqual(requestPdu(40001), '03 00 00 00 01');
assert.strictEqual(requestPdu(40005), '03 00 04 00 01');
assert.strictEqual(responsePdu(253), '03 02 00 FD');
assert.strictEqual(responsePdu(65351), '03 02 FF 47');

// Every map entry decodes to the same physical truth with its documented scale and type
for (const b of Object.keys(BRANDS)) {
  assert.deepStrictEqual(Object.keys(BRANDS[b].map).map(Number), ADDRESSES);
  assert.deepStrictEqual(Object.values(BRANDS[b].map).map(e => e.point).sort(), [...POINT_ORDER].sort());
  for (const a of ADDRESSES) {
    const e = BRANDS[b].map[a];
    assert(e.raw >= 0 && e.raw <= 65535, 'register is 16 bits');
    assert.strictEqual(decode(e.raw, e.type, e.scale), POINTS[e.point].value, b + a);
    assert(judge(b, a, e.type, e.scale).ok, b + a);
  }
}

// Same address, different meaning across brands
assert.notStrictEqual(BRANDS.A.map[40001].point, BRANDS.B.map[40001].point);

// Wrong interpretation is reported per cause
assert.deepStrictEqual(judge('A', 40001, 'UINT16', 1).problems, ['scale']);
assert.deepStrictEqual(judge('A', 40002, 'UINT16', 0.1).problems, ['type']);
assert.deepStrictEqual(judge('A', 40002, 'UINT16', 1).problems, ['type', 'scale']);
assert(judge('A', 40001, 'UINT16', 0.1).ok, 'positive value is the same under either type');
assert(!judge('B', 40004, 'INT16', 0.1).ok, "brand A's scale is wrong for brand B");

// OPC UA: the node name is stable across brands while the NodeId may differ
for (const k of POINT_ORDER) {
  assert.strictEqual(nodeOf('A', k).browse, nodeOf('B', k).browse);
  assert.notStrictEqual(nodeOf('A', k).nodeId, nodeOf('B', k).nodeId);
}
assert.strictEqual(nodeOf('A', 'freezer').value, -18.5);
assert.strictEqual(nodeOf('A', 'setpoint').write, true);
assert.strictEqual(nodeOf('A', 'room').write, false);

// Type hint states the same rule as toSigned (>= 32768 means negative under INT16)
assert.strictEqual(typeHint(65351, 'UINT16'), '型別錯：65351 ≥ 32768，INT16 要減 65536');
assert(65351 >= 32768 && toSigned(65351) === 65351 - 65536);
for (const b of Object.keys(BRANDS)) for (const a of ADDRESSES) {
  const e = BRANDS[b].map[a];
  // a type problem only shows up for INT16 entries whose raw value is 32768 or more
  const wrongType = e.type === 'INT16' ? 'UINT16' : 'INT16';
  if (judge(b, a, wrongType, e.scale).problems.includes('type')) assert(e.type === 'INT16' && e.raw >= 32768, b + a);
}
// The register value row shows the same hex as the response PDU
assert.strictEqual(hex16(253), '00 FD');
assert(responsePdu(253).endsWith(hex16(253)));

// OPC UA challenge needs the freezer node under both brands, in any order, and stays done
const seen = new Set();
assert.strictEqual(trackFreezer(seen, {node: 'room', brand: 'A'}), false);
assert.strictEqual(trackFreezer(seen, {node: 'freezer', brand: 'A'}), false);
assert.strictEqual(trackFreezer(seen, {node: 'freezer', brand: 'A'}), false);
assert.strictEqual(trackFreezer(seen, {node: 'room', brand: 'B'}), false);
assert.strictEqual(trackFreezer(seen, {node: 'freezer', brand: 'B'}), true);
assert.strictEqual(trackFreezer(seen, {node: 'room', brand: 'A'}), true);

console.log('labs-s1-23: all passed');
