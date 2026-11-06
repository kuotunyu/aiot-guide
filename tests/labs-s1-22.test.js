// Run: node aiot-guide/tests/labs-s1-22.test.js
const assert = require('assert');
const {rankWireless, checkFilter, topicMatches, simulateQos} = require('../static/assets/labs/s1-22.js');

// MQTT 5.0 section 4.7 examples
assert(topicMatches('sport/tennis/player1/#', 'sport/tennis/player1'));
assert(topicMatches('sport/tennis/player1/#', 'sport/tennis/player1/ranking'));
assert(topicMatches('sport/tennis/player1/#', 'sport/tennis/player1/score/wimbledon'));
assert(topicMatches('sport/#', 'sport'));
assert(topicMatches('sport/tennis/+', 'sport/tennis/player1'));
assert(!topicMatches('sport/tennis/+', 'sport/tennis/player1/ranking'));
assert(!topicMatches('sport/+', 'sport'));
assert(topicMatches('sport/+', 'sport/'));
assert(topicMatches('+/+', '/finance'));
assert(topicMatches('/+', '/finance'));
assert(!topicMatches('+', '/finance'));
assert(!topicMatches('#', '$SYS/info'));
assert(!topicMatches('+/monitor/Clients', '$SYS/monitor/Clients'));
assert(topicMatches('$SYS/#', '$SYS/monitor/Clients'));
assert(topicMatches('$SYS/monitor/+', '$SYS/monitor/Clients'));
assert(topicMatches('#', 'a/b/c'));
assert(!topicMatches('a/b', 'a/b/c'));
assert(!topicMatches('a/b/c', 'a/b'));
for (const bad of ['sport/tennis#', 'sport/tennis/#/ranking', 'sport+', 'a/b+/c', '']) assert(checkFilter(bad), bad);
for (const ok of ['#', '+', '+/tennis/#', 'sport/+/player1', 'a/b']) assert.strictEqual(checkFilter(ok), '', ok);

// QoS delivery semantics
const d = (q, f) => simulateQos(q, f).delivered;
assert.deepStrictEqual([d(0, 'none'), d(0, 'message'), d(0, 'ack')], [1, 0, 1]);
assert.deepStrictEqual([d(1, 'none'), d(1, 'message'), d(1, 'ack')], [1, 1, 2]);
assert.deepStrictEqual([d(2, 'none'), d(2, 'message'), d(2, 'ack')], [1, 1, 1]);
assert.strictEqual(simulateQos(2, 'none').packets, 4);
assert.strictEqual(simulateQos(1, 'none').packets, 2);
assert.strictEqual(simulateQos(0, 'none').packets, 1);

// Wireless selector
const st = (need, id) => rankWireless(need).find(t => t.id === id).status;
const video = {range: 3, data: 3, power: 1, mobile: 1};
assert.strictEqual(st(video, 'lte'), 'ok');
for (const id of ['nbiot', 'lorawan', 'ble', 'wifi', 'cat1']) assert.strictEqual(st(video, id), 'no', id);
const farm = {range: 3, data: 1, power: 0, mobile: 0};
assert.strictEqual(st(farm, 'lorawan'), 'ok');
assert.strictEqual(st(farm, 'nbiot'), 'ok');
assert.strictEqual(st(farm, 'lte'), 'no');
assert.strictEqual(st(farm, 'ble'), 'no');
const probe = {range: 1, data: 1, power: 0, mobile: 0};
assert.strictEqual(rankWireless(probe)[0].id, 'ble');
assert.strictEqual(st(probe, 'wifi'), 'no');
assert.strictEqual(st(probe, 'rfid'), 'no');
const box = {range: 1, data: 0, power: 0, mobile: 1};
assert.strictEqual(rankWireless(box)[0].id, 'rfid');
const truck = {range: 3, data: 1, power: 1, mobile: 1};
assert.strictEqual(rankWireless(truck)[0].status, 'ok');
assert.strictEqual(st(truck, 'cat1'), 'ok');
assert.strictEqual(st(truck, 'nbiot'), 'maybe');
assert.strictEqual(st({range: 0, data: 1, power: 0, mobile: 0}, 'nfc'), 'ok');

// Far more range than needed is flagged (range gap only, not spare data)
assert.strictEqual(st(probe, 'lorawan'), 'maybe');
assert.strictEqual(st(probe, 'nbiot'), 'maybe');
assert(rankWireless(probe).find(t => t.id === 'lorawan').cautions.includes('距離遠超需求，通常較貴'));
assert.strictEqual(st(probe, 'zigbee'), 'ok');      // one step more range is not flagged
assert.strictEqual(st(farm, 'lorawan'), 'ok');
assert.strictEqual(st(box, 'ble'), 'ok');           // spare data rate alone is not flagged

console.log('labs: all tests passed');
