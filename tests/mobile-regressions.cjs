// Opt-in browser checks: run only when requested. See docs/performance-audit.md.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path'),os=require('node:os');
const baseline=process.env.BASELINE_REF;
const baseURL=process.env.GAME_URL || 'http://127.0.0.1:8765';
const out={};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 for(const version of (baseline?['before','after']:['after'])){
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  if(version==='before')await context.route(/\/games\/(bomb-game\.js|gun\.html|battle\.html|ship\.html)(\?.*)?$/,route=>{const name=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({body:execFileSync('git',['show',baseline+':games/'+name]),contentType:name.endsWith('js')?'text/javascript':'text/html'})});
  const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let n=2026;Math.random=()=>((n=(n*1664525+1013904223)>>>0)/4294967296)});
  const open=async name=>{await page.goto(baseURL+'/games/'+name+'.html',{waitUntil:'load'});await page.waitForTimeout(350)};
  const r=out[version]={};
  await open('bomb');
  r.explosion=await page.evaluate(()=>{let gradients=0;const original=CanvasRenderingContext2D.prototype.createRadialGradient;CanvasRenderingContext2D.prototype.createRadialGradient=function(...a){gradients++;return original.apply(this,a)};const start=performance.now();for(let n=0;n<3;n++){const e=new Explosion(W/2,H/2,true);for(let i=0;i<30;i++){e.update();e.draw(ctx)}}CanvasRenderingContext2D.prototype.createRadialGradient=original;return {gradients,ms:performance.now()-start}});
  await open('battle');await page.locator('#start-battle-btn').click();await page.locator('#battle-pause-btn').click();
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
  r.pausedBattle=await page.evaluate(()=>({portrait:battleView.portrait,canvas:[canvas.width,canvas.height],view:[battleView.width,battleView.height],css:[canvas.clientWidth,canvas.clientHeight],paused}));
  if(version==='after'){assert(r.pausedBattle.portrait);assert(Math.abs(r.pausedBattle.view[0]/r.pausedBattle.view[1]-r.pausedBattle.css[0]/r.pausedBattle.css[1])<.01)}
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(400);
  if(version==='after')assert.equal(await page.evaluate(()=>battleView.portrait),false);
  await open('ship');await page.locator('#start-ship-btn').click();await page.locator('#pause-btn').click();
  await page.evaluate(()=>{game.aimX=W-12;game.aimY=H-20});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(450);
  r.shipAim=await page.evaluate(()=>({x:game.aimX,y:game.aimY,W,H,inside:game.aimX>=0&&game.aimX<=W&&game.aimY>=0&&game.aimY<=H}));
  if(version==='after')assert(r.shipAim.inside);
  await page.setViewportSize({width:844,height:390});
  await open('gun');
  r.gun=await page.evaluate(()=>{
   const positions=[[0,1.7,34,0,1.7,0],[-20,2,-30,-60,2,-30],[42,2,-70,42,2,-35],[50,2,10,50,2,48],[-45,2,55,-45,2,30],[10,2,54,-20,2,54],[0,2,0,78,2,0],[0,2,0,0,2,-78]];
   const walls=scene.children.filter(o=>o.isMesh&&!o.userData.noHit);
   const hits=positions.map(v=>{const a=new THREE.Vector3(...v.slice(0,3)),b=new THREE.Vector3(...v.slice(3)),ray=new THREE.Raycaster(a,b.sub(a).normalize());const h=ray.intersectObjects(walls,false)[0];return h?{distance:h.distance,point:h.point.toArray()}:null});
   renderer.render(scene,camera);const base={...renderer.info.memory},rounds=[];
   for(let n=0;n<4;n++){
    const g=makeZombie(0,30,'archer');setZombieLabel(g,'test','#173443');g.traverse(o=>o.visible=true);
    const a=makeEnemyArrow();a.position.set(0,2,30);scene.add(a);
    const box=ammoBox(0,30,10,false);
    renderer.render(scene,camera);
    for(const obj of [g,a,box.m,box.pil]){if(typeof removeTransient==='function')removeTransient(obj);else scene.remove(obj)}
    zombies.splice(zombies.indexOf(g),1);pickups.splice(pickups.indexOf(box),1);
    renderer.render(scene,camera);rounds.push({...renderer.info.memory});
   }
   return {base,rounds,hits,calls:renderer.info.render.calls};
  });
  if(version==='after'){
   assert.deepEqual(r.gun.rounds[3],r.gun.rounds[0]);
   if(baseline)for(let i=0;i<r.gun.hits.length;i++){const old=out.before.gun.hits[i],now=r.gun.hits[i];assert(old&&now);assert(Math.abs(old.distance-now.distance)<.0001,'wall ray '+i)}
   assert(r.explosion.gradients<=7);
  }
  r.errors=errors;assert.deepEqual(errors,[]);console.log(version,JSON.stringify(r));await context.close();
 }
 // Full viewport matrix, including paused rotation and no page-level horizontal overflow.
 out.viewports=[];
 const games={bomb:'#bomb-start-button',battle:'#start-battle-btn',miner:'#miner-start-btn',ship:'#start-ship-btn',sniper:'#start-sniper-btn',tank:'#startTankBtn',gun:'#startBtn',runner:'#startBtn','word-hunt-vocab':'#dialogButton'};
 for(const [name,start] of Object.entries(games)){
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:2});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL+'/games/'+name+'.html',{waitUntil:'load'});await page.locator(start).click();
  for(const [width,height] of [[390,844],[844,390],[768,1024],[1024,768],[1366,768]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(300);
   const data=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvases:[...document.querySelectorAll('canvas')].filter(c=>c.getBoundingClientRect().width>0).map(c=>({id:c.id,w:c.width,h:c.height,rect:c.getBoundingClientRect().toJSON()}))}));
   assert(!data.overflow,name+' overflow '+width);for(const c of data.canvases){assert(c.w>0&&c.h>0);assert(c.rect.width>0&&c.rect.height>0)}
   if(name==='ship'){
    const overlap=await page.evaluate(()=>{const a=document.getElementById('ammo-label').getBoundingClientRect(),b=document.getElementById('pause-btn').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top});
    assert(!overlap,'ship ammo/pause overlap '+width);
   }
   out.viewports.push({game:name,width,height,ok:true});
  }
  assert.deepEqual(errors,[]);console.log('viewports OK',name);await context.close();
 }
 fs.writeFileSync(process.env.AUDIT_OUTPUT || path.join(os.tmpdir(),'studentgames-regression.json'),JSON.stringify(out,null,2));await browser.close();console.log('All regression checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
