/* Shared, pre-recorded word audio. API keys and speech generation stay off the website. */
(function(){
  'use strict';
  const scriptURL=document.currentScript.src;
  const audioRoot=new URL('../assets/word-audio/',scriptURL);
  const previewLibrary=window.WORD_AUDIO_PROFILES;
  const previewFiles=new Set(previewLibrary ? previewLibrary.files : []);
  const unlockURL=new URL('../assets/word-audio/unlock.wav',scriptURL).href;
  // Reuse one element: Safari grants playback permission to the element, not each URL.
  // Do not use bare `new Audio()`; bomb defines its own global Audio helper.
  const player=document.createElement('audio');
  player.preload='auto';player.setAttribute('playsinline','');
  let current=null,generation=0,priming=0,unlocked=false;
  const normalize=word=>String(word==null?'':word).trim().toLowerCase().replace(/\s+/g,' ');
  function callback(fn,reason){if(typeof fn==='function'){try{fn(reason);}catch(e){}}}
  function clearPlayer(){
    player.onended=null;player.onerror=null;player.onplaying=null;
    try{player.pause();}catch(e){}
  }
  function cancelSystemSpeech(){
    try{const synth=window.speechSynthesis;if(synth&&(synth.speaking||synth.pending))synth.cancel();}catch(e){}
  }
  function stop(force){
    // Start handlers often reset the game immediately after unlocking audio.
    // Preserve that silent primer until it resolves; it is not a word request.
    if(!force&&priming&&!current){cancelSystemSpeech();return;}
    generation++;priming=0;
    const previous=current;current=null;
    if(previous)clearTimeout(previous.timer);
    clearPlayer();cancelSystemSpeech();
    if(previous)callback(previous.options.onend,'cancelled');
  }
  function unlock(){
    if(unlocked||current||priming)return;
    const token=++generation;priming=token;
    clearPlayer();player.src=unlockURL;player.playbackRate=1;
    function release(success){
      if(priming!==token||generation!==token)return;
      priming=0;if(success)unlocked=true;
    }
    player.onended=()=>release(true);
    player.onerror=()=>release(false);
    try{
      // This call must stay synchronous inside the real button's user gesture.
      const promise=player.play();
      if(promise&&promise.then)promise.then(()=>release(true),()=>release(false));
    }catch(e){release(false);}
  }
  function play(word,options){
    const manifest=window.WORD_AUDIO_MANIFEST,name=normalize(word);
    if(!name||!manifest||!Object.prototype.hasOwnProperty.call(manifest.words,name)){stop();return false;}
    const filename=manifest.words[name];
    const profile=options && options.profile;
    let directory='marin/', version=manifest.version;
    if(profile && profile!=='us-female'){
      if(!previewLibrary || !Object.prototype.hasOwnProperty.call(previewLibrary.profiles,profile) || !previewFiles.has(filename)){
        stop();return false;
      }
      const variant=previewLibrary.profiles[profile];
      directory=variant.directory;version=variant.version;
    }
    stop(true);
    const url=new URL(directory+filename,audioRoot);
    url.searchParams.set('v',version);
    const entry={token:generation,url:url.href,options:options||{},timer:null};
    current=entry;
    function ownsPlayer(){return current===entry&&generation===entry.token;}
    function finish(failed){
      if(!ownsPlayer())return;
      current=null;clearTimeout(entry.timer);clearPlayer();
      if(failed)unlocked=false;
      callback(entry.options.onend,failed?'error':'ended');
      if(failed&&generation===entry.token&&!current&&!document.hidden)callback(entry.options.fallback);
    }
    player.onended=()=>{if(player.ended&&player.currentSrc===entry.url)finish(false);};
    player.onerror=()=>{if(player.error&&player.src===entry.url)finish(true);};
    player.onplaying=()=>{if(ownsPlayer())unlocked=true;};
    player.src=entry.url;
    // The chosen 0.9 speed is already rendered into the MP3. Do not slow it twice.
    player.playbackRate=1;
    entry.timer=setTimeout(()=>finish(true),15000);
    try{
      const promise=player.play();
      if(promise&&promise.catch)promise.catch(()=>finish(true));
    }catch(e){finish(true);}
    return true;
  }
  // Capture reaches real buttons even where canvas/game handlers stop propagation.
  document.addEventListener('click',event=>{
    if(event.isTrusted&&event.target instanceof Element&&event.target.closest('button'))unlock();
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop(true);});
  document.addEventListener('game-data-ready',()=>stop());
  window.addEventListener('pagehide',()=>stop(true));
  window.WordAudio={play,stop,unlock,isPlaying:()=>current!==null};
})();
