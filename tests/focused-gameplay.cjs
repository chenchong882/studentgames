// Opt-in follow-up checks. BASELINE_REF enables comparison; no mobile FPS claims.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const baseline=process.env.BASELINE_REF,baseURL=process.env.GAME_URL||'http://127.0.0.1:8765';
const out={};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 for(const version of (baseline?['before','after']:['after'])){
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:3});
  if(version==='before')await context.route(/\/games\/(bomb-game\.js|runner\.html|gun\.html|tank\.html)(\?.*)?$/,route=>{const file=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({body:execFileSync('git',['show',baseline+':games/'+file]),contentType:file.endsWith('js')?'text/javascript':'text/html'})});
  await context.addInitScript(()=>{let n=17;Math.random=()=>((n=(n*1664525+1013904223)>>>0)/4294967296)});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const r=out[version]={};
  const open=async game=>{await page.goto(baseURL+'/games/'+game+'.html',{waitUntil:'load'});await page.waitForTimeout(200)};
  await open('bomb');await page.locator('#bomb-start-button').click();
  r.bomb=await page.evaluate(()=>{
   // Real bomb/house collision, followed by 30 actual fixed updates during the next-question delay.
   game.plane.hidden=true;game.planeRespawnT=120;
   const house=game.houses.find(h=>h.word===game.targetWord),target=game.targetWord;
   game.bombs.push(new Bomb(house.x,house.y+8,0,0));game.update();
   const exp=game.exps[0],float=game.floats[0],start={shock:exp.shockR,sink:house.sinkY,floatY:float.y};
   for(let i=0;i<30;i++)game.update();
   const feedback={start,end:{shock:exp.shockR,sink:house.sinkY,floatY:float.y},remaining:game.nextTargetFrames,sameTarget:game.targetWord===target,score:game.score};
   game.phase='paused';game.bombsLeft=5;
   const canvas=document.createElement('canvas');canvas.width=W*2;canvas.height=240;const c=canvas.getContext('2d');
   const original=CanvasRenderingContext2D.prototype.fillText;let calls=0;
   CanvasRenderingContext2D.prototype.fillText=function(...args){calls++;return original.apply(this,args)};
   const hud=()=>{if(typeof drawGameHUD==='function')drawGameHUD(c,game);else{drawHUD(c,game);drawWordPanel(c,game)}};
   const t=performance.now();for(let i=0;i<120;i++)hud();const hudMs=performance.now()-t,steadyTextCalls=calls;
   game.score++;hud();const changedScoreTextCalls=calls-steadyTextCalls;
   CanvasRenderingContext2D.prototype.fillText=original;
   const oldRAF=requestAnimationFrame,draw=game.draw,update=game.update;let draws=0,updates=0;
   window.requestAnimationFrame=()=>0;game.draw=()=>draws++;game.update=()=>updates++;_acc=0;_lastT=0;
   for(let i=1;i<=120;i++)loop(i*1000/120);
   const highRefresh={draws,updates};draws=0;updates=0;_acc=0;_lastT=0;
   for(let i=1;i<=60;i++)loop(i*16.6);const normalRefresh={draws,updates};
   window.requestAnimationFrame=oldRAF;game.draw=draw;game.update=update;_lastT=performance.now();_acc=0;
   return {feedback,steadyTextCalls,changedScoreTextCalls,hudMs,at120Hz:highRefresh,at60Hz:normalRefresh};
  });
  if(version==='after'){
   assert(r.bomb.feedback.end.shock>r.bomb.feedback.start.shock);assert(r.bomb.feedback.end.sink>r.bomb.feedback.start.sink);assert(r.bomb.feedback.end.floatY<r.bomb.feedback.start.floatY);assert(r.bomb.feedback.sameTarget);assert(r.bomb.feedback.score>0);
   assert(r.bomb.steadyTextCalls<50);assert(r.bomb.changedScoreTextCalls>0);assert(r.bomb.at120Hz.draws<=61);assert(r.bomb.at120Hz.updates>=59);assert.equal(r.bomb.at60Hz.draws,60);
  }
  await page.screenshot({path:path.join(os.tmpdir(),'sg-focused-bomb-'+version+'.png')});
  // Runner: measure one real question gate without raising lives above the game's supported range.
  await page.setViewportSize({width:390,height:844});await open('runner');await page.locator('#startBtn').click();
  const key=await page.evaluate(()=>{obstacles.forEach(o=>o.el.remove());obstacles=[];spawnGate();obstacles[0].dist=1200;nextIn=5000;window.auditMutations=0;new MutationObserver(l=>auditMutations+=l.filter(m=>m.attributeName==='class').length).observe(char,{attributes:true});return {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'}[obstacles[0].answerDir]});
  const touch=await context.newCDPSession(page),end={ArrowUp:[195,520],ArrowDown:[195,680],ArrowLeft:[115,600],ArrowRight:[275,600]}[key];
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:600}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:end[0],y:end[1]}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(5200);
  r.runner=await page.evaluate(()=>({state,gateNum,lives,classMutations:auditMutations,faces:char.querySelectorAll('.face').length,thinkScale:timeScale}));
  assert.equal(r.runner.state,'play');assert.equal(r.runner.lives,3);assert.equal(r.runner.gateNum,1);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
  r.runner.rotation=await page.evaluate(()=>({paused,tracking,slideHeld,overflow:document.documentElement.scrollWidth>innerWidth}));
  if(version==='after'){assert(r.runner.rotation.paused);assert(!r.runner.rotation.tracking);assert(!r.runner.rotation.slideHeld);assert(!r.runner.rotation.overflow);assert(r.runner.classMutations<20)}
  await page.setViewportSize({width:768,height:1024});await open('runner');
  r.runner.tabletFaces=await page.evaluate(()=>char.querySelectorAll('.face').length);
  if(version==='after')assert.equal(r.runner.tabletFaces,24);
  // House picture/word sizes in CSS pixels, independent of distance and DPR.
  await page.setViewportSize({width:844,height:390});await open('gun');await page.locator('#startBtn').click();
  r.labels=await page.evaluate(()=>{
   playing=false;camera.position.set(0,3,70);camera.rotation.set(.07,0,0);
   const measure=()=>{updateHouseLabelSizes();const projection=innerHeight*camera.projectionMatrix.elements[5]/2;return HOUSES.map(h=>{const s=h.label,depth=-s.position.clone().applyMatrix4(camera.matrixWorldInverse).z;return {height:s.scale.y*projection/depth,width:s.scale.x*projection/depth,aspect:s.userData.labelAspect}})};
   HOUSES.forEach((h,i)=>setHouseLabel(h,['🍎','🚗','🐶','🌳','🏠','🥐','🍌','🚒'][i],true));const pictures=measure();
   HOUSES.forEach(h=>setHouseLabel(h,'backpack'));const words=measure();
   HOUSES.forEach((h,i)=>setHouseLabel(h,['🍎','🚗','🐶','🌳','🏠','🥐','🍌','🚒'][i],true));measure();renderer.render(scene,camera);
   return {pictures,words};
  });
  if(version==='after'){assert(r.labels.pictures.every(x=>x.height>=87.9&&x.aspect===1));assert(r.labels.words.every(x=>x.height>=51.9));}
  await page.screenshot({path:path.join(os.tmpdir(),'sg-focused-gun-'+version+'.png')});
  await open('tank');
  r.tank=await page.evaluate(()=>{
   // Test the real shell update, including correct/wrong callbacks, with controlled target locations.
   const realRound=round,good=roundSuccess,bad=hitWrongSign,events=[];
   roundSuccess=()=>events.push('correct');hitWrongSign=()=>events.push('wrong');
   const item=(x,z,correct=true)=>({pos:new THREE.Vector3(x,100,z),tree:{x,z,base:88,top:100},correct});
   const run=(items,from,to)=>{events.length=0;round={items};const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),dt=.033,vel=b.clone().sub(a).divideScalar(dt);vel.y+=shellGrav()*dt;
    const shell={m:{position:a},vel,life:5,gone:false,rapid:false};updShell(shell,dt);return {gone:shell.gone,events:[...events]};};
   // 4.4 units per frame at the actual 135-unit shell speed; endpoints both miss a grazing tree.
   const grazing=run([item(0,0)],[-2.2,90,2.4],[2.2,90,2.4]);
   const relaxed=run([item(0,0)],[-1,90,2.85],[1,90,2.85]);
   const outside=run([item(0,0)],[-2.2,90,3.4],[2.2,90,3.4]);
   const above=run([item(0,0)],[-2.2,105,0],[2.2,105,0]);
   const signEdge=run([item(0,0)],[-1,103.5,0],[1,103.5,0]);
   const wrong=run([item(0,0,false)],[-2.2,90,2.4],[2.2,90,2.4]);
   const nearest=run([item(0,0,true),item(-4,0,false)],[-5,90,0],[-.6,90,0]);
   round=realRound;roundSuccess=good;hitWrongSign=bad;
   return {grazing,relaxed,outside,above,signEdge,wrong,nearest};
  });
  if(version==='after'){
   for(const key of ['grazing','relaxed','signEdge'])assert.deepEqual(r.tank[key].events,['correct'],key);
   assert.deepEqual(r.tank.wrong.events,['wrong']);assert.deepEqual(r.tank.nearest.events,['wrong']);
   assert.deepEqual(r.tank.outside.events,[]);assert.deepEqual(r.tank.above.events,[]);
  }
  
  if(version==='after'){
   r.rotations=[];
   for(const gameName of ['bomb','runner','gun','tank']){
    await page.setViewportSize({width:844,height:390});await open(gameName);
    await page.locator({bomb:'#bomb-start-button',runner:'#startBtn',gun:'#startBtn',tank:'#startTankBtn'}[gameName]).click();
    for(const [width,height] of [[667,375],[390,844],[844,390],[768,1024],[1024,768]]){
     await page.setViewportSize({width,height});await page.waitForTimeout(300);
     const v=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvases:[...document.querySelectorAll('canvas')].filter(c=>c.clientWidth>0).map(c=>[c.width,c.height,c.clientWidth,c.clientHeight])}));
     assert(!v.overflow,gameName+' overflow');assert(v.canvases.every(c=>c.every(x=>x>0)));
     if(gameName==='bomb'){
      const ratio=await page.evaluate(()=>hudLayer.width/hudLayer.height-W/Math.max(110,50+SAFE_T));assert(Math.abs(ratio)<.01);
     }
     r.rotations.push({game:gameName,width,height,ok:true});
    }
   }
  }
  assert.deepEqual(errors,[]);r.errors=errors;console.log(version,JSON.stringify(r));await context.close();
 }
 await browser.close();fs.writeFileSync(process.env.AUDIT_OUTPUT||path.join(os.tmpdir(),'studentgames-focused.json'),JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
