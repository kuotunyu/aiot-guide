/* Labs for 2.5: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // ----- which key? No real cryptography: only who holds which key. -----
  const OWNERS = {device: '裝置', platform: '平台'};
  const KINDS = {public: '公鑰', private: '私鑰'};
  const KEYS = [['platform', 'public'], ['platform', 'private'], ['device', 'public'], ['device', 'private']];
  const keyName = (owner, kind) => OWNERS[owner] + '的' + KINDS[kind];
  // A public key is held by everyone; a private key only by its owner. actor: device, platform or outsider.
  const holds = (actor, owner, kind) => kind === 'public' || actor === owner;
  const PURPOSES = [
    {id: 'encrypt', tab: '保密傳給平台', sender: 'device', receiver: 'platform', task: '裝置要把貨主的溫度報表傳給平台，途中只有平台能看懂。裝置該用哪把鑰匙上鎖？', receiverYes: '打得開', receiverNo: '打不開', outsiderYes: '也打得開', outsiderNo: '打不開'},
    {id: 'sign', tab: '證明指令來自平台', sender: 'platform', receiver: 'device', task: '平台要命令壓縮機調整設定，裝置必須能確認指令真的來自平台。平台該用哪把鑰匙簽章？', receiverYes: '驗得過', receiverNo: '驗不了', outsiderYes: '偽造得出', outsiderNo: '偽造不了'},
  ];
  const SAYS = {
    'encrypt:platform:public': '正確。人人都拿得到平台的公鑰，但配對的私鑰只有平台有，所以只有平台打得開。',
    'encrypt:platform:private': '裝置拿不到平台的私鑰。私鑰只有主人持有；若裝置真的有，等於私鑰已經外洩。',
    'encrypt:device:public': '這把鎖只有裝置自己的私鑰打得開，連平台都讀不到。保密要用收件人的鑰匙。',
    'encrypt:device:private': '配對的公鑰人人都有，所以人人打得開，完全不保密。這其實是簽章的配對。',
    'sign:platform:private': '正確。只有平台持有這把私鑰，別人簽不出來；裝置用平台的公鑰就能驗證。指令內容仍看得到，簽章不保密。',
    'sign:platform:public': '公鑰人人都有，人人都能這樣做，證明不了來源。裝置也沒有配對的私鑰可以驗證。',
    'sign:device:public': '裝置的公鑰人人都有，外人也能照做，無法證明來自平台。',
    'sign:device:private': '平台拿不到裝置的私鑰。就算簽得出來，證明的也是「來自裝置」，不是來自平台。',
  };
  function evaluateKey(purposeId, owner, kind) {
    const p = PURPOSES.find(x => x.id === purposeId);
    const pair = kind === 'public' ? 'private' : 'public';
    const usable = holds(p.sender, owner, kind);
    const receiver = holds(p.receiver, owner, pair);
    // Encrypting: can an outsider open it (holds the paired key)? Signing: can an outsider forge it (holds the chosen key)?
    const outsider = holds('outsider', owner, purposeId === 'encrypt' ? pair : kind);
    return {usable, receiver, outsider, pair: keyName(owner, pair), ok: usable && receiver && !outsider, say: SAYS[purposeId + ':' + owner + ':' + kind]};
  }

  // ----- events mapped to CIA -----
  const CIA = ['機密性', '完整性', '可用性'];
  const EVENTS = [
    {q: '有人在倉庫的 Wi-Fi 側錄封包，看到貨主名單與配送路線。', a: 0, say: '竊聽：資料沒變、服務也正常，但被不該看的人看到了。'},
    {q: '攻擊者把貨車上傳的溫度從 12°C 改成 4°C，超溫紀錄消失。', a: 1, say: '竄改：資料不再可信。對冷鏈來說，這比沒有資料更危險。'},
    {q: '殭屍網路灌爆 MQTT Broker，超溫告警送不出去。', a: 2, say: 'DDoS：資料沒外洩也沒被改，但需要時用不到。'},
    {q: '有人用干擾器蓋掉車廂內的無線訊號，平台收不到探頭讀值。', a: 2, say: '干擾（Jamming）：不必碰到任何資料，讓通訊中斷就達到目的。'},
    {q: '攻擊者錄下一筆合法的「解除庫門鎖定」指令，隔天原封不動再送一次。', a: 1, say: '重放：內容沒改也不必看懂，但舊指令被當成新指令執行，訊息的可信度被破壞。要靠 nonce、序號或時間戳判斷。'},
    {q: '離職員工的帳號沒停用，他登入平台下載了客戶資料。', a: 0, say: '未授權存取：資料被不該看的人取得。這也是帳號權限（AAA 的授權）管理的問題。'},
  ];
  function judgeEvent(index, choice) {
    const e = EVENTS[index], ok = choice === e.a;
    return {ok, answer: CIA[e.a], say: e.say};
  }

  const api = {KEYS, PURPOSES, EVENTS, evaluateKey, judgeEvent};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$, radios} = root.AIOTLab;

  function keyViz(p, key, r) {
    const a = OWNERS[p.sender], b = OWNERS[p.receiver];
    const sent = key && r.usable;
    const label = !key ? '選一把鑰匙' : !r.usable ? a + '手上沒有' : (p.id === 'encrypt' ? '上鎖：' : '簽章：') + keyName(key[0], key[1]);
    const rClass = !sent ? 'box' : r.receiver ? 'ok' : 'bad', oClass = !sent ? 'box' : r.outsider ? 'bad' : 'ok';
    const rText = !sent ? '—' : r.receiver ? p.receiverYes : p.receiverNo, oText = !sent ? '—' : r.outsider ? p.outsiderYes : p.outsiderNo;
    return '<svg viewBox="0 0 360 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(a + '傳給' + b + '，' + label) + '"><defs><marker id="s1-25-keys-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk"/></marker></defs>' +
      '<rect x="8" y="10" width="84" height="56" rx="8" class="' + (key && !r.usable ? 'bad' : 'acc') + '"/><text x="50" y="35" class="tb tc">' + a + '</text><text x="50" y="56" class="ts tc">發送方</text>' +
      '<line x1="92" y1="38" x2="248" y2="38" class="' + (sent ? 'la' : 'ln dash') + '" marker-end="url(#s1-25-keys-arr)"/><text x="170" y="28" class="ts tc ta">' + esc(label) + '</text>' +
      '<rect x="250" y="10" width="102" height="56" rx="8" class="' + rClass + '"/><text x="301" y="35" class="tb tc">' + b + '</text><text x="301" y="56" class="ts tc">' + esc(rText) + '</text>' +
      '<line x1="170" y1="38" x2="248" y2="112" class="ln dash"/>' +
      '<rect x="250" y="86" width="102" height="56" rx="8" class="' + oClass + '"/><text x="301" y="111" class="tb tc">外人</text><text x="301" y="132" class="ts tc">' + esc(oText) + '</text></svg>';
  }

  function keysLab(el) {
    let purpose = 0, key = null;
    const solved = [false, false];
    el.innerHTML = '<h3>實驗：用哪把鑰匙</h3><p class="small">先選目的，再挑一把鑰匙，看誰打得開、誰偽造得了。</p><div class="chips" role="group" aria-label="目的" data-group="purpose">' + PURPOSES.map((p, i) => '<button type="button" data-p="' + i + '">' + esc(p.tab) + '</button>').join('') + '</div><p class="lab-task"></p><div class="lab-viz"></div><div class="chips" role="group" aria-label="鑰匙">' + KEYS.map((k, i) => '<button type="button" data-k="' + i + '">' + esc(keyName(k[0], k[1])) + '</button>').join('') + '</div><p class="lab-say" aria-live="polite" hidden></p><div class="tasks">' + PURPOSES.map((p, i) => '<div class="task" data-t="' + i + '"><span class="mark" aria-hidden="true">○</span><span>' + esc(p.tab) + '</span></div>').join('') + '</div><p class="small muted">這裡只看「誰持有哪把鑰匙」，不做真實運算，是簡化模型。實務上非對稱運算多半只用來保護金鑰或簽訊息的雜湊，資料本體仍用對稱加密。</p>';
    const task = el.querySelector('.lab-task'), viz = el.querySelector('.lab-viz'), say = el.querySelector('.lab-say');
    function draw() {
      const p = PURPOSES[purpose], r = key ? evaluateKey(p.id, key[0], key[1]) : null;
      if (r && r.ok) solved[purpose] = true;
      task.textContent = p.task;
      viz.innerHTML = keyViz(p, key, r);
      $$('[data-p]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(i === purpose)));
      $$('[data-k]', el).forEach((b, i) => b.setAttribute('aria-pressed', String(!!key && KEYS[i] === key)));
      let text = r ? r.say : '';
      if (r && r.ok && solved[0] && solved[1]) text += ' 兩個目的對照起來：加密用對方的公鑰，簽章用自己的私鑰。';
      say.textContent = text; say.hidden = !text;
      $$('.task', el).forEach((d, i) => { d.classList.toggle('done', solved[i]); d.querySelector('.mark').textContent = solved[i] ? '✓' : '○'; });
    }
    $$('[data-p]', el).forEach(b => b.onclick = () => { purpose = +b.dataset.p; key = null; draw(); });
    $$('[data-k]', el).forEach(b => b.onclick = () => { key = KEYS[+b.dataset.k]; draw(); });
    draw();
  }

  function ciaLab(el) {
    el.innerHTML = '<h3>實驗：這起事件打中 CIA 哪一角</h3><p class="small">每起事件選它最直接破壞的目標。</p>' + EVENTS.map((e, i) => '<div class="tasks" data-e="' + i + '">' + radios('s1-25-cia-' + i, (i + 1) + '. ' + e.q, CIA, -1) + '<p class="lab-say" aria-live="polite" hidden></p></div>').join('') + '<p class="small muted">真實事件常同時傷到多項，這裡只看描述中最直接的損害。</p>';
    $$('[data-e]', el).forEach((d, i) => {
      const say = d.querySelector('.lab-say');
      $$('input', d).forEach(input => input.onchange = () => {
        const r = judgeEvent(i, +input.value);
        say.innerHTML = '<b>' + (r.ok ? '對，是' : '主要破壞的是') + esc(r.answer) + '。</b>' + esc(r.say);
        say.hidden = false;
      });
    });
  }

  root.AIOTLab.register('s1-25-keys', keysLab);
  root.AIOTLab.register('s1-25-cia', ciaLab);
})(this);
