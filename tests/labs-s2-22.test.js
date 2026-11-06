// Run: node aiot-guide/tests/labs-s2-22.test.js
const assert = require('assert');
const {compareUpdates, insight, readings, toJson, toCsv, toXml, formatSizes} = require('../static/assets/labs/s2-22.js');
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, a + ' != ' + b);

// Poll every 5 s, data every 60 s, 100 users: hand-calculated.
let r = compareUpdates(5, 60, 100);
assert.strictEqual(r.polling.requests, 72000);      // 720/h × 100
near(r.polling.delay, 2.55);                        // 5/2 + 0.05
near(r.polling.emptyShare, 11 / 12);                // 1 of 12 polls finds new data
assert.strictEqual(r.polling.missedShare, 0);
assert.strictEqual(r.longPolling.requests, 12000);  // 60 changes × 2 requests (one 30 s timeout) × 100
near(r.longPolling.delay, 0.05);
near(r.longPolling.emptyShare, 0.5);
assert.strictEqual(r.webSocket.requests, 100);      // one handshake each
assert.strictEqual(r.webSocket.pushes, 6000);
assert.strictEqual(r.webSocket.connections, 100);

// Data faster than polling: polling misses changes, and long polling makes more requests than polling.
r = compareUpdates(5, 1, 100);
near(r.polling.missedShare, 0.8);
assert.strictEqual(r.polling.emptyShare, 0);
assert.strictEqual(r.polling.requests, 72000);
assert.strictEqual(r.longPolling.requests, 360000);
assert(r.longPolling.requests > r.polling.requests);
assert(insight(5, 1, 100).includes('80%'));
assert(insight(5, 1, 100).includes('請求數反而比輪詢多'));

// Boundaries: poll = change; change = timeout; change just past the timeout; rare data.
r = compareUpdates(10, 10, 1);
assert.strictEqual(r.polling.emptyShare, 0);
assert.strictEqual(r.polling.missedShare, 0);
assert.strictEqual(compareUpdates(5, 30, 1).longPolling.requests, 120);
assert.strictEqual(compareUpdates(5, 30, 1).longPolling.emptyShare, 0);
assert.strictEqual(compareUpdates(5, 45, 1).longPolling.requests, 160); // 80 changes × 2
r = compareUpdates(5, 3600, 100);
assert.strictEqual(r.longPolling.requests, 12000);  // re-asks every 30 s: 120/h × 100
assert.strictEqual(r.webSocket.pushes, 100);
assert(insight(5, 3600, 1).includes('變化慢、人又少，這組條件下輪詢就夠'));
// Poll every 60 s, data every 300 s: 60 polls vs 12 x 10 = 120 long-poll requests. The cause is the 30 s timeout, not fast data.
assert(insight(60, 300, 100).includes('逾時'));
assert(!insight(60, 300, 100).includes('資料變得比輪詢還快'));
assert(insight(60, 30, 100).includes('資料變得比輪詢還快'));
for (const u of [1, 5000]) assert.strictEqual(compareUpdates(1, 1, u).webSocket.requests, u);
// WebSocket request count does not depend on how often data changes.
assert.strictEqual(compareUpdates(1, 1, 7).webSocket.requests, compareUpdates(60, 3600, 7).webSocket.requests);

// Formats: exact strings and hand-counted lengths.
const one = readings(1);
assert.strictEqual(toJson(one), '{"device":"truck7","time":"2026-11-01T08:00:00Z","temp":-18.2,"hum":62}');
assert.strictEqual(toCsv(one, false), 'truck7,2026-11-01T08:00:00Z,-18.2,62');
assert.strictEqual(toCsv(one, true), 'device,time,temp,hum\ntruck7,2026-11-01T08:00:00Z,-18.2,62');
assert.strictEqual(toXml(one), '<reading><device>truck7</device><time>2026-11-01T08:00:00Z</time><temp>-18.2</temp><hum>62</hum></reading>');
assert.deepStrictEqual(formatSizes(1, true).sizes, {json: 71, csv: 57, xml: 106});
assert.strictEqual(formatSizes(1, false).sizes.csv, 36);
assert.deepStrictEqual(formatSizes(2, true).sizes, {json: 145, csv: 94, xml: 233});
assert.deepStrictEqual(formatSizes(100, true).sizes, {json: 7201, csv: 3720, xml: 10621});
assert.strictEqual(formatSizes(100, false).sizes.csv, 3699);
assert.doesNotThrow(() => JSON.parse(formatSizes(100, true).json));
assert.strictEqual(JSON.parse(formatSizes(100, true).json).length, 100);
assert.strictEqual(formatSizes(100, true).csv.split('\n').length, 101);
assert.strictEqual(readings(100)[99].time, '2026-11-01T09:39:00Z');
for (const row of readings(100)) assert.strictEqual(row.temp.length, 5);
// CSV's advantage grows with batch size, because field names are not repeated.
const ratio = n => { const z = formatSizes(n, true).sizes; return z.xml / z.csv; };
assert(ratio(100) > ratio(1));

// Closing verdict for the four presets in the lab (POLL[3] = 5 s, CHANGE / USERS by index).
// 冷藏庫溫度看板: 5 s / 60 s / 100 people -> push, 100 connections
assert(insight(5, 60, 100).includes('這組條件下推送較划算，代價是伺服器要掛著 100 條連線並處理重連'));
// 很少發生的超溫告警: 5 s / 3600 s / 100 people -> push
assert(insight(5, 3600, 100).includes('這組條件下推送較划算'));
// 貨車每秒更新的追蹤畫面: 5 s / 1 s / 100 people -> polling misses, choose WebSocket
assert(insight(5, 1, 100).endsWith('輪詢會漏、長輪詢更費，這組條件選 WebSocket。'));
// 只有一人看的倉庫螢幕: 30 s / 300 s / 1 person -> slow data, one viewer: polling is enough
assert(insight(30, 300, 1).endsWith('變化慢、人又少，這組條件下輪詢就夠，做法最簡單。'));
// Few viewers with faster data that polling still keeps up with
assert(insight(15, 15, 1).endsWith('人少、輪詢也跟得上變化，這組條件下輪詢就夠，做法最簡單。'));
// Missed changes win over few viewers; 10 viewers still count as few, 50 do not.
assert(insight(5, 1, 1).includes('這組條件選 WebSocket'));
assert(insight(5, 60, 10).includes('輪詢就夠'));
assert(insight(5, 60, 50).includes('推送較划算'));

console.log('labs-s2-22 ok');
