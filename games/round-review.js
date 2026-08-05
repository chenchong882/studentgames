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
  function ensureStyle(){
    if(document.getElementById('sg-review-style'))return;
    const style=document.createElement('style');style.id='sg-review-style';style.textContent=`
      .sg-review-backdrop{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,8,20,.86);backdrop-filter:blur(8px);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f8fafc}
      .sg-review-card{width:min(760px,96vw);max-height:min(88vh,820px);overflow:auto;border:2px solid rgba(255,255,255,.2);border-radius:24px;background:linear-gradient(160deg,#172554,#0f172a 48%,#111827);box-shadow:0 25px 80px rgba(0,0,0,.65),0 0 45px rgba(59,130,246,.2);padding:clamp(18px,4vw,30px)}
      .sg-review-card h2{margin:0;text-align:center;font-size:clamp(26px,6vw,42px);line-height:1.15;color:#fff}.sg-review-lead{text-align:center;color:#cbd5e1;margin:8px 0 18px;font-weight:700}
      .sg-review-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}.sg-review-count{border-radius:16px;padding:12px 8px;text-align:center;border:2px solid}.sg-review-count b{display:block;font-size:clamp(28px,7vw,42px);line-height:1}.sg-review-count span{display:block;margin-top:5px;font-weight:900}.sg-review-ok{background:#052e25;border-color:#22c55e;color:#86efac}.sg-review-wrong{background:#450a0a;border-color:#ef4444;color:#fecaca}.sg-review-skip{background:#422006;border-color:#f59e0b;color:#fde68a}
      .sg-review-section{margin-top:18px}.sg-review-section h3{margin:0 0 10px;font-size:clamp(19px,4vw,25px)}.sg-review-list{display:grid;gap:10px}.sg-review-row{border-radius:15px;padding:13px 15px;border-left:7px solid;background:rgba(255,255,255,.08)}.sg-review-row.wrong{border-color:#ef4444;background:rgba(127,29,29,.34)}.sg-review-row.unanswered{border-color:#f59e0b;background:rgba(120,53,15,.34)}.sg-review-row.correct{border-color:#22c55e;background:rgba(20,83,45,.3)}
      .sg-review-status{font-weight:950;font-size:17px}.sg-review-question{margin-top:5px;color:#e2e8f0;font-weight:700}.sg-review-answer{margin-top:5px;font-size:17px;font-weight:900;color:#fff}.sg-review-chosen{margin-top:3px;color:#fecaca;font-weight:800}.sg-review-perfect{padding:18px;border:2px solid #22c55e;border-radius:18px;text-align:center;background:rgba(20,83,45,.38);font-size:clamp(18px,4vw,24px);font-weight:900;color:#bbf7d0}.sg-review-close{display:block;width:min(360px,100%);margin:24px auto 0;padding:13px 20px;border:0;border-radius:999px;background:linear-gradient(#fde047,#f59e0b);color:#422006;font:900 18px system-ui;cursor:pointer;box-shadow:0 8px 24px rgba(245,158,11,.28)}
      @media(max-width:520px){.sg-review-backdrop{padding:8px}.sg-review-card{max-height:94vh;border-radius:18px;padding:16px 12px}.sg-review-counts{gap:6px}.sg-review-count{padding:10px 4px}.sg-review-row{padding:11px 12px}}
    `;document.head.appendChild(style);
  }
  function add(status,item,keepActive){
    const rec=clean({...active,...item,status});
    if(!rec.prompt&&!rec.answer)return;
    records.push(rec);
    if(!keepActive)active=null;
  }
  function row(rec){
    const box=document.createElement('div');box.className='sg-review-row '+rec.status;
    const labels={correct:'✅ 答對',wrong:'❌ 答錯',unanswered:'⌛ 未作答'};
    const status=document.createElement('div');status.className='sg-review-status';status.textContent=labels[rec.status]||labels.correct;box.appendChild(status);
    if(rec.prompt){const q=document.createElement('div');q.className='sg-review-question';q.textContent='題目：'+rec.prompt;box.appendChild(q);}
    const a=document.createElement('div');a.className='sg-review-answer';a.textContent='正解：'+rec.answer+(rec.meaning?'（'+rec.meaning+'）':'');box.appendChild(a);
    if(rec.status==='wrong'&&rec.chosen){const c=document.createElement('div');c.className='sg-review-chosen';c.textContent='你選了：'+rec.chosen;box.appendChild(c);}
    return box;
  }
  function show(title){
    if(active)add('unanswered',{},false);
    document.getElementById('sg-review-modal')?.remove();ensureStyle();
    const modal=document.createElement('div');modal.id='sg-review-modal';modal.className='sg-review-backdrop';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','sg-review-title');
    const card=document.createElement('div');card.className='sg-review-card';modal.appendChild(card);
    const h=document.createElement('h2');h.id='sg-review-title';h.textContent=title||'📚 本局學習回顧';card.appendChild(h);
    const lead=document.createElement('p');lead.className='sg-review-lead';lead.textContent='先看需要複習的地方，再確認這局答對了什麼。';card.appendChild(lead);
    const counts={correct:0,wrong:0,unanswered:0};records.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
    const countBox=document.createElement('div');countBox.className='sg-review-counts';
    [['correct','sg-review-ok','答對'],['wrong','sg-review-wrong','答錯'],['unanswered','sg-review-skip','未作答']].forEach(([key,cls,label])=>{const el=document.createElement('div');el.className='sg-review-count '+cls;el.innerHTML='<b>'+counts[key]+'</b><span>'+label+'</span>';countBox.appendChild(el);});card.appendChild(countBox);
    const needs=records.filter(r=>r.status!=='correct'),oks=records.filter(r=>r.status==='correct');
    const needSec=document.createElement('section');needSec.className='sg-review-section';const needH=document.createElement('h3');needH.textContent='🎯 這些要再複習';needSec.appendChild(needH);
    if(!needs.length){const perfect=document.createElement('div');perfect.className='sg-review-perfect';perfect.textContent=records.length?'🎉 這局沒有答錯或漏答！':'這局結束前沒有出現單字題。';needSec.appendChild(perfect);}else{const list=document.createElement('div');list.className='sg-review-list';needs.forEach(r=>list.appendChild(row(r)));needSec.appendChild(list);}card.appendChild(needSec);
    if(oks.length){const okSec=document.createElement('section');okSec.className='sg-review-section';const okH=document.createElement('h3');okH.textContent='✅ 這些答對了';okSec.appendChild(okH);const list=document.createElement('div');list.className='sg-review-list';oks.forEach(r=>list.appendChild(row(r)));okSec.appendChild(list);card.appendChild(okSec);}
    const close=document.createElement('button');close.type='button';close.className='sg-review-close';close.textContent='看完了，查看成績';close.onclick=()=>modal.remove();card.appendChild(close);
    document.body.appendChild(modal);close.focus();
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
