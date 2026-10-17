// Opt-in eight-target house-label layout regression; pictures and long words on touch screens.
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const result=[];
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),p=await b.newPage({viewport:{width:844,height:390},hasTouch:true});await p.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/games/gun.html');await p.locator('#startBtn').click();await p.evaluate(()=>{playing=false;camera.position.set(0,3,70);camera.rotation.set(.07,0,0)});
for(const [width,height] of [[667,375],[844,390],[1024,768]]){
 await p.setViewportSize({width,height});await p.waitForTimeout(300);
 for(const picture of [false,true]){
 const boxes=await p.evaluate(picture=>{HOUSES.forEach((h,i)=>setHouseLabel(h,picture?['🍎','🚗','🐶','🌳','🏠','🥐','🍌','🚒'][i]:['backpack','mountain','hospital','strawberry','classroom','restaurant','pineapple','playground'][i],picture));updateHouseLabelSizes();renderer.render(scene,camera);const projection=innerHeight*camera.projectionMatrix.elements[5]/2;return HOUSES.map(h=>{const s=h.label,p=s.position.clone().applyMatrix4(camera.matrixWorldInverse),depth=-p.z,w=s.scale.x*projection/depth,hgt=s.scale.y*projection/depth,x=innerWidth/2+p.x*projection/depth,y=innerHeight/2-p.y*projection/depth+s.center.y*hgt;return {left:x-s.center.x*w,right:x+(1-s.center.x)*w,top:y-hgt,bottom:y};}).filter(r=>r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight)},picture);
 const overlaps=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],c=boxes[j];if(a.left<c.right-1&&a.right>c.left+1&&a.top<c.bottom-1&&a.bottom>c.top+1)overlaps.push([i,j])}
 const sample={width,height,picture,visible:boxes.length,overlaps};result.push(sample);console.log(sample);assert.equal(overlaps.length,0);if(width===844&&!picture)await p.screenshot({path:path.join(os.tmpdir(),'sg-gun-words.png')});
 }
}await b.close();fs.writeFileSync(process.env.AUDIT_OUTPUT||path.join(os.tmpdir(),'studentgames-label-layout.json'),JSON.stringify(result,null,2));})().catch(e=>{console.error(e);process.exit(1)});
