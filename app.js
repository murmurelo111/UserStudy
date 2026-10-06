(async function () {
  'use strict';
  const $=id=>document.getElementById(id), C=window.StudyCore;
  const views=['welcome','evaluation','complete','fatal'];
  const show=id=>views.forEach(v=>$(v).hidden=v!==id);
  let data,state,key,storageOK=true,current,selected=null,entered=0,metrics={},desiredPlay=false,rendering=false,epoch=0;
  const videos=[$('video-left'),$('video-right')];
  const sides=['left','right'];
  const pending=new WeakMap();
  const errors=new Set();
  let submitting=false,submissionEndpoint='api/results';
  const fingerprint=s=>JSON.stringify([s.studyVersion,s.sessionId,C.result(s).responses]);
  const stamp=()=>new Date().toISOString();
  const save=()=>{state.updatedAt=stamp();try{localStorage.setItem(key,JSON.stringify(state));}catch(e){storageOK=false;} $('save-state').textContent=storageOK?'答案保存在此浏览器':'浏览器无法保存，请下载当前进度备份';};
  const count=()=>Object.keys(state.answers).length;
  const pauseAll=()=>{desiredPlay=false;videos.forEach(v=>v.pause());};
  const duration=()=>Math.min(...videos.map(v=>Number.isFinite(v.duration)&&v.duration>0?v.duration:Infinity));
  const format=t=>Number.isFinite(t)?`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`:'—';
  function updateTime(){const d=duration();$('seek').disabled=!Number.isFinite(d);$('seek').max=Number.isFinite(d)?d:1;$('seek').value=videos[0].currentTime||0;$('time').textContent=`${format(videos[0].currentTime)} / ${format(d)}`;}
  function seekVideo(v,t){const safe=Number.isFinite(v.duration)?Math.min(t,Math.max(0,v.duration-.001)):t; if(v.readyState<1){pending.set(v,safe);return;} if(Math.abs(v.currentTime-safe)>.07){pending.set(v,safe);v.currentTime=safe;}}
  function seekAll(t){videos.forEach(v=>seekVideo(v,t));updateTime();}
  function ui(){
    sides.forEach(side=>{$(`choose-${side}`).setAttribute('aria-pressed',String(selected===side));$(`choose-${side}`).disabled=errors.size>0;const el=$(`viewed-${side}`);el.textContent=metrics[side].played?'已播放':'等待播放';el.classList.toggle('done',metrics[side].played);});
    const viewed=metrics.left.played&&metrics.right.played;
    $('next').disabled=!selected||!viewed||errors.size>0;
    $('next').textContent=state.cursor===state.schedule.length-1?'确认并完成 ✓':'确认并继续 →';
    $('answer-hint').textContent=errors.size?'视频加载失败，请刷新页面重试。':!viewed?'请先播放两段视频，再作出选择。':selected?`已选择视频 ${selected==='left'?'A':'B'}，请确认。`:'请选择整体更好的视频 A 或 B。';
  }
  async function playAll(){
    if(rendering||errors.size)return;
    const token=epoch;desiredPlay=true;
    $('media-status').textContent='';
    // Align to the current A timestamp before starting the pair.
    seekVideo(videos[1],videos[0].currentTime);
    const result=await Promise.allSettled(videos.map(v=>v.play()));
    if(token!==epoch)return;
    if(result.some(r=>r.status==='rejected')){pauseAll();$('media-status').textContent='播放未能开始。请等待视频加载后，点击“同时播放”重试。';}
  }
  videos.forEach((v,i)=>{
    const side=sides[i],other=videos[1-i];
    v.addEventListener('loadedmetadata',()=>{if(pending.has(v)){const t=pending.get(v);pending.delete(v);seekVideo(v,t);}updateTime();});
    v.addEventListener('seeking',()=>{
      if(rendering)return;
      if(pending.has(v)&&Math.abs(v.currentTime-pending.get(v))<.09){pending.delete(v);return;}
      pending.delete(v);seekVideo(other,v.currentTime);updateTime();
    });
    v.addEventListener('seeked',()=>{if(pending.has(v)&&Math.abs(v.currentTime-pending.get(v))<.09)pending.delete(v);updateTime();});
    v.addEventListener('play',()=>{if(!rendering&&!desiredPlay)playAll();});
    v.addEventListener('playing',()=>{if(rendering||!current)return;metrics[side].played=true;ui();});
    v.addEventListener('pause',()=>{if(!rendering&&desiredPlay&&!v.ended)pauseAll();});
    v.addEventListener('ended',()=>{if(!rendering)pauseAll();});
    v.addEventListener('timeupdate',()=>{
      if(rendering||!current)return;
      if(!v.paused)metrics[side].maxTime=Math.max(metrics[side].maxTime,v.currentTime);
      // Correct accumulated playback drift as well as explicit seeks.
      if(i===0&&desiredPlay&&!v.seeking&&!other.seeking&&other.readyState>=3&&Math.abs(v.currentTime-other.currentTime)>.3)seekVideo(other,v.currentTime);
      updateTime();
    });
    v.addEventListener('error',()=>{if(rendering||!current)return;errors.add(side);pauseAll();$('media-status').textContent=`视频 ${i===0?'A':'B'} 加载失败。请检查网络后刷新页面；已有答案会保留。`;ui();});
  });
  function render(){
    rendering=true;epoch++;pauseAll();errors.clear();pending.delete(videos[0]);pending.delete(videos[1]);
    current=state.schedule[state.cursor];const trial=data.trials.find(t=>t.id===current.trialId),answer=state.answers[current.trialId];
    selected=answer?.preference??null;
    metrics={left:{played:answer?.leftPlayed??false,maxTime:answer?.leftMaxTime??0},right:{played:answer?.rightPlayed??false,maxTime:answer?.rightMaxTime??0}};
    entered=performance.now();
    $('prompt').textContent=trial.prompt;$('prompt-zh').textContent=trial.promptZh||'';$('position').textContent=`比较 ${state.cursor+1} / ${state.schedule.length}`;
    $('answered-count').textContent=`已完成 ${count()} 组`;$('progress').max=state.schedule.length;$('progress').value=count();
    $('previous').disabled=state.cursor===0;$('media-status').textContent='';
    videos.forEach((v,i)=>{v.src=data.videos[current[sides[i]]].src+'?revision='+encodeURIComponent(data.mediaRevision||'full-v1');v.load();});
    rendering=false;show('evaluation');updateTime();ui();save();
  }
  function welcome(){pauseAll();show('welcome');$('total-count').textContent=data.trialsPerSession;const exists=!!state;$('resume-info').hidden=!exists;$('resume-info').textContent=exists?`此浏览器已有进度：${count()} / ${data.trialsPerSession} 组。继续时会保留题目顺序与左右位置。`:'';$('start').textContent=exists?(count()===data.trialsPerSession?'查看已完成结果 →':'继续评估 →'):'开始评估 →';}
  function submissionUI(kind,message,receipt){
    $('submission-status').dataset.state=kind;
    $('submission-title').textContent=kind==='saved'?'已成功提交':kind==='sending'?'正在保存结果…':'尚未提交成功';
    $('submission-message').textContent=message;
    $('retry-submit').hidden=kind!=='error';
    $('submission-receipt').hidden=!receipt;
    $('submission-receipt').textContent=receipt?`提交回执：${receipt.receiptId} · 修订 ${receipt.revision}`:'';
    $('review').disabled=kind==='sending';$('new-session').disabled=kind==='sending';
  }
  async function submitResult(){
    if(submitting||!state||count()!==state.schedule.length)return;
    const signature=fingerprint(state),sid=state.sessionId;
    if(state.submission?.fingerprint===signature){submissionUI('saved','你的答案已保存到研究服务器，无需另外发送文件。',state.submission);return;}
    submitting=true;save();
    submissionUI('sending','请稍等，收到服务器回执后会显示提交成功。');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      if(!submissionEndpoint)throw new Error('尚未配置结果保存接口，请联系研究者。');
      const response=await fetch(submissionEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(C.result(state)),credentials:'omit',signal:controller.signal});
      let receipt;try{receipt=await response.json();}catch(e){throw new Error('当前网站未连接答卷保存服务。');}
      if(!response.ok||receipt.ok!==true)throw new Error(receipt.error||'服务器暂时无法保存。');
      if(receipt.sessionId!==sid||receipt.studyVersion!==state.studyVersion||typeof receipt.receiptId!=='string'||!Number.isInteger(receipt.revision))throw new Error('提交回执无效，请重试。');
      if(state.sessionId!==sid||fingerprint(state)!==signature)return;
      state.submission={...receipt,fingerprint:signature};save();
      submissionUI('saved','你的答案已保存到研究服务器，无需另外发送文件。',receipt);
    }catch(e){
      if(state?.sessionId===sid)submissionUI('error',`${e.name==='AbortError'?'提交超时。':e.message} ${storageOK?'答案仍保存在此浏览器，可重试或下载备份。':'请保持此页面，并下载答案备份。'}`);
    }finally{clearTimeout(timer);submitting=false;}
  }
  function finish(){pauseAll();save();show('complete');$('export-status').textContent='';submitResult();}

  function download(kind){save();const r=C.result(state),json=kind==='json';const blob=new Blob([json?JSON.stringify(r,null,2):C.csv(r)],{type:json?'application/json':'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`video-study_${state.sessionId}_${r.completed?'complete':'partial'}.${kind}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);if(!$('complete').hidden)$('export-status').textContent='已发起下载。请检查下载目录，作为备份。';}
  $('consent').addEventListener('change',()=>{$('start').disabled=!$('consent').checked;});
  $('start').addEventListener('click',()=>{if(!$('consent').checked)return;if(!state){state=C.session(data);save();}count()===data.trialsPerSession?finish():render();});
  sides.forEach(side=>$(`choose-${side}`).addEventListener('click',()=>{selected=side;ui();}));
  $('play').addEventListener('click',playAll);$('pause').addEventListener('click',pauseAll);
  $('replay').addEventListener('click',()=>{pauseAll();seekAll(0);playAll();});
  $('seek').addEventListener('input',()=>seekAll(Number($('seek').value)));
  $('previous').addEventListener('click',()=>{if(state.cursor>0){state.cursor--;render();}});
  $('next').addEventListener('click',()=>{
    if($('next').disabled)return;
    const previous=state.answers[current.trialId];
    delete state.submission;
    state.answers[current.trialId]={mediaRevision:data.mediaRevision||'full-v1',trialId:current.trialId,leftVideoId:current.left,rightVideoId:current.right,preference:selected,selectedVideoId:current[selected],answeredAt:stamp(),decisionMs:Math.round((previous?.decisionMs||0)+performance.now()-entered),leftPlayed:metrics.left.played,rightPlayed:metrics.right.played,leftMaxTime:metrics.left.maxTime,rightMaxTime:metrics.right.maxTime};save();
    if(state.cursor===state.schedule.length-1&&count()===state.schedule.length){finish();return;}
    if(state.cursor<state.schedule.length-1)state.cursor++;else state.cursor=state.schedule.findIndex(t=>!state.answers[t.trialId]);render();window.scrollTo({top:0,behavior:'smooth'});
  });
  $('backup').addEventListener('click',()=>download('json'));$('break').addEventListener('click',()=>{save();welcome();});
  $('retry-submit').addEventListener('click',submitResult);
  window.addEventListener('online',()=>{if(!$('complete').hidden)submitResult();});
  $('download-json').addEventListener('click',()=>download('json'));$('download-csv').addEventListener('click',()=>download('csv'));
  $('review').addEventListener('click',()=>{state.cursor=0;render();});
  $('new-session').addEventListener('click',()=>{if(!confirm(state.submission?.fingerprint===fingerprint(state)?'现有结果已保存到服务器。开始另一位评估者的评估吗？':'现有结果尚未提交成功。请先重试提交或下载备份，再开始新评估。仍要继续吗？'))return;state=null;try{localStorage.removeItem(key);}catch(e){}$('consent').checked=false;$('start').disabled=true;welcome();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAll();});
  window.addEventListener('pagehide',()=>{if(state)save();pauseAll();});
  try{
    const response=await fetch('data/study.json',{cache:'no-cache'});if(!response.ok)throw new Error('评估数据加载失败。');data=await response.json();
    if(!data.trials.length||!data.version)throw new Error('评估数据为空。');key=`video-study-v1:${data.version}`;
    try{const raw=localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(!C.validate(parsed,data))throw new Error('保存的进度格式异常。请先备份浏览器数据，联系研究者处理。');state=parsed;}}catch(e){if(e instanceof SyntaxError || e.message.includes('进度格式'))throw e;storageOK=false;}
    const configResponse=await fetch('submission-config.json',{cache:'no-cache'});
    if(configResponse.ok){const config=await configResponse.json();if(typeof config.endpoint==='string'){submissionEndpoint=config.endpoint;if(submissionEndpoint){const url=new URL(submissionEndpoint,location.href);if(url.protocol!=='https:'&&url.origin!==location.origin&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('结果保存接口必须使用 HTTPS。');}}}
    welcome();
  }catch(e){$('fatal-message').textContent=`${e.message} 请通过本地 HTTP 服务器打开网站，而非直接双击 HTML。`;show('fatal');}
})();
