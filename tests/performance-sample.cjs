// Opt-in performance sampling; absolute FPS on desktop is not a mobile-device benchmark.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),path=require('node:path'),os=require('node:os');
const baseURL=process.env.GAME_URL || 'http://127.0.0.1:8765';
const outputDir=process.env.AUDIT_DIR || os.tmpdir();
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
 const result={};
 const games={bomb:'#bomb-start-button',battle:'#start-battle-btn',miner:'#miner-start-btn',ship:'#start-ship-btn',sniper:'#start-sniper-btn',tank:'#startTankBtn',gun:'#startBtn',runner:'#startBtn','word-hunt-vocab':'#dialogButton'};
 for(const [name,start] of Object.entries(games)){
  if(process.argv[3]&&!process.argv[3].split(',').includes(name))continue;
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.audit={frames:[],long:[],rects:0,gradients:0,mutations:0};
   const orig=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...a){audit.rects++;return orig.apply(this,a)};
   for(const m of ['createRadialGradient','createLinearGradient']){const f=CanvasRenderingContext2D.prototype[m];CanvasRenderingContext2D.prototype[m]=function(...a){audit.gradients++;return f.apply(this,a)}}
   new PerformanceObserver(l=>audit.long.push(...l.getEntries().map(e=>e.duration))).observe({entryTypes:['longtask']});
   addEventListener('DOMContentLoaded',()=>new MutationObserver(l=>audit.mutations+=l.length).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true}));
   let last;function frame(t){if(last)audit.frames.push(t-last);last=t;requestAnimationFrame(frame)}requestAnimationFrame(frame);
  });
  try {
   await page.goto(baseURL+'/games/'+name+'.html',{waitUntil:'networkidle',timeout:20000});
   await page.locator(start).click({timeout:4000});
   await page.waitForTimeout(1500);
   const client=await context.newCDPSession(page);await client.send('Performance.enable');await client.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.evaluate(()=>{audit={frames:[],long:[],rects:0,gradients:0,mutations:0}});
   const before=await client.send('Performance.getMetrics');
   await page.waitForTimeout(3500);
   const after=await client.send('Performance.getMetrics');
   const data=await page.evaluate(()=>{const f=audit.frames.sort((a,b)=>a-b);return {...audit,frames:undefined,n:f.length,median:f[Math.floor(f.length*.5)],p95:f[Math.floor(f.length*.95)],over33:f.filter(x=>x>34).length,canvases:[...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,css:[c.clientWidth,c.clientHeight]})),resource:performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').pop(),bytes:r.transferSize,ms:r.duration})),renderer:typeof renderer==='undefined'?null:{memory:renderer.info.memory,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}});
   const get=(m,n)=>m.metrics.find(x=>x.name===n)?.value||0;data.layoutCount=get(after,'LayoutCount')-get(before,'LayoutCount');data.layoutMs=(get(after,'LayoutDuration')-get(before,'LayoutDuration'))*1000;data.scriptMs=(get(after,'ScriptDuration')-get(before,'ScriptDuration'))*1000;
   await client.send('Emulation.setCPUThrottlingRate',{rate:1});
   data.rotation=[];
   for(const size of [{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);await page.waitForTimeout(600);
    data.rotation.push(await page.evaluate(()=>({viewport:[innerWidth,innerHeight],canvases:[...document.querySelectorAll('canvas')].map(c=>{const r=c.getBoundingClientRect();return {id:c.id,pixels:[c.width,c.height],rect:[r.x,r.y,r.width,r.height],visible:getComputedStyle(c).display}}),overflow:document.documentElement.scrollWidth>innerWidth,phase:typeof game!=='undefined'?game.phase||game.state:null})));
   }
   await page.screenshot({path:path.join(outputDir,'sg-'+name+'-'+(process.argv[2]||'sample')+'.png')});
   result[name]={...data,errors};
  }catch(e){result[name]={failure:e.message,errors}}
  console.log(name,JSON.stringify({...result[name],resource:undefined,rotation:undefined}));
  await context.close();
 }
 fs.writeFileSync(path.join(outputDir,'studentgames-'+(process.argv[2]||'sample')+'.json'),JSON.stringify(result,null,2));
 await browser.close();
})();
