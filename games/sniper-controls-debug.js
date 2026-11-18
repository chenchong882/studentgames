/* Opt-in, memory-only diagnostics. No gameplay handlers or state are changed. */
(function(){
  'use strict';
  let initialized=false;
  window.initSniperControlsDebug=function(snapshot){
    if(initialized||new URLSearchParams(location.search).get('debugControls')!=='1')return;
    initialized=true;
    const started=performance.now(),records=[],limit=50;
    let sequence=0;
    function safeText(value){
      return String(value==null?'':value).replace(/https?:\/\/[^\s"'<>]+/g,raw=>{
        try{return new URL(raw).pathname;}catch(_){return '[URL]';}
      }).replace(/#[^\s"'<>]*/g,'[fragment]').slice(0,220);
    }
    function viewport(){
      const view=window.visualViewport;
      return {width:innerWidth,height:innerHeight,visualViewport:view?{
        width:Math.round(view.width),height:Math.round(view.height),
        offsetLeft:Math.round(view.offsetLeft),offsetTop:Math.round(view.offsetTop),scale:view.scale
      }:null};
    }
    function current(){
      let values;
      try{values=typeof snapshot==='function'?snapshot():{};}catch(error){return {snapshotError:safeText(error&&error.message),viewport:viewport()};}
      values=values||{};
      const result={};
      // Only diagnostic scalars are copied; never include questions, vocabulary, or URLs.
      for(const key of ['state','device','DEVICE','scoped','scopeBlend','ammo','fireDisabled','scopeDisabled','disabled','inputActive','phoneLandscape','frameAge','audioState']){
        const value=values[key];
        if(typeof value==='boolean'||typeof value==='number')result[key]=value;
        else if(typeof value==='string')result[key]=safeText(value);
      }
      if('tutorial' in values)result.tutorial=!!values.tutorial;
      result.viewport=viewport();
      return result;
    }
    function record(data){
      records.push({ms:Math.round(performance.now()-started),...data});
      if(records.length>limit)records.splice(0,records.length-limit);
    }
    function element(node){
      const target=node instanceof Element?node:node&&node.parentElement;
      if(!target)return null;
      const button=target.closest('button');
      return {tag:target.tagName.toLowerCase(),id:target.id||null,button:button?button.id||'(no id)':null};
    }
    const meta={version:'v1',source:location.pathname,userAgent:navigator.userAgent,
      screen:{width:screen.width,height:screen.height,pixelRatio:devicePixelRatio,maxTouchPoints:navigator.maxTouchPoints||0},
      viewport:viewport()};
    const style=document.createElement('style');
    style.textContent=`
      #sniper-debug-toggle{position:fixed!important;right:12px!important;top:50%!important;bottom:auto!important;left:auto!important;transform:translateY(-50%)!important;z-index:2147483000!important;width:auto!important;min-height:44px!important;padding:8px 12px!important;margin:0!important;border:1px solid #94a3b8!important;border-radius:10px!important;background:#172033!important;color:#fff!important;font:700 14px/1.4 Arial,sans-serif!important;cursor:pointer;touch-action:manipulation}
      #sniper-debug-panel{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:#020617e8;touch-action:pan-y}
      #sniper-debug-panel[hidden]{display:none!important}
      #sniper-debug-dialog{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;width:min(600px,100%);height:min(640px,calc(100vh - 64px));height:min(640px,calc(100dvh - 64px));padding:16px;border:1px solid #94a3b8;border-radius:14px;background:#0f172a;color:#f8fafc;font:14px/1.5 Arial,sans-serif;text-align:left;overflow:auto}
      #sniper-debug-title{margin:0;font:700 20px/1.4 Arial,sans-serif;color:#fff}
      #sniper-debug-output{box-sizing:border-box;display:block;flex:1;min-height:140px;width:100%;padding:10px;margin:0;resize:none;border:1px solid #64748b;border-radius:8px;background:#020617;color:#e2e8f0;font:12px/1.5 monospace;user-select:text!important;-webkit-user-select:text!important;-webkit-touch-callout:default!important;touch-action:pan-y}
      #sniper-debug-status{margin:0;color:#cbd5e1;font:14px/1.5 Arial,sans-serif}
      #sniper-debug-actions{display:flex;gap:10px;flex-wrap:wrap}
      #sniper-debug-actions button{flex:1;min-width:110px;min-height:44px;padding:9px 14px;margin:0;border:1px solid #94a3b8;border-radius:8px;background:#243449;color:#fff;font:700 15px/1.4 Arial,sans-serif;cursor:pointer;touch-action:manipulation}
      #sniper-debug-toggle:focus-visible,#sniper-debug-panel button:focus-visible,#sniper-debug-output:focus-visible{outline:3px solid #38bdf8;outline-offset:2px}
    `;
    document.head.appendChild(style);
    function make(tag,id,text){const node=document.createElement(tag);if(id)node.id=id;if(text)node.textContent=text;return node;}
    const toggle=make('button','sniper-debug-toggle','操作診斷');toggle.type='button';
    const panel=make('div','sniper-debug-panel');panel.hidden=true;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','sniper-debug-title');
    const dialog=make('div','sniper-debug-dialog'),title=make('h2','sniper-debug-title','操作診斷');
    const output=make('textarea','sniper-debug-output');output.readOnly=true;output.setAttribute('aria-label','本機操作診斷紀錄');output.spellcheck=false;
    const status=make('p','sniper-debug-status','紀錄只保留在這個分頁，不會自動傳送。');status.setAttribute('role','status');
    const actions=make('div','sniper-debug-actions'),copy=make('button',null,'複製結果'),close=make('button',null,'關閉');
    copy.type='button';close.type='button';actions.append(copy,close);dialog.append(title,output,status,actions);panel.appendChild(dialog);document.body.append(toggle,panel);
    function isDiagnosticUI(target){return target instanceof Node&&(target===toggle||toggle.contains(target)||panel.contains(target));}
    function dump(){return JSON.stringify({meta,records},null,2);}
    function inspect(event){
      if(isDiagnosticUI(event.target))return;
      const points=event.changedTouches?Array.from(event.changedTouches).slice(0,3).map(t=>({id:t.identifier,x:Math.round(t.clientX),y:Math.round(t.clientY)})):
        event.type==='click'&&event.detail===0?[]:[{x:Math.round(event.clientX),y:Math.round(event.clientY)}];
      const id=++sequence;
      record({id,phase:'before',event:event.type,pointerType:event.pointerType||null,detail:event.detail||0,
        target:element(event.target),points:points.map(point=>({...point,hit:element(document.elementFromPoint(point.x,point.y))})),
        touchCount:event.touches?event.touches.length:null,snapshot:current()});
      setTimeout(()=>record({id,phase:'after',event:event.type,snapshot:current()}),0);
    }
    for(const type of ['pointerdown','pointerup','touchstart','touchend','click','pointercancel','touchcancel'])document.addEventListener(type,inspect,{capture:true,passive:true});
    window.addEventListener('error',event=>{
      const error=event.error;
      record({event:'error',name:safeText(error&&error.name||'Error'),message:safeText(error&&error.message||event.message),snapshot:current()});
    },{passive:true});
    window.addEventListener('unhandledrejection',event=>{
      const reason=event.reason;
      record({event:'unhandledrejection',name:safeText(reason&&reason.name||'UnhandledRejection'),
        message:safeText(typeof reason==='string'?reason:reason&&reason.message||'Non-Error rejection'),snapshot:current()});
    },{passive:true});
    toggle.addEventListener('click',()=>{
      record({event:'inspect',snapshot:current()});output.value=dump();panel.hidden=false;
      status.textContent='紀錄只保留在這個分頁，不會自動傳送。';copy.focus();
    });
    copy.addEventListener('click',async()=>{
      output.value=dump();
      try{
        if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(output.value);status.textContent='已複製診斷結果。';
      }catch(_){
        output.focus();output.select();output.setSelectionRange(0,output.value.length);
        status.textContent='無法自動複製，請長按文字框，選取並複製紀錄。';
      }
    });
    close.addEventListener('click',()=>{panel.hidden=true;toggle.focus();});
    // These local UI keys must not trigger gameplay shortcuts underneath the open panel.
    panel.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();panel.hidden=true;toggle.focus();return;}
      if(event.key==='Tab'){
        const active=document.activeElement;
        if(event.shiftKey&&active===output){event.preventDefault();close.focus();}
        else if(!event.shiftKey&&active===close){event.preventDefault();output.focus();}
      }
    });
    record({event:'ready',snapshot:current()});
  };
})();
