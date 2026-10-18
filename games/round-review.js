(function(){
  'use strict';
  const records=[];
  let active=null,disposeReview=null,getAudioContext=()=>null;
  const text=v=>String(v==null?'':v).trim();
  const html=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>text(v).toLocaleLowerCase();
  const styleURL=new URL('round-review.css',document.currentScript.src).href;
  function ensureStyle(){
    if(document.getElementById('sg-review-style'))return;
    const link=document.createElement('link');link.id='sg-review-style';link.rel='stylesheet';link.href=styleURL;document.head.appendChild(link);
  }
  ensureStyle();
  function pictureFor(answer){
    const current=window.GameData&&GameData.current(),payload=current&&current.payload;
    if(payload&&payload.builtin!==true)return '';
    const words=payload?payload.words:window.WORD_BANK?WORD_BANK.getWords():[];
    const word=words.find(w=>norm(w.word||w.en)===norm(answer));
    return word?text(word.emoji||word.icon):'';
  }
  function clean(item){
    item=item||{};
    const meaning=text(item.meaning||item.chinese),answer=text(item.answer||item.word);
    return {prompt:text(item.prompt||item.question),answer,meaning,emoji:text(item.emoji)||pictureFor(answer),chosen:text(item.chosen),kind:item.kind||(meaning?'word':'question'),status:item.status||'correct'};
  }
  function keyOf(rec){return rec.kind==='word'?'word:'+norm(rec.answer):'question:'+norm(rec.prompt)+'\u0000'+norm(rec.answer);}
  function summary(separateUnanswered){
    const grouped=new Map();
    records.forEach(rec=>{
      if(!rec.answer&&!rec.prompt)return;
      const key=keyOf(rec);
      if(!grouped.has(key))grouped.set(key,{key,rec,missed:false,missCount:0,answered:false,lastAnswer:null});
      const item=grouped.get(key);
      if(rec.status==='correct'||rec.status==='wrong'){item.answered=true;item.lastAnswer=rec.status;}
      if(rec.status!=='correct'&&(!separateUnanswered||rec.status==='wrong')){item.rec=rec;item.missed=true;item.missCount++;}
    });
    const items=[...grouped.values()],missed=items.filter(item=>item.missed),pending=separateUnanswered?items.filter(item=>!item.answered):[];
    const judged=items.length-pending.length,correct=judged-missed.length,ratio=judged?correct/judged:0;
    return {items,missed,pending,judged,correct,practice:missed.concat(pending),stars:ratio>=1?5:ratio>=.85?4:ratio>=.7?3:ratio>=.5?2:1};
  }
  function add(status,item,keepActive){
    const rec=clean({...active,...item,status});if(!rec.prompt&&!rec.answer)return;
    records.push(rec);if(!keepActive)active=null;
  }
  function shuffle(items){
    const out=items.slice();
    for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
    return out;
  }
  function reshuffle(items){
    for(let i=0;i<20;i++){const out=shuffle(items);if(out.every((v,n)=>v!==items[n]))return out;}
    return items.slice(1).concat(items[0]);
  }
  function planReview(info){
    // 先打散同次數的字，再優先挑本局錯得最多的；每局最多 6 個不同英文單字。
    const words=shuffle(info.practice.filter(item=>item.rec.kind==='word'&&item.rec.answer&&item.rec.meaning))
      .sort((a,b)=>b.missCount-a.missCount).slice(0,6)
      .map(item=>({key:item.key,word:item.rec.answer,meaning:item.rec.meaning,emoji:item.rec.emoji}));
    if(!words.length)return [];
    // 每次獨立抽玩法，與錯字數無關；超過 3 字只分批，維持同一種玩法。
    const kind=Math.random()<.5?'memory':'courier',mixed=shuffle(words),plan=[];
    for(let i=0;i<mixed.length;i+=3)plan.push({kind,words:mixed.slice(i,i+3)});
    return plan;
  }
  function reviewSpeech(){
    const synth=window.speechSynthesis,ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    let voices=[],generation=0,timer=null,heldContext=null,utterance=null;
    function loadVoices(){try{voices=synth?synth.getVoices():[];}catch(e){voices=[];}}
    loadVoices();if(synth)synth.addEventListener('voiceschanged',loadVoices);
    function restore(){
      clearTimeout(timer);timer=null;
      const ctx=heldContext;heldContext=null;
      if(ctx&&ctx.state!=='closed'){try{const p=ctx.resume();if(p&&p.catch)p.catch(()=>{});}catch(e){}}
    }
    function speak(word){
      if(!synth||!word)return;
      const token=++generation;clearTimeout(timer);
      try{
        if(synth.speaking||synth.pending)synth.cancel();
        const ctx=getAudioContext();
        if(ios&&ctx&&ctx.state==='running'){
          heldContext=ctx;const p=ctx.suspend();if(p&&p.catch)p.catch(()=>{});
        }
        const u=new SpeechSynthesisUtterance(text(word));utterance=u;
        const voice=voices.find(v=>/^en[-_]US/i.test(v.lang))||voices.find(v=>/^en/i.test(v.lang));
        if(voice)u.voice=voice;u.lang='en-US';u.rate=.82;
        const done=()=>{if(token!==generation)return;utterance=null;restore();};
        u.onend=done;u.onerror=done;
        // 首次呼叫來自「開始複習」的真實 button click；移動抵達時可接續唸字。
        synth.resume();synth.speak(u);timer=setTimeout(done,8000);
      }catch(e){utterance=null;restore();}
    }
    return {speak,dispose(){
      generation++;if(synth){synth.removeEventListener('voiceschanged',loadVoices);if(utterance&&(synth.speaking||synth.pending))synth.cancel();}
      utterance=null;restore();
    }};
  }
  function targetKey(word){return word.emoji?'picture:'+word.emoji:'meaning:'+norm(word.meaning);}
  function targetHTML(word){return word.emoji?'<span class="sg-word-picture" role="img" aria-label="'+html(word.meaning)+'">'+html(word.emoji)+'</span>':'<b>'+html(word.meaning)+'</b>';}
  function targetName(words){return words.some(w=>w.emoji)?'圖片':'中文';}
  function guide(steps){return '<ol class="sg-game-guide" aria-label="操作步驟">'+steps.map((step,i)=>'<li><span>'+(i+1)+'</span>'+step+'</li>').join('')+'</ol>';}
  const paths={
    leaf:'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 2 17 2c1.1 2 2 5.3 2 8a7 7 0 0 1-8 10ZM2 22l10-10',
    home:'m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
    box:'m3 7 9-4 9 4-9 4-9-4ZM3 7v10l9 4 9-4V7M12 11v10M7.5 5l9 4',
    check:'m5 12 4 4L19 6',
    lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4',
    mountain:'m2 20 7-14 5 9 3-5 5 10H2Z',
    power:'M12 2v10M6 5a9 9 0 1 0 12 0'
  };
  function icon(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';}
  function el(tag,cls,content){const node=document.createElement(tag);if(cls)node.className=cls;if(content!=null)node.textContent=content;return node;}
  function button(label,fn,secondary){
    const b=el('button','sg-review-action'+(secondary?' secondary':''),label);b.type='button';b.onclick=fn;return b;
  }
  function focus(node){if(node)node.focus({preventScroll:true});}
  function creatures(items){
    return items.map((item,i)=>'<div class="sg-pet-slot" data-pet="'+i+'"><div class="sg-pet-platform" aria-hidden="true"><div class="sg-creature"><span class="sg-eyes"></span><span class="sg-mouth"></span></div><div class="sg-cage"></div></div><span class="sg-pet-label">等你來救我</span></div>').join('');
  }
  function memoryGame(mount,words,onWin,previous,speak){
    let stopped=false,opened=[],matched=[],doneWords=new Set(),lastWord=null,heard=words[0].word;
    const n=words.length,deck=previous&&previous.deck?reshuffle(previous.deck):shuffle(Array.from({length:n*2},(_,i)=>i));
    const target=targetName(words);
    mount.innerHTML='<h3>翻牌救怪獸</h3><p class="sg-game-hint">英文配'+target+'，每配成一對就救出一隻小怪獸。</p>'+guide(['點一張卡片翻開，聽單字發音。','再翻一張，找出「英文 ＋ '+target+'」的一對。','配錯先看提示，再按「記住了」繼續找。'])+'<div class="sg-speech-actions"></div><div class="sg-pets" style="--pet-count:'+n+'">'+creatures(words)+'</div><div class="sg-memory-grid" style="--card-columns:'+Math.max(2,n)+'"></div><div class="sg-feedback" role="status" aria-live="polite" aria-atomic="true"></div><div class="sg-mini-actions"></div>';
    const grid=mount.querySelector('.sg-memory-grid'),feedback=mount.querySelector('.sg-feedback'),actions=mount.querySelector('.sg-mini-actions');
    mount.querySelector('.sg-speech-actions').appendChild(button('再聽一次單字',()=>speak(heard),true));
    deck.forEach((code,pos)=>{
      const word=words[code%n],b=el('button','sg-flip');b.type='button';
      b.innerHTML='<span class="sg-flip-inner" aria-hidden="true"><span class="sg-card-face sg-card-back"><span class="sg-card-number">'+(pos+1)+'</span>'+icon('leaf')+'</span><span class="sg-card-face sg-card-front">'+(code<n?'<b lang="en">'+html(word.word)+'</b>':targetHTML(word))+'<small>'+(code<n?'ENGLISH':word.emoji?'圖片':'中文意思')+'</small></span></span>';
      b.onclick=()=>{
        if(stopped||opened.length===2||opened.includes(pos)||matched.includes(pos))return;
        opened.push(pos);
        if(opened.length===2){
          const [a,b]=opened,ca=deck[a],cb=deck[b];
          if((ca<n)!==(cb<n)&&targetKey(words[ca%n])===targetKey(words[cb%n])){
            lastWord=ca<n?ca:cb;doneWords.add(lastWord);matched.push(a,b);opened=[];
          }else lastWord=null;
        }else lastWord=null;
        heard=lastWord!==null?words[lastWord].word:word.word;speak(heard);
        paint();
        focus(opened.length===2?actions.querySelector('button'):grid.querySelector('button:not(:disabled)'));
        if(doneWords.size===n){stopped=true;onWin();}
      };
      grid.appendChild(b);
    });
    function paint(){
      [...grid.children].forEach((b,pos)=>{
        const code=deck[pos],seen=opened.includes(pos)||matched.includes(pos);
        b.classList.toggle('is-open',seen);b.classList.toggle('is-matched',matched.includes(pos));
        b.disabled=stopped||opened.length===2||opened.includes(pos)||matched.includes(pos);
        b.setAttribute('aria-pressed',String(seen));
        b.setAttribute('aria-label','第 '+(pos+1)+' 張，'+(seen?(code<n?words[code].word:words[code%n].meaning)+(matched.includes(pos)?'，已配對':''):'蓋牌，點一下翻開'));
      });
      mount.querySelectorAll('[data-pet]').forEach(slot=>{
        const i=Number(slot.dataset.pet),freed=doneWords.has(i);slot.classList.toggle('is-free',freed);
        slot.querySelector('.sg-pet-label').textContent=freed?words[i].word+' 自由了！':'等你來救我';
      });
      actions.replaceChildren();feedback.classList.toggle('warning',opened.length===2);
      if(opened.length===2){
        feedback.replaceChildren(el('strong','','還沒配成一對，先記住這個！'));
        [...new Set(opened.map(pos=>deck[pos]%n))].forEach(i=>feedback.appendChild(el('div','',words[i].word+' ＝ '+words[i].meaning)));
        actions.appendChild(button('記住了，再找找',()=>{opened=[];paint();focus(grid.querySelector('button:not(:disabled)'));}));
      }else if(lastWord!==null){
        feedback.textContent='配對成功！'+words[lastWord].word+' ＝ '+words[lastWord].meaning+'。已救出 '+doneWords.size+' / '+n+' 隻。';
      }else if(opened.length){const code=deck[opened[0]];feedback.textContent='翻開了「'+(code<n?words[code].word:words[code%n].meaning)+'」，找到它的另一半。';}
      else feedback.textContent='先點一張卡片；一張英文 ＋ 一張正確'+target+'，就能配成一對。';
    }
    paint();focus(grid.querySelector('button'));
    return {deck,dispose(){stopped=true;}};
  }
  function courierGame(mount,words,wordPool,onWin,previous,speak){
    let stopped=false,timer=null,path=[],x=2,y=5,bridge=!!(previous&&previous.houses),carrying=null,delivered=new Set(),heard=words[0].word;
    const columns=[0,2,4],packages=previous&&previous.packages?reshuffle(previous.packages):shuffle(words.map((_,i)=>i)),directions={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
    const labels=[...new Map(words.map(w=>[targetKey(w),w])).values()],pictureMode=words.some(w=>w.emoji),target=targetName(words);
    // 干擾門牌不列入練習字；圖片題的干擾選項也使用圖片。
    const fallback=[['蘋果','🍎'],['天空','🌌'],['喝水','🥤'],['開心的','😊'],['房子','🏠'],['河流','🏞️']].map(([meaning,emoji])=>({meaning,emoji:pictureMode?emoji:''}));
    const candidates=shuffle(wordPool.filter(w=>!!w.emoji===pictureMode)).concat(fallback);
    for(const word of candidates){if(labels.length>=3)break;if(word.meaning&&!labels.some(v=>targetKey(v)===targetKey(word)))labels.push(word);}
    const houses=previous&&previous.houses?reshuffle(previous.houses):shuffle(labels.slice(0,3));
    mount.innerHTML='<h3>搬單字回家</h3><p class="sg-game-hint">點包裹拿起英文，送到掛著正確'+target+'的小屋。</p>'+guide(['點右下角黃色「開橋」，角色會自己走過去。','點下方英文包裹，拿起時聽單字發音。','點上方對應'+target+'的小屋，角色會過橋送達。'])+'<div class="sg-next-step" role="status" aria-live="polite"></div><div class="sg-speech-actions"></div><div class="sg-world"><div class="sg-tiles" role="group" aria-label="點地面移動角色"></div><div class="sg-actor" aria-hidden="true"><span class="sg-cargo"></span><div class="sg-creature sg-courier"><span class="sg-eyes"></span><span class="sg-mouth"></span></div></div></div><div class="sg-feedback" role="status" aria-live="polite" aria-atomic="true"></div><div class="sg-dpad" role="group" aria-label="移動角色"></div><p class="sg-game-hint">直接點格子即可移動，不用拖曳。也可以按下方方向鈕；電腦可用方向鍵。</p>';
    const tiles=mount.querySelector('.sg-tiles'),actor=mount.querySelector('.sg-actor'),feedback=mount.querySelector('.sg-feedback'),pad=mount.querySelector('.sg-dpad');
    mount.querySelector('.sg-speech-actions').appendChild(button('再聽一次單字',()=>speak(heard),true));
    let message=bridge?'小屋換位置了！拿起單字包裹，再找一次。':'先踩右下角的黃色開關，讓木橋出現。',warning=false;
    // 長片語／多義詞在地圖旁保留完整文字，觸控裝置不必靠 hover 才看得到。
    if(houses.some(v=>!v.emoji&&v.meaning.length>7)||words.some(w=>w.word.length>12)){
      const addresses=el('div','sg-addresses');
      houses.forEach((word,i)=>addresses.appendChild(button(String.fromCharCode(65+i)+' 小屋：'+(word.emoji||word.meaning),()=>walkTo(columns[i],0),true)));
      mount.querySelector('.sg-world').after(addresses);
    }
    function rock(cx,cy){return cy===3&&(cx===0||cx===4);}
    function house(cx,cy){return cy===0&&columns.includes(cx);}
    function parcel(cx,cy){
      if(cy!==4||!columns.includes(cx))return null;
      const i=packages[columns.indexOf(cx)];return i==null||delivered.has(i)||carrying===i?null:i;
    }
    function canWalk(cx,cy){return cx>=0&&cx<5&&cy>=0&&cy<6&&!rock(cx,cy)&&(cy!==2||(cx===2&&bridge));}
    function stopWalk(){if(timer!==null)clearTimeout(timer);timer=null;path=[];}
    function paint(){
      [...tiles.children].forEach((b,i)=>{
        const cx=i%5,cy=Math.floor(i/5);let cls='sg-tile'+((cx+cy)%2?' alt':''),key='grass',body='<span class="sg-grass"></span>',label='草地，第 '+(cy+1)+' 列第 '+(cx+1)+' 格';
        if(house(cx,cy)){
          const word=houses[columns.indexOf(cx)],done=[...delivered].some(j=>targetKey(words[j])===targetKey(word));
          key='house:'+targetKey(word)+done;body='<span class="sg-house'+(done?' delivered':'')+'"><span class="sg-house-code">'+String.fromCharCode(65+columns.indexOf(cx))+'</span>'+icon(done?'check':'home')+targetHTML(word)+'</span>';label=word.meaning+'的小屋，走到這裡送包裹';
        }else if(cy===2){
          key='river:'+cx+bridge;cls+=cx===2&&bridge?' is-bridge':' is-river';body=cx===2&&!bridge?icon('lock'):'';label=cx===2?(bridge?'木橋，可以過河':'橋還沒開，先踩黃色開關'):'河水，要從橋通過';
        }else if(rock(cx,cy)){key='rock';cls+=' is-rock';body=icon('mountain');label='石頭，要繞路';}
        else if(cx===4&&cy===5){key='switch:'+bridge;body='<span class="sg-switch">'+icon(bridge?'check':'power')+(bridge?'已開橋':'開橋')+'</span>';label='黃色開關，走到這裡開橋';}
        else{
          const word=parcel(cx,cy);
          if(word!==null){key='parcel:'+word;body='<span class="sg-package">'+icon('box')+'<b lang="en">'+html(words[word].word)+'</b></span>';label=words[word].word+'包裹，走到這裡拿起來';}
        }
        const suggested=!bridge?cx===4&&cy===5:carrying===null?parcel(cx,cy)!==null:house(cx,cy);
        b.className=cls+(suggested&&!stopped?' is-guide-target':'');b.disabled=stopped;b.setAttribute('aria-label',label+(cx===x&&cy===y?'，你在這裡':''));
        if(b.dataset.tile!==key){b.dataset.tile=key;b.innerHTML=body;}
      });
      actor.style.transform='translate('+(x*100)+'%,'+(y*100)+'%)';
      actor.querySelector('.sg-cargo').textContent=carrying===null?'':words[carrying].word;
      feedback.classList.toggle('warning',warning);
      const content=message+' 已送達 '+delivered.size+' / '+words.length+' 個。';
      if(feedback.textContent!==content)feedback.textContent=content;
      const step=!bridge?0:carrying===null?1:2;
      mount.querySelectorAll('.sg-game-guide li').forEach((li,i)=>{li.classList.toggle('is-current',i===step);if(i===step)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
      const nextStep=mount.querySelector('.sg-next-step'),instruction=stopped?'包裹全部送到了！':!bridge?'現在：點右下角「開橋」':carrying===null?'現在：點一個英文包裹拿起來':'正在搬 '+words[carrying].word+' → 點對應'+target+'的小屋';
      if(nextStep.textContent!==instruction)nextStep.textContent=instruction;
      [...pad.children].forEach(b=>b.disabled=stopped);
      mount.querySelectorAll('.sg-addresses button').forEach(b=>b.disabled=stopped);
    }
    function arrive(){
      warning=false;
      if(x===4&&y===5&&!bridge){bridge=true;message='木橋打開了！拿起包裹，送到正確小屋。';return;}
      const p=parcel(x,y);
      if(p!==null&&carrying===null){carrying=p;heard=words[p].word;speak(heard);message='拿起 '+heard+'！找出對應'+target+'的小屋。';return;}
      if(house(x,y)){
        if(carrying===null){message='先到下方拿一個單字包裹。';return;}
        const word=words[carrying],destination=houses[columns.indexOf(x)];
        if(targetKey(word)===targetKey(destination)){
          heard=word.word;speak(heard);
          delivered.add(carrying);carrying=null;message='送對了！'+word.word+' ＝ '+word.meaning+'。';
          if(delivered.size===words.length)stopped=true;
        }else{heard=word.word;speak(heard);message=word.word+' 是「'+word.meaning+'」，這間是「'+destination.meaning+'」。包裹還在身上，換一家試試。';warning=true;}
      }
    }
    function afterMove(){paint();if(stopped){stopWalk();onWin();}}
    function route(tx,ty){
      if(!canWalk(tx,ty))return null;
      const start=y*5+x,end=ty*5+tx,queue=[start],previous=new Map([[start,null]]);
      for(let i=0;i<queue.length;i++){
        const cell=queue[i];if(cell===end)break;
        for(const [dx,dy] of Object.values(directions)){
          const nx=cell%5+dx,ny=Math.floor(cell/5)+dy,next=ny*5+nx;
          if(!canWalk(nx,ny)||previous.has(next))continue;
          if(next!==end&&(house(nx,ny)||(carrying===null&&parcel(nx,ny)!==null)))continue;
          previous.set(next,cell);queue.push(next);
        }
      }
      if(!previous.has(end))return null;
      const result=[];for(let at=end;at!==start;at=previous.get(at))result.unshift(at);return result;
    }
    function tick(){
      timer=null;
      if(stopped||!mount.isConnected||document.hidden){stopWalk();return;}
      const cell=path.shift();if(cell==null)return;
      x=cell%5;y=Math.floor(cell/5);arrive();afterMove();
      if(path.length&&!stopped)timer=setTimeout(tick,190);
    }
    function walkTo(tx,ty){
      if(stopped)return;stopWalk();
      const next=route(tx,ty);
      if(next===null){warning=true;message=!bridge&&ty<=2?'橋還沒打開，先踩右下角黃色開關。':'這條路走不通，請繞過石頭、從橋上過河。';paint();return;}
      warning=false;
      if(!next.length){arrive();afterMove();return;}
      path=next;tick();
    }
    function step(dir){
      if(stopped||!directions[dir])return;stopWalk();
      const [dx,dy]=directions[dir],nx=x+dx,ny=y+dy;
      if(!canWalk(nx,ny)){warning=true;message=ny===2&&nx===2&&!bridge?'先踩黃色開關，橋才會出現。':'換個方向，河水和石頭不能直接走過。';paint();return;}
      x=nx;y=ny;arrive();afterMove();
    }
    for(let i=0;i<30;i++){const b=el('button');b.type='button';b.onclick=()=>walkTo(i%5,Math.floor(i/5));tiles.appendChild(b);}
    [['left','←','向左走'],['up','↑','向上走'],['down','↓','向下走'],['right','→','向右走']].forEach(([dir,symbol,label])=>{
      const b=el('button','sg-direction',symbol);b.type='button';b.setAttribute('aria-label',label);b.onclick=()=>step(dir);pad.appendChild(b);
    });
    paint();focus(pad.children[1]);
    return {houses,packages,pause:stopWalk,key(event){
      const dir={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',d:'right',w:'up',s:'down'}[event.key];
      if(!dir||event.ctrlKey||event.metaKey||event.altKey)return;
      event.preventDefault();step(dir);
    },dispose(){stopped=true;stopWalk();}};
  }
  function show(title,options){
    options=options||{};
    if(active)add('unanswered',{},false);
    if(disposeReview)disposeReview();
    ensureStyle();
    const info=summary(options.separateUnanswered),plan=planReview(info),selected=plan.flatMap(stage=>stage.words);
    const missedWords=info.practice.filter(item=>item.rec.kind==='word').length;
    const givenStars=Number(options.stars),stars=Number.isFinite(givenStars)?Math.max(1,Math.min(5,Math.round(givenStars))):info.stars;
    const previousFocus=document.activeElement,host=options.mount,modal=el('div',host?'sg-review-embedded':'sg-review-backdrop'),card=el('div','sg-review-card');
    modal.id='sg-review-modal';modal.lang='zh-Hant';modal.appendChild(card);
    if(!host){modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','sg-review-title');}
    let closed=false,game=null,completion=null,stageIndex=0,earned=info.items.length>0&&!info.practice.length;
    const speech=reviewSpeech();
    const passed=new Set();
    function dispose(){
      if(closed)return;closed=true;if(game)game.dispose();speech.dispose();modal.remove();document.removeEventListener('visibilitychange',onVisibility);
      if(disposeReview===dispose)disposeReview=null;
    }
    function finish(){
      if(closed)return;
      dispose();if(options.onComplete)options.onComplete();
      else if(previousFocus&&previousFocus.isConnected)focus(previousFocus);
    }
    function onVisibility(){if(document.hidden&&game&&game.pause)game.pause();}
    disposeReview=dispose;
    document.addEventListener('visibilitychange',onVisibility);
    // 讓真實按鈕正常 click，但不要讓複習手勢／空白鍵傳回底下的遊戲。
    ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchmove','touchend','click','keyup'].forEach(type=>modal.addEventListener(type,event=>event.stopPropagation(),{passive:true}));
    modal.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(!completion&&game&&game.key)game.key(event);
      if(event.key==='Tab'){
        const buttons=[...modal.querySelectorAll('button:not(:disabled),summary')].filter(b=>b.getClientRects().length);
        if(!buttons.length)return;
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();focus(last);}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();focus(first);}
      }
    });
    const heading=el('h2','',title||'本局學習回顧');heading.id='sg-review-title';card.appendChild(heading);if(host)heading.hidden=true;
    const lead=el('p','sg-review-lead',options.lead||'把剛剛卡住的單字，再挑戰一次。');card.appendChild(lead);
    if(options.separateUnanswered)card.appendChild(el('p','sg-game-hint','已作答 '+info.judged+' 字 · 曾判讀錯誤 '+info.missed.length+' 字 · 未完成 '+info.pending.length+' 字。射偏、超時與未完成不列入判讀評分。'));
    const rating=el('div','sg-review-rating');card.appendChild(rating);
    function updateRating(){
      rating.replaceChildren();
      if(options.separateUnanswered&&!info.judged){
        rating.appendChild(el('span','sg-review-rating-label','尚無可評分的英文作答'));
        if(earned)rating.appendChild(el('span','sg-learning-earned','★ 複習完成星'));
        return;
      }
      const starText=el('span','sg-review-stars','★'.repeat(stars)+'☆'.repeat(5-stars));starText.setAttribute('aria-label','本局評分 '+stars+' / 5');
      rating.append(starText,el('span','sg-review-rating-label',(options.separateUnanswered?'英文判讀評分 ':'本局評分 ')+stars+' / 5'));
      if(earned)rating.appendChild(el('span','sg-learning-earned',info.practice.length?'★ 複習完成星':'★ 全對學習星'));
    }
    updateRating();
    const stageHost=el('section','sg-stage-host'),stageActions=el('div','sg-stage-actions');
    card.append(stageHost,stageActions);
    const missedDetails=el('details','sg-review-details');
    if(info.practice.length){
      missedDetails.appendChild(el('summary','',(options.separateUnanswered?'判讀錯誤與未完成':'本局錯字與錯題')+'（'+info.practice.length+'）'));
      const list=el('ul');
      info.practice.forEach(item=>{
        const li=el('li'),rec=item.rec;li.appendChild(el('strong','',rec.answer));
        li.appendChild(el('span','',rec.kind==='word'?rec.meaning:rec.prompt));
        if(options.separateUnanswered){li.dataset.reviewKey=item.key;li.appendChild(el('small','sg-result-note',item.missed?(item.lastAnswer==='correct'?'曾答錯，後來已答對':'判讀錯誤'):'未完成，還沒確認會不會'));}
        list.appendChild(li);
      });
      missedDetails.appendChild(list);card.appendChild(missedDetails);
    }
    function overview(){
      stageHost.replaceChildren();stageActions.replaceChildren();
      if(!plan.length){
        const note=!info.items.length?'這局沒有出現單字題。':!info.practice.length?'這局全部答對，直接收下全對學習星！':options.separateUnanswered?'這局沒有可練習的單字；其他錯題與未完成題目可展開回顧。':'這局沒有需要練習的單字；其他錯題可展開回顧。';
        showCompletion(earned?'全部答對！':'本局回顧',note,options.completeLabel||'確認，查看成績',finish);return;
      }
      stageHost.appendChild(el('h3','','這次先追回 '+selected.length+' 個單字'));
      stageHost.appendChild(el('p','sg-game-hint',(missedWords>6?'本局有 '+missedWords+' 個'+(options.separateUnanswered?'待複習單字':'錯字')+'，這次先練 6 個。':'')+'每次隨機抽一種玩法；這次分 '+plan.length+' 批，不倒數、不扣分。'));
      const chips=el('div','sg-word-chips');selected.forEach(word=>chips.appendChild(el('span','',word.word)));stageHost.appendChild(chips);
      const route=el('p','sg-review-route','這次抽到：'+(plan[0].kind==='memory'?'翻牌救怪獸':'搬單字回家'));stageHost.appendChild(route);
      if(selected.some(w=>w.emoji))stageHost.appendChild(el('p','sg-game-hint','內建圖卡：英文配圖片；沒有圖片的字會顯示中文。'));
      stageActions.append(button('開始複習',startStage),button('這次先休息，查看成績',finish,true));focus(stageActions.firstChild);
    }
    function nextStage(){if(stageIndex+1<plan.length){stageIndex++;startStage();}else complete();}
    function startStage(){
      const previous=passed.has(stageIndex)?game:null;
      if(completion){completion.remove();completion=null;}card.hidden=false;
      if(game)game.dispose();game=null;stageHost.replaceChildren();stageActions.replaceChildren();
      card.scrollTop=0;if(host&&host.parentElement)host.parentElement.scrollTop=0;
      const stage=plan[stageIndex];
      const progress=el('p','sg-review-progress','第 '+(stageIndex+1)+' / '+plan.length+' 批 · 這批 '+stage.words.length+' 個字');
      const board=el('div','sg-mini-game');stageHost.append(progress,board);
      const skip=button(passed.has(stageIndex)?'結束重玩，繼續':'先休息，查看成績',passed.has(stageIndex)?nextStage:finish,true);stageActions.appendChild(skip);
      const onWin=()=>{
        if(closed)return;
        passed.add(stageIndex);
        if(options.separateUnanswered)missedDetails.querySelectorAll('[data-review-key]').forEach(li=>{if(stage.words.some(w=>w.key===li.dataset.reviewKey))li.querySelector('.sg-result-note').textContent='已補答成功';});
        stageActions.replaceChildren();
        if(stageIndex+1<plan.length)showCompletion('這批複習完成！','已練完 '+stage.words.length+' 個單字，接著複習剩下的字。','確認，繼續下一批',nextStage,true);
        else complete();
      };
      speech.speak(stage.words[0].word);
      game=stage.kind==='memory'?memoryGame(board,stage.words,onWin,previous,speech.speak):courierGame(board,stage.words,info.items.filter(item=>item.rec.kind==='word').map(item=>item.rec),onWin,previous,speech.speak);
    }
    function showCompletion(title,note,label,confirm,replay){
      if(completion)completion.remove();
      completion=el('div','sg-completion-layer');
      const panel=el('section','sg-completion-card');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','sg-completion-title');panel.setAttribute('aria-describedby','sg-completion-note');
      const mark=el('div','sg-completion-mark');mark.innerHTML=icon('check');mark.setAttribute('aria-hidden','true');
      const titleNode=el('h3','',title);titleNode.id='sg-completion-title';
      const noteNode=el('p','sg-game-hint',note);noteNode.id='sg-completion-note';
      const actions=el('div','sg-stage-actions'),done=button(label,confirm);
      actions.appendChild(done);if(replay)actions.appendChild(button('重新洗牌，再玩一次（選玩）',startStage,true));
      panel.append(mark,titleNode,noteNode,rating.cloneNode(true));
      if(!plan.length&&info.practice.length)panel.appendChild(missedDetails.cloneNode(true));
      panel.appendChild(actions);completion.appendChild(panel);modal.appendChild(completion);
      card.hidden=true;focus(done);
    }
    function complete(){
      earned=true;updateRating();
      showCompletion('複習完成！','這次的 '+selected.length+' 個單字都練過了，獲得一顆複習完成星！',options.completeLabel||'確認，收下完成星',finish,true);
    }
    if(host)host.replaceChildren(modal);else document.body.appendChild(modal);
    overview();
  }
  window.RoundReview={
    setAudioContext(getter){getAudioContext=getter;},
    reset(){records.length=0;active=null;if(disposeReview)disposeReview();},
    begin(item){active=clean(item);},
    correct(item){add('correct',item,false);},
    wrong(item){add('wrong',item,true);},
    unanswered(item){add('unanswered',item,false);},
    endQuestion(){active=null;},
    show,
    get records(){return records.slice();}
  };
})();
