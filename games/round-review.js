(function(){
  'use strict';
  const records=[];
  let active=null;
  const esc=v=>String(v==null?'':v);
  function clean(item){
    item=item||{};
    return {
      prompt:esc(item.prompt||item.question||''),
      answer:esc(item.answer||item.word||''),
      meaning:esc(item.meaning||item.chinese||''),
      chosen:esc(item.chosen||''),
      status:item.status||'correct'
    };
  }
  function keyOf(rec){return (rec.answer||rec.prompt).trim().toLocaleLowerCase()+'\u0000'+(rec.meaning||rec.prompt).trim().toLocaleLowerCase();}
  function summary(){
    const grouped=new Map();
    records.forEach(rec=>{
      const key=keyOf(rec);if(!key.trim())return;
      if(!grouped.has(key))grouped.set(key,{rec,missed:false});
      if(rec.status!=='correct')grouped.get(key).missed=true;
    });
    const items=[...grouped.values()];
    const missed=items.filter(item=>item.missed);
    const correct=items.length-missed.length;
    const ratio=items.length?correct/items.length:0;
    const stars=ratio>=1?5:ratio>=.85?4:ratio>=.7?3:ratio>=.5?2:1;
    return {items,missed,correct,stars};
  }
  function ensureStyle(){
    if(document.getElementById('sg-review-style'))return;
    const style=document.createElement('style');style.id='sg-review-style';style.textContent=`
      .sg-review-backdrop{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:rgba(3,8,20,.88);backdrop-filter:blur(8px);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f8fafc;overscroll-behavior:contain}
      .sg-review-card{width:min(720px,96vw);max-height:min(92vh,850px);max-height:min(92dvh,850px);overflow:auto;border:2px solid rgba(255,255,255,.2);border-radius:24px;background:linear-gradient(160deg,#172554,#0f172a 48%,#111827);box-shadow:0 25px 80px rgba(0,0,0,.65),0 0 45px rgba(59,130,246,.2);padding:clamp(18px,4vw,30px)}
      .sg-review-card h2{margin:0;text-align:center;font-size:clamp(25px,5.5vw,40px);line-height:1.15;color:#fff}.sg-review-lead{text-align:center;color:#cbd5e1;margin:8px 0 16px;font-weight:750}
      .sg-review-rating{border:2px solid rgba(250,204,21,.42);border-radius:20px;padding:15px 12px;background:rgba(120,53,15,.22);text-align:center}.sg-review-rating-label{font-weight:900;color:#fde68a}.sg-review-stars{display:flex;justify-content:center;align-items:center;gap:clamp(5px,2vw,12px);margin:7px 0 5px;font-size:clamp(32px,8.5vw,52px);line-height:1}.sg-review-star{color:#475569;text-shadow:none}.sg-review-star.on{color:#facc15;text-shadow:0 0 15px rgba(250,204,21,.72)}.sg-review-star.learning{position:relative;margin-right:clamp(7px,2vw,13px);color:#9a3412;text-shadow:0 0 10px rgba(251,146,60,.14)}.sg-review-star.learning:after{content:"";position:absolute;top:5%;right:calc(clamp(7px,2vw,13px) * -1);width:2px;height:90%;border-radius:2px;background:rgba(255,255,255,.2)}.sg-review-star.learning.earned{color:#fb923c;text-shadow:0 0 18px rgba(251,146,60,.95);animation:sgStarBurst .4s cubic-bezier(.2,1.55,.4,1)}.sg-review-rating-text{font-weight:900;color:#fff}.sg-review-rating-text .learning-state{color:#fdba74}
      .sg-review-progress{text-align:center;margin:18px 0 10px;font-weight:900;color:#e2e8f0}.sg-review-progress b{color:#fde047}.sg-review-deck{position:relative;width:min(360px,88vw);height:220px;margin:0 auto;perspective:1000px;transition:transform .38s ease-in,opacity .38s ease-in}.sg-review-deck:before,.sg-review-deck:after{content:"";position:absolute;inset:7px -7px -7px 7px;border-radius:20px;background:#334155;border:2px solid rgba(255,255,255,.18);z-index:-1}.sg-review-deck:after{inset:14px -14px -14px 14px;background:#1e293b;z-index:-2}
      .sg-review-flip{display:block;width:100%;height:100%;padding:0;border:0;border-radius:20px;background:transparent;color:inherit;font:inherit;cursor:pointer;touch-action:manipulation;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;transition:transform .4s cubic-bezier(.2,.75,.25,1),filter .1s ease;box-shadow:0 16px 42px rgba(0,0,0,.42)}.sg-review-flip:active{filter:brightness(.9)}.sg-review-flip:focus-visible{outline:4px solid #67e8f9;outline-offset:5px}.sg-review-flip.flipped{transform:rotateY(180deg);-webkit-transform:rotateY(180deg)}
      .sg-review-face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;border-radius:20px;backface-visibility:hidden;-webkit-backface-visibility:hidden;border:3px solid}.sg-review-front{background:linear-gradient(145deg,#1d4ed8,#312e81);border-color:#93c5fd}.sg-review-back{transform:rotateY(180deg);-webkit-transform:rotateY(180deg);background:linear-gradient(145deg,#065f46,#064e3b);border-color:#6ee7b7}.sg-review-kicker{font-size:14px;font-weight:900;letter-spacing:.04em;color:#bfdbfe}.sg-review-back .sg-review-kicker{color:#a7f3d0}.sg-review-word{max-width:100%;margin:12px 0;font-size:clamp(28px,8vw,46px);line-height:1.05;font-weight:950;overflow-wrap:anywhere;color:#fff}.sg-review-meaning{font-size:clamp(22px,6vw,34px);line-height:1.15;font-weight:950;color:#fff;overflow-wrap:anywhere}.sg-review-hint{font-size:15px;font-weight:850;color:#dbeafe}.sg-review-confirmed{margin-top:12px;color:#a7f3d0;font-weight:900}
      .sg-review-deck.collecting{transform:scale(.15) rotate(15deg);opacity:0}.sg-review-flying-star{position:fixed;z-index:100002;left:0;top:0;color:#fb923c;font-size:52px;line-height:1;pointer-events:none;text-shadow:0 0 20px rgba(251,146,60,.95);transform:translate(-50%,-50%) scale(.55) rotate(-25deg);transition:transform .4s ease-in}.sg-review-flying-star.go{transform:translate(calc(-50% + var(--sg-fly-x)),calc(-50% + var(--sg-fly-y))) scale(1) rotate(0)}.sg-review-perfect{margin:18px 0 0;padding:18px;border:2px solid #22c55e;border-radius:18px;text-align:center;background:rgba(20,83,45,.38);font-size:clamp(18px,4vw,23px);font-weight:900;color:#bbf7d0}.sg-review-total{text-align:center;margin:13px 0 0;color:#fde68a;font-weight:900}.sg-review-action{display:block;width:min(390px,100%);min-height:52px;margin:18px auto 0;padding:13px 20px;border:0;border-radius:999px;background:linear-gradient(#fde047,#f59e0b);color:#422006;font:900 18px system-ui;cursor:pointer;box-shadow:0 8px 24px rgba(245,158,11,.28);touch-action:manipulation;transition:filter .1s ease}.sg-review-action:active{filter:brightness(.9)}.sg-review-action:disabled{cursor:wait;filter:saturate(.65);opacity:.8}.sg-review-action:focus-visible{outline:4px solid #67e8f9;outline-offset:4px}
      @keyframes sgStarBurst{0%{transform:scale(0) rotate(-40deg)}70%{transform:scale(1.35) rotate(8deg)}100%{transform:scale(1) rotate(0)}}
      @media(max-width:520px){.sg-review-backdrop{padding:max(7px,env(safe-area-inset-top)) max(7px,env(safe-area-inset-right)) max(7px,env(safe-area-inset-bottom)) max(7px,env(safe-area-inset-left))}.sg-review-card{max-height:96vh;max-height:96dvh;border-radius:18px;padding:15px 11px}.sg-review-deck{height:205px}.sg-review-stars{gap:2px}.sg-review-rating{padding:12px 6px}}
      @media(prefers-reduced-motion:reduce){.sg-review-flip,.sg-review-deck{transition:none}.sg-review-star.learning.earned{animation:none}.sg-review-deck.collecting,.sg-review-flying-star{display:none}}
    `;document.head.appendChild(style);
  }
  function add(status,item,keepActive){
    const rec=clean({...active,...item,status});
    if(!rec.prompt&&!rec.answer)return;
    records.push(rec);
    if(!keepActive)active=null;
  }
  function makeStars(count,learned){
    const box=document.createElement('div');box.className='sg-review-stars';box.setAttribute('aria-label',(learned?'學習星已收集。':'學習星尚未收集。')+'本局評分 '+count+' 顆星，滿分 5 顆');
    const learning=document.createElement('span');learning.className='sg-review-star learning'+(learned?' earned':'');learning.textContent=learned?'★':'☆';learning.setAttribute('aria-hidden','true');box.appendChild(learning);
    for(let i=0;i<5;i++){const star=document.createElement('span');star.className='sg-review-star'+(i<count?' on':'');star.textContent='★';star.setAttribute('aria-hidden','true');box.appendChild(star);}
    return {box,learning};
  }
  function cardData(item){
    const rec=item.rec;
    return {word:rec.answer||rec.prompt,meaning:rec.meaning||rec.prompt||'再看一次正確答案'};
  }
  function show(title,options){
    if(active)add('unanswered',{},false);
    document.getElementById('sg-review-modal')?.remove();ensureStyle();
    const info=summary();
    const givenStars=Number(options&&options.stars);
    const stars=Number.isFinite(givenStars)?Math.max(1,Math.min(5,Math.round(givenStars))):info.stars;
    const cards=info.missed.map(cardData);
    const modal=document.createElement('div');modal.id='sg-review-modal';modal.className='sg-review-backdrop';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','sg-review-title');
    const card=document.createElement('div');card.className='sg-review-card';modal.appendChild(card);
    const h=document.createElement('h2');h.id='sg-review-title';h.textContent=title||'本局學習結算';card.appendChild(h);
    const lead=document.createElement('p');lead.className='sg-review-lead';lead.textContent='先看看本局評分，再把學習星一起收下！';card.appendChild(lead);
    const rating=document.createElement('section');rating.className='sg-review-rating';
    const ratingLabel=document.createElement('div');ratingLabel.className='sg-review-rating-label';ratingLabel.textContent='本局收集到的星星';rating.appendChild(ratingLabel);
    const starDisplay=makeStars(stars,!cards.length);rating.appendChild(starDisplay.box);
    const ratingText=document.createElement('div');ratingText.className='sg-review-rating-text';ratingText.innerHTML='<span class="learning-state">'+(cards.length?'橘色學習星尚未收集':'橘色全對學習星已收集')+'</span>　｜　本局評分 '+stars+' / 5';rating.appendChild(ratingText);card.appendChild(rating);
    const total=document.createElement('p');total.className='sg-review-total';total.setAttribute('aria-live','polite');total.textContent='目前收集 '+(stars+(cards.length?0:1))+' 顆星';card.appendChild(total);
    if(!cards.length){
      const perfect=document.createElement('div');perfect.className='sg-review-perfect';perfect.textContent=info.items.length?'🎉 這局沒有答錯或漏答，直接獲得全對學習星！':'這局結束前沒有出現單字題，學習星直接收下！';card.appendChild(perfect);
      const done=document.createElement('button');done.type='button';done.className='sg-review-action';done.textContent='收下學習星，查看成績';done.onclick=()=>modal.remove();card.appendChild(done);
      document.body.appendChild(modal);done.focus();return;
    }
    const progress=document.createElement('div');progress.className='sg-review-progress';card.appendChild(progress);
    const deck=document.createElement('div');deck.className='sg-review-deck';card.appendChild(deck);
    const flip=document.createElement('button');flip.type='button';flip.className='sg-review-flip';flip.setAttribute('aria-pressed','false');deck.appendChild(flip);
    const front=document.createElement('span');front.className='sg-review-face sg-review-front';flip.appendChild(front);
    const back=document.createElement('span');back.className='sg-review-face sg-review-back';flip.appendChild(back);
    const action=document.createElement('button');action.type='button';action.className='sg-review-action';action.hidden=true;card.appendChild(action);
    let index=0;
    function renderCard(){
      const item=cards[index];flip.classList.remove('flipped');flip.setAttribute('aria-pressed','false');flip.setAttribute('aria-label','第 '+(index+1)+' 張單字卡：'+item.word+'。點一下查看中文');
      front.replaceChildren();back.replaceChildren();
      const fk=document.createElement('span');fk.className='sg-review-kicker';fk.textContent='第 '+(index+1)+' / '+cards.length+' 張・剛剛沒記住';front.appendChild(fk);
      const fw=document.createElement('span');fw.className='sg-review-word';fw.textContent=item.word;front.appendChild(fw);
      const fh=document.createElement('span');fh.className='sg-review-hint';fh.textContent='點一下查看中文';front.appendChild(fh);
      const bk=document.createElement('span');bk.className='sg-review-kicker';bk.textContent='單字卡';back.appendChild(bk);
      const bw=document.createElement('span');bw.className='sg-review-word';bw.textContent=item.word;back.appendChild(bw);
      const bm=document.createElement('span');bm.className='sg-review-meaning';bm.textContent=item.meaning;back.appendChild(bm);
      const bc=document.createElement('span');bc.className='sg-review-confirmed';bc.textContent='✓ 已確認';back.appendChild(bc);
      progress.innerHTML='翻開每張卡片，收集 <b>1 顆學習星</b>　'+(index+1)+' / '+cards.length;
      action.hidden=true;action.disabled=false;
    }
    flip.onclick=()=>{
      if(flip.classList.contains('flipped'))return;
      flip.classList.add('flipped');flip.setAttribute('aria-pressed','true');
      flip.setAttribute('aria-label','已翻開：'+cards[index].word+'，'+cards[index].meaning);
      action.hidden=false;action.textContent=index<cards.length-1?'下一張單字卡':'收下 '+cards.length+' 張單字卡與學習星';action.focus();
    };
    action.onclick=()=>{
      if(index<cards.length-1){index++;renderCard();flip.focus();return;}
      action.disabled=true;action.textContent='正在收集單字卡…';
      const deckRect=deck.getBoundingClientRect(),starRect=starDisplay.learning.getBoundingClientRect();
      const flying=document.createElement('span');flying.className='sg-review-flying-star';flying.textContent='★';flying.setAttribute('aria-hidden','true');
      flying.style.left=(deckRect.left+deckRect.width/2)+'px';flying.style.top=(deckRect.top+deckRect.height/2)+'px';
      flying.style.setProperty('--sg-fly-x',(starRect.left+starRect.width/2-deckRect.left-deckRect.width/2)+'px');flying.style.setProperty('--sg-fly-y',(starRect.top+starRect.height/2-deckRect.top-deckRect.height/2)+'px');document.body.appendChild(flying);
      deck.classList.add('collecting');
      requestAnimationFrame(()=>flying.classList.add('go'));
      window.setTimeout(()=>{
        flying.remove();starDisplay.learning.classList.add('earned');starDisplay.learning.textContent='★';starDisplay.box.setAttribute('aria-label','學習星已收集。本局評分 '+stars+' 顆星，滿分 5 顆');ratingText.innerHTML='<span class="learning-state">橘色學習星已收集</span>　｜　本局評分 '+stars+' / 5';total.textContent='本局共收集 '+(stars+1)+' 顆星';progress.textContent='✅ '+cards.length+' 張單字卡已全部收下！';
        action.disabled=false;action.textContent='看完成績，繼續';action.onclick=()=>modal.remove();action.focus();
      },window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:400);
    };
    renderCard();document.body.appendChild(modal);flip.focus();
  }
  window.RoundReview={
    reset(){records.length=0;active=null;document.getElementById('sg-review-modal')?.remove();},
    begin(item){active=clean(item);},
    correct(item){add('correct',item,false);},
    wrong(item){add('wrong',item,true);},
    unanswered(item){add('unanswered',item,false);},
    endQuestion(){active=null;},
    show,
    get records(){return records.slice();}
  };
})();
