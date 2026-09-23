const fs = require('fs');
const path = require('path');

const routes = [
  ['dashboard', '/'],
  ['organization', '/organization'],
  ['transactions', '/transactions'],
  ['contracts', '/contracts'],
  ['mass-intentions', '/mass-intentions'],
  ['invoices', '/invoices'],
  ['inventory', '/inventory'],
  ['cash-accounts', '/cash-accounts'],
  ['bank-accounts', '/bank-accounts'],
  ['accounts-receivable', '/accounts-receivable'],
  ['accounts-payable', '/accounts-payable'],
  ['fixed-assets', '/fixed-assets'],
  ['real-estates', '/real-estates'],
  ['reports', '/reports'],
  ['tax-reports', '/tax-reports'],
  ['accounts', '/accounts'],
  ['book-closings', '/book-closings'],
  ['contacts', '/contacts'],
  ['settings', '/settings'],
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function main() {
  const pages = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const target = pages.find(p => p.type === 'page');
  if (!target) throw new Error('No WebView page found');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', evt => {
    const msg = JSON.parse(String(evt.data));
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];

  for (const [slug, route] of routes) {
    await send('Runtime.evaluate', {
      expression: `location.hash = '#${route}'; true`,
      awaitPromise: true,
    });
    await sleep(1500);

    const evalResult = await send('Runtime.evaluate', {
      expression: `(() => {
        const workspace = document.querySelector('.app-workspace');
        if (workspace) workspace.scrollTop = 0;
        const rect = el => {
          const r = el.getBoundingClientRect();
          return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
        };
        const visible = el => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        };
        const clickables = [...document.querySelectorAll('button,a,[role="button"],input,select,textarea')].filter(visible);
        const smallTargets = clickables
          .map(el => ({ tag:el.tagName, text:(el.innerText||el.getAttribute('aria-label')||el.type||'').trim().slice(0,60), ...rect(el) }))
          .filter(x => x.width < 40 || x.height < 40)
          .slice(0,40);
        const tables = [...document.querySelectorAll('table')].filter(visible).map((el,i) => ({
          index:i, width:el.scrollWidth, clientWidth:el.clientWidth, ...rect(el),
          parentOverflowX:getComputedStyle(el.parentElement).overflowX
        }));
        const overflowing = [...document.querySelectorAll('main *')].filter(visible).map(el => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            cls: String(el.className||'').slice(0,120),
            text: (el.innerText||'').trim().replace(/\s+/g,' ').slice(0,80),
            left:r.left, right:r.right, width:r.width
          };
        }).filter(x => x.left < -2 || x.right > innerWidth + 2).slice(0,50);

        const headings = [...document.querySelectorAll('h1,h2,h3')].filter(visible)
          .map(el => ({ tag:el.tagName, text:el.innerText.trim().slice(0,100), ...rect(el) })).slice(0,20);

        return {
          route: location.hash,
          title: document.title,
          viewport: { width:innerWidth, height:innerHeight, dpr:devicePixelRatio },
          body: { scrollWidth:document.documentElement.scrollWidth, scrollHeight:document.documentElement.scrollHeight },
          workspace: workspace ? { clientWidth:workspace.clientWidth, scrollWidth:workspace.scrollWidth, clientHeight:workspace.clientHeight, scrollHeight:workspace.scrollHeight } : null,
          buttons: clickables.length,
          smallTargets,
          tables,
          overflowing,
          headings,
          textSample: (document.querySelector('main')?.innerText||'').trim().replace(/\s+/g,' ').slice(0,700)
        };
      })()`,
      returnByValue: true,
    });
    const data = evalResult.result.value;
    results.push({ slug, ...data });

    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(outDir, `${slug}.png`), Buffer.from(shot.data, 'base64'));
    console.log(slug, data.title, 'overflow', data.overflowing.length, 'small', data.smallTargets.length);
  }

  fs.writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify(results, null, 2));
  ws.close();
  console.log('DONE', outDir);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
