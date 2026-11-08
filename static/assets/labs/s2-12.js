/* Lab for 2-12: pure logic is exported for tests; the DOM part runs only in a browser. */
(function (root) {
  'use strict';

  // Each check: rules = causes this result really excludes, supports = causes it directly backs up.
  // A check may do neither: that is the point of "a clue is not a diagnosis".
  const CASES = [
    {
      id: 'nodata',
      name: '平台收不到探頭資料',
      symptom: '清晨 6 點，平台上冷藏庫節點 3-07 的溫度曲線停在 02:10，告警也沒有再更新。值班人員問：這台是不是沒電了？',
      truth: 'wifi',
      causes: [
        {id: 'power', name: '電源', desc: '節點沒電或電壓不足'},
        {id: 'hang', name: '程式', desc: '韌體當掉，沒有在執行'},
        {id: 'probe', name: '探頭', desc: '溫度探頭故障或斷線'},
        {id: 'wifi', name: 'Wi-Fi', desc: '節點連不上基地台'},
        {id: 'shared', name: '共同設備', desc: '基地台、Broker 或平台整體異常'},
      ],
      checks: [
        {id: 'ping', name: 'ping 節點', where: '遠端', result: ['ping 192.168.20.47', '要求等候逾時，封包遺失 100%'], can: '從這裡到節點目前沒有回應。', cannot: '不代表節點沒電。它可能沒連上網、IP 換了，或設定成不回 ping。', rules: [], supports: []},
        {id: 'others', name: '看同區其他節點', where: '遠端', result: ['同一台基地台下另外 11 個節點：資料正常', '只有 3-07 停在 02:10'], can: '基地台、Broker 與平台都還在運作，問題集中在這一台。', cannot: '還不知道這台卡在電源、程式、探頭還是連線。', rules: ['shared'], supports: []},
        {id: 'changes', name: '查最近的變更紀錄', where: '遠端', result: ['02:00 維護：更換基地台 Wi-Fi 密碼', '已更新設定的節點清單：11 台，沒有 3-07'], can: '時間和中斷很接近，值得優先往連線方向查。', cannot: '時間接近只是相關。還沒看到這台真的因此連不上。', rules: [], supports: []},
        {id: 'meter', name: '三用電錶量電源', where: '到現場', result: ['節點電源端子：3.29 V，讀數穩定'], can: '節點有電，電壓在正常範圍。', cannot: '有電不代表程式在跑。電錶也抓不到極短暫的壓降。', rules: ['power'], supports: []},
        {id: 'serial', name: '序列監看', where: '到現場', result: ['[sensor] temp=4.2C', '[wifi] auth failed, retry 38', '[sensor] temp=4.2C'], can: '程式持續執行，沒有反覆開機，探頭也有讀值。訊息直接指向 Wi-Fi 認證失敗。', cannot: '只看到認證被拒，還要核對密碼是否就是原因。', rules: ['power', 'hang', 'probe'], supports: ['wifi']},
        {id: 'spectrum', name: '頻譜分析儀掃 2.4 GHz', where: '到現場', result: ['2.4 GHz 頻段沒有明顯的不明訊號'], can: '此刻沒看到強烈干擾。', cannot: '這項回答的是「有沒有干擾」，沒有排除任何一個嫌疑。工具要對應問題。', rules: [], supports: []},
      ],
      fix: '把新密碼寫進 3-07 後，一次只改這一項。接著確認平台資料恢復、查斷線期間有沒有漏掉告警，並把它補進設定清單。',
    },
    {
      id: 'garbled',
      name: '序列埠亂碼',
      symptom: '維修時把筆電接到冷凍櫃控制器，序列監看的畫面大多是亂碼，偶爾夾雜看得懂的字。這條線是臨時從別的機台拆來的。',
      truth: 'ground',
      causes: [
        {id: 'baud', name: '通訊參數', desc: '兩端鮑率或資料格式不一致'},
        {id: 'tx', name: '控制器輸出', desc: '韌體或 TX 腳送出的就是錯的'},
        {id: 'reset', name: '反覆重開', desc: '電壓不足，控制器不斷重新開機'},
        {id: 'ground', name: '接線', desc: '傳輸線或共地接觸不良'},
      ],
      checks: [
        {id: 'settings', name: '核對兩端設定', where: '筆電', result: ['韌體：115200 8N1', '監看軟體：115200 8N1'], can: '鮑率與資料格式一致，最常見的原因排除了。', cannot: '亂碼不一定來自鮑率。設定一致也不代表線路沒問題。', rules: ['baud'], supports: []},
        {id: 'reboot', name: '重開控制器', where: '現場', result: ['重開後前幾行正常', '約一分鐘後又出現亂碼'], can: '問題會隨時間或運轉狀態出現。', cannot: '暫時恢復不等於修好，也沒有指出原因。', rules: [], supports: []},
        {id: 'volt', name: '三用電錶量電源', where: '現場', result: ['控制器 5 V 電源：5.02 V', '壓縮機啟動時：4.98 V'], can: '平均電壓正常。', cannot: '電錶更新慢，抓不到幾毫秒的下陷，還不能排除反覆重開。', rules: [], supports: []},
        {id: 'logic', name: '邏輯分析儀接控制器板', where: '現場', result: ['解碼（115200 8N1）：T=-18.2C, T=-18.2C, …', '內容連續乾淨，沒有重複的開機訊息'], can: '控制器送出的資料正確，也沒有反覆重開。問題落在板子到筆電之間。', cannot: '這只證明板子這一端正常，還不知道線上哪裡有問題。', rules: ['tx', 'reset'], supports: []},
        {id: 'continuity', name: '斷電量線材導通', where: '現場', result: ['轉接線 GND 到控制器 GND：OL（開路）', '搖動接頭時偶爾導通'], can: '共地線接觸不良。兩邊沒有共同的電壓基準，接收端判斷 0 和 1 就會出錯。', cannot: '要把線接好後再看一次，才算確認它就是亂碼的來源。', rules: [], supports: ['ground']},
        {id: 'pingctl', name: 'ping 控制器', where: '遠端', result: ['回覆時間 3 ms，封包遺失 0%'], can: '控制器的網路是通的，也表示它有電。', cannot: '序列線和網路是兩條不同的路，這項對亂碼沒有幫助。', rules: [], supports: []},
      ],
      fix: '重新壓接 GND 後再看序列監看，並等壓縮機啟動一輪，確認亂碼沒有再出現。把這條舊線標記報廢或修好。',
    },
    {
      id: 'dns',
      name: '能 ping IP，連不上網域名稱',
      symptom: '週一早上，冷凍庫閘道器連不上 broker.coldchain.example，資料停了。工程師在同一台閘道器 ping Broker 的 IP（203.0.113.20）有回應。',
      truth: 'resolver',
      causes: [
        {id: 'resolver', name: '名稱解析', desc: '閘道器查不到網域名稱'},
        {id: 'record', name: 'DNS 記錄', desc: '網域名稱的記錄本身錯誤或過期'},
        {id: 'port', name: '服務與 port', desc: 'Broker 沒啟動，或防火牆擋 1883'},
        {id: 'creds', name: '帳密', desc: 'MQTT 帳號密碼或權限有誤'},
      ],
      checks: [
        {id: 'lookup', name: 'nslookup（用預設 DNS）', where: '閘道器', result: ['nslookup broker.coldchain.example', 'DNS request timed out'], can: '閘道器目前設定的 DNS 伺服器沒有回答，名稱解析這一步卡住了。', cannot: '還不確定記錄本身對不對，也不知道下一層 port 通不通。', rules: [], supports: ['resolver']},
        {id: 'lookup2', name: 'nslookup（指定另一台 DNS）', where: '閘道器', result: ['nslookup broker.coldchain.example 8.8.8.8', 'Address: 203.0.113.20'], can: '名稱的記錄存在，而且指向正確的 Broker。', cannot: '這只證明記錄沒錯，不代表 port 或登入沒問題。', rules: ['record'], supports: []},
        {id: 'ipconfig', name: '看 IP 與 DNS 設定', where: '閘道器', result: ['IP 192.168.20.31　閘道 192.168.20.1', 'DNS 192.168.10.53'], can: 'IP 與閘道看起來合理，也知道 DNS 指向哪一台。', cannot: '光看設定分不出對錯，要對照實際環境。', rules: [], supports: []},
        {id: 'changes', name: '查最近的變更紀錄', where: '遠端', result: ['週六：舊 DNS 主機 192.168.10.53 下線'], can: '這和閘道器設定的 DNS 是同一台，解釋了為什麼週末後才壞。', cannot: '還要確認它是唯一的問題，上層也可能同時有狀況。', rules: [], supports: ['resolver']},
        {id: 'nc', name: 'nc 測 Broker 的 port', where: '閘道器', result: ['nc -vz 203.0.113.20 1883', 'succeeded'], can: 'Broker 有在聽 1883，防火牆也沒有擋。', cannot: '連上 port 不等於登入成功。', rules: ['port'], supports: []},
        {id: 'brokerlog', name: '看 Broker 日誌', where: '遠端', result: ['這台閘道器的最後連線：週五 18:02', '之後沒有連線紀錄，也沒有登入失敗'], can: '閘道器根本沒走到登入這一步，不是帳密被拒。', cannot: '沒有紀錄不會告訴你它卡在哪一層，要配合其他檢查。', rules: ['creds'], supports: []},
        {id: 'meter', name: '三用電錶量電源', where: '現場', result: ['閘道器電源：12.1 V'], can: '電源正常。', cannot: '能 ping 就已經知道它有電，這項沒有帶來新資訊。', rules: [], supports: []},
      ],
      fix: '把 DNS 改成新主機（最好由 DHCP 統一發放），再確認名稱查得到、MQTT 重新連上、資料恢復。順便找出還有哪些設備指向舊 DNS。',
    },
    {
      id: 'i2c',
      name: 'I²C 感測器偶爾讀不到',
      symptom: '貨車車廂的溫濕度感測器用約 3 公尺的線接回主機，大多數讀值正常，但每小時有十幾筆讀取失敗。I²C 匯流排跑 100 kHz。',
      truth: 'signal',
      causes: [
        {id: 'addr', name: '位址衝突', desc: '線上有兩顆元件用同一位址'},
        {id: 'contact', name: '接觸', desc: '車輛振動讓接頭接觸不良'},
        {id: 'power', name: '壓降', desc: '電壓瞬間下降，感測器來不及回應'},
        {id: 'sensor', name: '感測器', desc: '感測器本身老化或損壞'},
        {id: 'signal', name: '訊號品質', desc: '長線讓訊號邊緣變慢，判讀出錯'},
      ],
      checks: [
        {id: 'serial', name: '序列監看', where: '車上', result: ['[i2c] read 0x44 NACK（每小時約 12 筆）', '停車與行駛時都會發生'], can: 'NACK 表示該回應時沒有收到回應。失敗和行駛沒有明顯關係。', cannot: '只看到結果，還沒看到原因。', rules: [], supports: []},
        {id: 'scan', name: '執行 I²C 掃描', where: '車上', result: ['掃描結果：0x44', '核對接線：這條線實際只接一顆'], can: '只有一顆元件，不可能是位址衝突。', cannot: '掃描當下有回應，不代表一直正常。偶發問題掃一次看不出來。', rules: ['addr'], supports: []},
        {id: 'meter', name: '三用電錶量電壓', where: '車上', result: ['感測器 VCC：3.29 V，讀數穩定'], can: '平均電壓正常。', cannot: '電錶抓不到瞬間下陷，壓降還不能排除。', rules: [], supports: []},
        {id: 'scopevcc', name: '示波器看 VCC', where: '車上', result: ['讀取期間 VCC 維持 3.25–3.30 V', '失敗當下也沒有下陷'], can: '失敗時電壓沒有掉，壓降可以排除。', cannot: '這裡只看電源，還沒看訊號線。', rules: ['power'], supports: []},
        {id: 'wiggle', name: '連續讀取並搖動接頭', where: '車上', result: ['搖動前後失敗率沒有明顯變化', '導通量測正常'], can: '接頭接觸不像是主因。', cannot: '接觸沒問題，不代表線路上的訊號沒問題。', rules: ['contact'], supports: []},
        {id: 'swap', name: '換上已知正常的感測器', where: '車上', result: ['換新感測器後，失敗率一樣'], can: '問題沒有跟著舊感測器走，感測器本身可以排除。', cannot: '只知道不是它，還不知道是誰。', rules: ['sensor'], supports: []},
        {id: 'logic', name: '邏輯分析儀看 SDA、SCL', where: '車上', result: ['失敗時：位址送出後收到 NACK', '其餘交易解碼正常'], can: '確認失敗發生在位址回應這一步。', cannot: '它只記錄 0 和 1，看不到邊緣的形狀，也看不到電壓高低。', rules: [], supports: []},
        {id: 'scopesda', name: '示波器看 SDA 波形', where: '車上', result: ['上升時間約 1.4 µs（100 kHz 模式上限 1 µs）', '上拉電阻 4.7 kΩ'], can: '線太長、電容大，上拉電阻又偏大，訊號爬升太慢，已超出 I²C 規格。', cannot: '超規格是強烈線索。改善後要復測，失敗真的消失才算確認。', rules: [], supports: ['signal']},
      ],
      fix: '只改一項：上拉電阻換成 2.2 kΩ，上升時間估計降到約 0.65 µs。偶發問題要觀察夠久，至少連跑一趟車，比較前後的失敗次數。線還要更長時，就該換成適合長距離的通訊方式。',
    },
  ];

  function findCase(id) { return CASES.find(c => c.id === id); }
  function usedChecks(c, done) { return c.checks.filter(k => done.includes(k.id)); }

  // Status of each suspect after the given checks. Only what the results really show counts.
  function suspects(c, done) {
    const used = usedChecks(c, done);
    return c.causes.map(x => {
      const by = used.find(k => k.rules.includes(x.id));
      if (by) return Object.assign({}, x, {status: 'no', by: by.name});
      const sup = used.find(k => k.supports.includes(x.id));
      return Object.assign({}, x, {status: sup ? 'ok' : 'maybe', by: sup ? sup.name : ''});
    });
  }

  // The judgement never says "wrong" for a suspect still open: the evidence simply is not there yet.
  function judge(c, causeId, done) {
    const list = suspects(c, done), me = list.find(x => x.id === causeId);
    if (!me) return {kind: 'unknown'};
    if (me.status === 'no') return {kind: 'ruledOut', by: me.by};
    const open = list.filter(x => x.id !== causeId && x.status !== 'no').map(x => x.name);
    const supported = me.status === 'ok';
    if (!open.length && supported && causeId === c.truth) return {kind: 'solid'};
    return {kind: 'notYet', open, supported};
  }

  // What to do next when the verdict is not yet solid. done: checks run; read: checks whose interpretation was opened.
  function nextStep(done, read) {
    const unread = done.filter(id => !read.includes(id)).length;
    return unread ? '還有 ' + unread + ' 項檢查的結果沒看解讀，先看過再算證據。' : '再選一項檢查。';
  }

  // Rise time of an RC-loaded I2C line, 30% to 70% of VDD: tr = 0.8473 x R x C (TI SLVA689).
  function i2cRiseTime(ohm, farad) { return 0.8473 * ohm * farad; }

  const api = {CASES, findCase, suspects, judge, nextStep, i2cRiseTime};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ----- DOM -----
  const {esc, $$} = root.AIOTLab;
  const LABEL = {maybe: '未排除', no: '已排除', ok: '有證據'};

  // Evidence counts only after its interpretation was read (read), the same rule as the suspect list.
  function verdictHtml(c, causeId, read, done) {
    const r = judge(c, causeId, read), name = c.causes.find(x => x.id === causeId).name;
    if (r.kind === 'ruledOut') return '<b>「' + esc(name) + '」已經被排除了。</b>依據是「' + esc(r.by) + '」的結果。再看一次那筆結果，想想它說明了什麼。';
    if (r.kind === 'solid') return '<b>證據足夠支持這個判斷：' + esc(name) + '。</b>其他嫌疑都有結果排除，這個原因也有直接證據。<br><b>接著驗證：</b>' + esc(c.fix);
    const left = r.open.length ? '「' + r.open.map(esc).join('」「') + '」還沒排除' : '其他嫌疑都排除了';
    return '<b>現在還不能下這個結論。</b>' + left + (r.supported ? '，雖然這個方向已有證據支持。' : '，這個方向也還沒有直接證據。') + esc(nextStep(done, read));
  }

  function drillLab(el) {
    let c = CASES[0], done = [], read = [], picked = '';
    el.innerHTML = '<h3>實驗：排查演練，線索不等於確診</h3><p class="small">選一個案例，自己決定下一步檢查什麼。先看結果想一想，再看解讀；覺得夠了就下結論。</p><div class="chips" role="group" aria-label="故障案例">' + CASES.map(x => '<button type="button" data-case="' + esc(x.id) + '">' + esc(x.name) + '</button>').join('') + '</div><p class="lab-say d-symptom"></p><b>嫌疑清單</b><ul class="rank d-list"></ul><p class="small muted">清單只在你看過解讀之後更新。</p><b>下一步要檢查什麼？</b><div class="chips d-checks" role="group" aria-label="可做的檢查"></div><div class="d-log" aria-live="polite"></div><b>你認為原因是？</b><div class="chips d-causes" role="group" aria-label="下結論"></div><p class="lab-say d-verdict" aria-live="polite" hidden></p><p class="small muted">這是簡化的模擬：結果是預先寫好的，每案只有一個主因。現場可能有多個原因同時存在，也可能需要重複量測。</p><button type="button" class="linkbtn d-reset">這個案例重來</button>';
    const q = s => el.querySelector(s);

    function drawList() {
      q('.d-list').innerHTML = suspects(c, read).map(x => '<li class="' + x.status + '"><span class="st">' + LABEL[x.status] + '</span><b>' + esc(x.name) + '</b><span class="why">' + esc(x.desc) + '</span></li>').join('');
    }
    function drawVerdict() {
      const v = q('.d-verdict');
      v.hidden = !picked;
      v.innerHTML = picked ? verdictHtml(c, picked, read, done) : '';
      $$('[data-cause]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cause === picked)));
    }
    function addEntry(k) {
      const box = document.createElement('div');
      box.className = 'lab-say';
      box.innerHTML = '<b>' + esc(k.name) + '</b><br>' + k.result.map(l => '<code>' + esc(l) + '</code>').join('<br>') + '<br><button type="button" class="linkbtn">這個結果能說明什麼？</button>';
      box.querySelector('button').onclick = () => {
        read.push(k.id);
        box.querySelector('button').remove();
        box.insertAdjacentHTML('beforeend', '<b>能說明：</b>' + esc(k.can) + '<br><b>不能說明：</b>' + esc(k.cannot));
        box.tabIndex = -1;
        box.focus();
        drawList();
        if (picked) drawVerdict();
      };
      q('.d-log').prepend(box);
    }
    function load(next) {
      c = next; done = []; read = []; picked = '';
      $$('[data-case]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.case === c.id)));
      q('.d-symptom').textContent = c.symptom;
      q('.d-log').innerHTML = '';
      q('.d-checks').innerHTML = c.checks.map(k => '<button type="button" data-check="' + esc(k.id) + '" aria-pressed="false">' + esc(k.name) + '（' + esc(k.where) + '）</button>').join('');
      q('.d-causes').innerHTML = c.causes.map(x => '<button type="button" data-cause="' + esc(x.id) + '" aria-pressed="false">' + esc(x.name) + '</button>').join('');
      $$('[data-check]', el).forEach(b => b.onclick = () => {
        if (done.includes(b.dataset.check)) return;
        done.push(b.dataset.check);
        b.setAttribute('aria-pressed', 'true');
        addEntry(c.checks.find(k => k.id === b.dataset.check));
        if (picked) drawVerdict();
      });
      $$('[data-cause]', el).forEach(b => b.onclick = () => { picked = b.dataset.cause; drawVerdict(); });
      drawList(); drawVerdict();
    }
    $$('[data-case]', el).forEach(b => b.onclick = () => load(findCase(b.dataset.case)));
    q('.d-reset').onclick = () => load(c);
    load(c);
  }

  root.AIOTLab.register('s2-12-drill', drillLab);
})(this);
