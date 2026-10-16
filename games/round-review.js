(function(){
  'use strict';
  const records=[];
  let active=null,disposeReview=null;
  const text=v=>String(v==null?'':v).trim();
  const html=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>text(v).toLocaleLowerCase();
  const styleURL=new URL('round-review.css',document.currentScript.src).href;
  function ensureStyle(){
    if(document.getElementById('sg-review-style'))return;
    const link=document.createElement('link');link.id='sg-review-style';link.rel='stylesheet';link.href=styleURL;document.head.appendChild(link);
  }
  ensureStyle();
  function clean(item){
    item=item||{};
    const meaning=text(item.meaning||item.chinese);
    return {prompt:text(item.prompt||item.question),answer:text(item.answer||item.word),meaning,chosen:text(item.chosen),kind:item.kind||(meaning?'word':'question'),status:item.status||'correct'};
  }
  function keyOf(rec){return rec.kind==='word'?'word:'+norm(rec.answer):'question:'+norm(rec.prompt)+'\u0000'+norm(rec.answer);}
  function summary(){
    const grouped=new Map();
    records.forEach(rec=>{
      if(!rec.answer&&!rec.prompt)return;
      const key=keyOf(rec);
      if(!grouped.has(key))grouped.set(key,{key,rec,missed:false,missCount:0});
      const item=grouped.get(key);
      if(rec.status!=='correct'){item.rec=rec;item.missed=true;item.missCount++;}
    });
    const items=[...grouped.values()],missed=items.filter(item=>item.missed),correct=items.length-missed.length;
    const ratio=items.length?correct/items.length:0;
    return {items,missed,correct,stars:ratio>=1?5:ratio>=.85?4:ratio>=.7?3:ratio>=.5?2:1};
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
    const words=shuffle(info.missed.filter(item=>item.rec.kind==='word'&&item.rec.answer&&item.rec.meaning))
      .sort((a,b)=>b.missCount-a.missCount).slice(0,6)
      .map(item=>({key:item.key,word:item.rec.answer,meaning:item.rec.meaning}));
    if(!words.length)return [];
    if(words.length===1)return [{kind:'courier',words}];
    if(words.length<=3)return [{kind:Math.random()<.5?'memory':'courier',words}];
    const mixed=shuffle(words),cut=Math.ceil(mixed.length/2),kinds=shuffle(['memory','courier']);
    return [{kind:kinds[0],words:mixed.slice(0,cut)},{kind:kinds[1],words:mixed.slice(cut)}];
  }
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
  function memoryGame(mount,words,onWin,previous){
    let stopped=false,opened=[],matched=[],doneWords=new Set(),lastWord=null;
    const n=words.length,deck=previous&&previous.deck?reshuffle(previous.deck):shuffle(Array.from({length:n*2},(_,i)=>i));
    mount.innerHTML='<h3>翻牌救怪獸</h3><p class="sg-game-hint">翻出英文和中文，救出森林小隊。</p><div class="sg-pets" style="--pet-count:'+n+'">'+creatures(words)+'</div><div class="sg-memory-grid" style="--card-columns:'+n+'"></div><div class="sg-feedback" role="status" aria-live="polite" aria-atomic="true"></div><div class="sg-mini-actions"></div>';
    const grid=mount.querySelector('.sg-memory-grid'),feedback=mount.querySelector('.sg-feedback'),actions=mount.querySelector('.sg-mini-actions');
    deck.forEach((code,pos)=>{
      const word=words[code%n],b=el('button','sg-flip');b.type='button';
      b.innerHTML='<span class="sg-flip-inner" aria-hidden="true"><span class="sg-card-face sg-card-back"><span class="sg-card-number">'+(pos+1)+'</span>'+icon('leaf')+'</span><span class="sg-card-face sg-card-front"><b'+(code<n?' lang="en"':'')+'>'+html(code<n?word.word:word.meaning)+'</b><small>'+(code<n?'ENGLISH':'中文意思')+'</small></span></span>';
      b.onclick=()=>{
        if(stopped||opened.length===2||opened.includes(pos)||matched.includes(pos))return;
        opened.push(pos);
        if(opened.length===2){
          const [a,b]=opened,ca=deck[a],cb=deck[b];
          if((ca<n)!==(cb<n)&&norm(words[ca%n].meaning)===norm(words[cb%n].meaning)){
            lastWord=ca<n?ca:cb;doneWords.add(lastWord);matched.push(a,b);opened=[];
          }else lastWord=null;
        }else lastWord=null;
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
      else feedback.textContent='一張英文 ＋ 一張正確中文，就能配成一對。';
    }
    paint();focus(grid.querySelector('button'));
    return {deck,dispose(){stopped=true;}};
  }
  function courierGame(mount,words,meaningPool,onWin,previous){
    let stopped=false,timer=null,path=[],x=2,y=5,bridge=!!(previous&&previous.houses),carrying=null,delivered=new Set();
    const columns=[0,2,4],packages=previous&&previous.packages?reshuffle(previous.packages):shuffle(words.map((_,i)=>i)),directions={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
    const labels=[...new Set(words.map(w=>w.meaning))];
    // 干擾門牌不是額外練習字；只有一個錯字時仍能辨認正確意思。
    const candidates=shuffle(meaningPool).concat(['蘋果','天空','喝水','開心的','房子','河流']);
    for(const meaning of candidates){if(labels.length>=3)break;if(meaning&&!labels.some(v=>norm(v)===norm(meaning)))labels.push(meaning);}
    const houses=previous&&previous.houses?reshuffle(previous.houses):shuffle(labels.slice(0,3));
    mount.innerHTML='<h3>搬單字回家</h3><p class="sg-game-hint">拿起單字包裹，送到正確的中文小屋。</p><div class="sg-world"><div class="sg-tiles" role="group" aria-label="點地面移動角色"></div><div class="sg-actor" aria-hidden="true"><span class="sg-cargo"></span><div class="sg-creature sg-courier"><span class="sg-eyes"></span><span class="sg-mouth"></span></div></div></div><div class="sg-feedback" role="status" aria-live="polite" aria-atomic="true"></div><div class="sg-dpad" role="group" aria-label="移動角色"></div><p class="sg-game-hint">點地面、包裹或小屋也能移動；電腦可用方向鍵。</p>';
    const tiles=mount.querySelector('.sg-tiles'),actor=mount.querySelector('.sg-actor'),feedback=mount.querySelector('.sg-feedback'),pad=mount.querySelector('.sg-dpad');
    let message=bridge?'小屋換位置了！拿起單字包裹，再找一次。':'先踩右下角的黃色開關，讓木橋出現。',warning=false;
    // 長片語／多義詞在地圖旁保留完整文字，觸控裝置不必靠 hover 才看得到。
    if(houses.some(v=>v.length>7)||words.some(w=>w.word.length>12)){
      const addresses=el('div','sg-addresses');
      houses.forEach((meaning,i)=>addresses.appendChild(button(String.fromCharCode(65+i)+' 小屋：'+meaning,()=>walkTo(columns[i],0),true)));
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
          const meaning=houses[columns.indexOf(cx)],done=[...delivered].some(j=>norm(words[j].meaning)===norm(meaning));
          key='house:'+meaning+done;body='<span class="sg-house'+(done?' delivered':'')+'"><span class="sg-house-code">'+String.fromCharCode(65+columns.indexOf(cx))+'</span>'+icon(done?'check':'home')+'<b>'+html(meaning)+'</b></span>';label=meaning+'的小屋，走到這裡送包裹';
        }else if(cy===2){
          key='river:'+cx+bridge;cls+=cx===2&&bridge?' is-bridge':' is-river';body=cx===2&&!bridge?icon('lock'):'';label=cx===2?(bridge?'木橋，可以過河':'橋還沒開，先踩黃色開關'):'河水，要從橋通過';
        }else if(rock(cx,cy)){key='rock';cls+=' is-rock';body=icon('mountain');label='石頭，要繞路';}
        else if(cx===4&&cy===5){key='switch:'+bridge;body='<span class="sg-switch">'+icon(bridge?'check':'power')+(bridge?'已開橋':'開橋')+'</span>';label='黃色開關，走到這裡開橋';}
        else{
          const word=parcel(cx,cy);
          if(word!==null){key='parcel:'+word;body='<span class="sg-package">'+icon('box')+'<b lang="en">'+html(words[word].word)+'</b></span>';label=words[word].word+'包裹，走到這裡拿起來';}
        }
        b.className=cls;b.disabled=stopped;b.setAttribute('aria-label',label+(cx===x&&cy===y?'，你在這裡':''));
        if(b.dataset.tile!==key){b.dataset.tile=key;b.innerHTML=body;}
      });
      actor.style.transform='translate('+(x*100)+'%,'+(y*100)+'%)';
      actor.querySelector('.sg-cargo').textContent=carrying===null?'':words[carrying].word;
      feedback.classList.toggle('warning',warning);
      const content=message+' 已送達 '+delivered.size+' / '+words.length+' 個。';
      if(feedback.textContent!==content)feedback.textContent=content;
      [...pad.children].forEach(b=>b.disabled=stopped);
      mount.querySelectorAll('.sg-addresses button').forEach(b=>b.disabled=stopped);
    }
    function arrive(){
      warning=false;
      if(x===4&&y===5&&!bridge){bridge=true;message='木橋打開了！拿起包裹，送到正確小屋。';return;}
      const p=parcel(x,y);
      if(p!==null&&carrying===null){carrying=p;message='正在搬 '+words[p].word+'。它是什麼意思？';return;}
      if(house(x,y)){
        if(carrying===null){message='先到下方拿一個單字包裹。';return;}
        const word=words[carrying],meaning=houses[columns.indexOf(x)];
        if(norm(word.meaning)===norm(meaning)){
          delivered.add(carrying);carrying=null;message='送對了！'+word.word+' ＝ '+word.meaning+'。';
          if(delivered.size===words.length)stopped=true;
        }else{message=word.word+' 是「'+word.meaning+'」，這間是「'+meaning+'」。包裹還在身上，換一家試試。';warning=true;}
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
    const info=summary(),plan=planReview(info),selected=plan.flatMap(stage=>stage.words);
    const missedWords=info.missed.filter(item=>item.rec.kind==='word').length;
    const givenStars=Number(options.stars),stars=Number.isFinite(givenStars)?Math.max(1,Math.min(5,Math.round(givenStars))):info.stars;
    const previousFocus=document.activeElement,host=options.mount,modal=el('div',host?'sg-review-embedded':'sg-review-backdrop'),card=el('div','sg-review-card');
    modal.id='sg-review-modal';modal.lang='zh-Hant';modal.appendChild(card);
    if(!host){modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','sg-review-title');}
    let closed=false,game=null,stageIndex=0,earned=info.items.length>0&&!info.missed.length;
    const passed=new Set();
    function dispose(){
      if(closed)return;closed=true;if(game)game.dispose();modal.remove();document.removeEventListener('visibilitychange',onVisibility);
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
      if(game&&game.key)game.key(event);
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
    const rating=el('div','sg-review-rating');card.appendChild(rating);
    function updateRating(){
      rating.replaceChildren();
      const starText=el('span','sg-review-stars','★'.repeat(stars)+'☆'.repeat(5-stars));starText.setAttribute('aria-label','本局評分 '+stars+' / 5');
      rating.append(starText,el('span','sg-review-rating-label','本局評分 '+stars+' / 5'));
      if(earned)rating.appendChild(el('span','sg-learning-earned',info.missed.length?'★ 複習完成星':'★ 全對學習星'));
    }
    updateRating();
    const stageHost=el('section','sg-stage-host'),stageActions=el('div','sg-stage-actions');
    card.append(stageHost,stageActions);
    const missedDetails=el('details','sg-review-details');
    if(info.missed.length){
      missedDetails.appendChild(el('summary','','本局錯字與錯題（'+info.missed.length+'）'));
      const list=el('ul');
      info.missed.forEach(item=>{
        const li=el('li'),rec=item.rec;li.appendChild(el('strong','',rec.answer));
        li.appendChild(el('span','',rec.kind==='word'?rec.meaning:rec.prompt));list.appendChild(li);
      });
      missedDetails.appendChild(list);card.appendChild(missedDetails);
    }
    function overview(){
      stageHost.replaceChildren();stageActions.replaceChildren();
      if(!plan.length){
        const note=!info.items.length?'這局沒有出現單字題。':!info.missed.length?'這局全部答對，直接收下全對學習星！':'這局沒有需要練習的單字；其他錯題可展開回顧。';
        stageHost.appendChild(el('p','sg-review-perfect',note));
        const done=button(options.completeLabel||'查看成績，繼續',finish);stageActions.appendChild(done);focus(done);return;
      }
      stageHost.appendChild(el('h3','','這次先追回 '+selected.length+' 個單字'));
      stageHost.appendChild(el('p','sg-game-hint',missedWords>6?'本局有 '+missedWords+' 個錯字，只選其中 6 個；完成這次安排就結束。':'共 '+plan.length+' 個小關卡，不倒數、不扣分。'));
      const chips=el('div','sg-word-chips');selected.forEach(word=>chips.appendChild(el('span','',word.word)));stageHost.appendChild(chips);
      const route=el('p','sg-review-route',plan.map(s=>s.kind==='memory'?'翻牌救怪獸':'搬單字回家').join(' → '));stageHost.appendChild(route);
      stageActions.append(button('開始複習',startStage),button('這次先休息，查看成績',finish,true));focus(stageActions.firstChild);
    }
    function nextStage(){if(stageIndex+1<plan.length){stageIndex++;startStage();}else complete();}
    function startStage(){
      const previous=passed.has(stageIndex)?game:null;
      if(game)game.dispose();game=null;stageHost.replaceChildren();stageActions.replaceChildren();
      card.scrollTop=0;if(host&&host.parentElement)host.parentElement.scrollTop=0;
      const stage=plan[stageIndex];
      const progress=el('p','sg-review-progress','第 '+(stageIndex+1)+' / '+plan.length+' 關 · 這關 '+stage.words.length+' 個字');
      const board=el('div','sg-mini-game');stageHost.append(progress,board);
      const skip=button(passed.has(stageIndex)?'結束重玩，繼續':'先休息，查看成績',passed.has(stageIndex)?nextStage:finish,true);stageActions.appendChild(skip);
      const onWin=()=>{
        if(closed)return;
        passed.add(stageIndex);
        stageActions.replaceChildren(
          button(stageIndex+1<plan.length?'救援成功，前往下一關':'完成這次複習',nextStage),
          button('重新洗牌，再玩一次（選玩）',startStage,true)
        );
        focus(stageActions.firstChild);
      };
      game=stage.kind==='memory'?memoryGame(board,stage.words,onWin,previous):courierGame(board,stage.words,info.items.map(item=>item.rec.meaning).filter(Boolean),onWin,previous);
    }
    function complete(){
      if(game)game.dispose();game=null;earned=true;updateRating();stageHost.replaceChildren();stageActions.replaceChildren();
      card.scrollTop=0;if(host&&host.parentElement)host.parentElement.scrollTop=0;
      stageHost.appendChild(el('h3','','這次的 '+selected.length+' 個單字，都練過了！'));
      const list=el('ul','sg-finished-words');selected.forEach(word=>list.appendChild(el('li','',word.word+' ＝ '+word.meaning)));stageHost.appendChild(list);
      stageHost.appendChild(el('p','sg-game-hint','下次再遇到，試著自己想起來。'));
      stageActions.appendChild(button(options.completeLabel||'收下完成星，查看成績',finish));focus(stageActions.firstChild);
    }
    if(host)host.replaceChildren(modal);else document.body.appendChild(modal);
    overview();
  }
  window.RoundReview={
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
