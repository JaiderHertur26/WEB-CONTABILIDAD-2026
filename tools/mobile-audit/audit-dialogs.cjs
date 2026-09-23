const fs = require('fs');
const path = require('path');

const tests = [
  ['transaction','/transactions','Nueva'],
  ['inventory','/inventory','Nuevo Producto'],
  ['cash','/cash-accounts','Nueva Caja'],
  ['bank','/bank-accounts','Nueva Cuenta'],
  ['receivable','/accounts-receivable','Nueva Cuenta'],
  ['payable','/accounts-payable','Nueva Cuenta'],
  ['fixed','/fixed-assets','Nuevo Activo'],
  ['real-estate','/real-estates','Nueva Propiedad'],
  ['account','/accounts','Nueva Cuenta'],
  ['contact','/contacts','Nuevo Contacto'],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const pages = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const target = pages.find(p => p.type === 'page');
  if (!target) throw new Error('No WebView page found');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });

  let seq=0;
  const pending=new Map();
  ws.addEventListener('message',evt=>{
    const msg=JSON.parse(String(evt.data));
    if(!msg.id||!pending.has(msg.id)) return;
    const p=pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq; pending.set(id,{resolve,reject}); ws.send(JSON.stringify({id,method,params}));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const outDir=path.join(__dirname,'dialogs');
  fs.mkdirSync(outDir,{recursive:true});
  const results=[];

  for(const [slug,route,label] of tests){
    await send('Runtime.evaluate',{expression:`location.hash='#${route}'; true`});
    await sleep(1200);

    const click=await send('Runtime.evaluate',{
      expression:`(() => {
        const norm=s=>(s||'').replace(/\\s+/g,' ').trim().toLowerCase();
        const target=[...document.querySelectorAll('button')].find(b=>norm(b.innerText).includes(${JSON.stringify(label.toLowerCase())}));
        if(!target) return {clicked:false, buttons:[...document.querySelectorAll('button')].map(b=>norm(b.innerText)).filter(Boolean).slice(0,30)};
        target.click();
        return {clicked:true,text:target.innerText};
      })()`,
      returnByValue:true
    });

    await sleep(700);

    const audit=await send('Runtime.evaluate',{
      expression:`(() => {
        const d=document.querySelector('[role="dialog"]');
        if(!d) return {found:false, route:location.hash};
        const r=d.getBoundingClientRect();
        const visible=el=>{
          const s=getComputedStyle(el),x=el.getBoundingClientRect();
          return s.display!=='none'&&s.visibility!=='hidden'&&x.width>0&&x.height>0;
        };
        const controls=[...d.querySelectorAll('button,input,select,textarea,[role="button"]')].filter(visible);
        const small=controls.map(el=>{
          const x=el.getBoundingClientRect();
          return {tag:el.tagName,text:(el.innerText||el.getAttribute('aria-label')||el.type||'').trim().slice(0,50),width:x.width,height:x.height};
        }).filter(x=>x.width<40||x.height<40);
        return {
          found:true,
          route:location.hash,
          title:d.querySelector('[role="heading"],h1,h2,h3')?.innerText||'',
          viewport:{width:innerWidth,height:innerHeight},
          rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
          insideViewport:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,
          clientHeight:d.clientHeight,
          scrollHeight:d.scrollHeight,
          scrollable:d.scrollHeight>d.clientHeight+2,
          fields:d.querySelectorAll('input,select,textarea,[role="combobox"]').length,
          buttons:d.querySelectorAll('button').length,
          smallTargets:small,
          text:(d.innerText||'').replace(/\\s+/g,' ').trim().slice(0,500)
        };
      })()`,
      returnByValue:true
    });

    const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    fs.writeFileSync(path.join(outDir,`${slug}.png`),Buffer.from(shot.data,'base64'));

    results.push({slug, click:click.result.value, audit:audit.result.value});
    console.log(slug, JSON.stringify({click:click.result.value,audit:audit.result.value}));

    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await sleep(400);
  }

  fs.writeFileSync(path.join(outDir,'dialogs.json'),JSON.stringify(results,null,2));
  ws.close();
  console.log('DONE');
}

main().catch(e=>{console.error(e);process.exit(1);});
