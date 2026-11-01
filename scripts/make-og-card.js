// Renders the social share card from HTML. Run: PW_CHANNEL=msedge node scripts/make-og-card.js
const {chromium} = require('@playwright/test');
const STOPS = ['感測', '訊號', '控制器', '傳輸', '平台', '分析與行動'];
const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#12344D;color:#fff;font-family:"Microsoft JhengHei","PingFang TC","Noto Sans CJK TC",sans-serif;padding:76px 80px;display:flex;flex-direction:column}
.k{font-size:30px;color:#C4D3DF;font-weight:700}h1{font-size:96px;margin:14px 0 14px;font-weight:800}p{font-size:36px;line-height:1.5;margin:0;color:#E6EEF4}
ol{list-style:none;display:flex;padding:0;margin:auto 0 0}li{flex:1;position:relative;padding-top:44px;font-size:30px;font-weight:700}
li:before{content:"";position:absolute;left:0;right:0;top:12px;height:5px;background:#F0A36B}li:last-child:before{right:45%}
li:after{content:"";position:absolute;left:0;top:0;width:30px;height:30px;border-radius:50%;background:#12344D;border:6px solid #74AEEB}
</style><div class="k">iPAS AIoT 應用工程師初級・非官方學習網站</div><h1>AIoT 導讀</h1><p>一筆感測資料，從現場走到決策。<br>白話講解、圖解與互動實驗。</p><ol>${STOPS.map(s => `<li>${s}</li>`).join('')}</ol>`;
(async () => {
  const b = await chromium.launch(process.env.PW_CHANNEL ? {channel: process.env.PW_CHANNEL} : {});
  const p = await b.newPage({viewport: {width: 1200, height: 630}});
  await p.setContent(html);
  await p.screenshot({path: 'static/assets/og-card.png'});
  await b.close();
  console.log('wrote static/assets/og-card.png');
})();
