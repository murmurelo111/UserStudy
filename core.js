/* No method identities belong in this public module. */
(function (root) {
  'use strict';
  const randomInt = n => { const a = new Uint32Array(1); const ceiling = Math.floor(4294967296 / n) * n; do { root.crypto.getRandomValues(a); } while (a[0] >= ceiling); return a[0] % n; };
  function session(data) {
    const groups = new Map();
    data.trials.forEach(t=>{if(!groups.has(t.group))groups.set(t.group,[]);groups.get(t.group).push(t);});
    const candidates=Array.from(groups.values());
    for(let i=candidates.length-1;i>0;i--){const j=randomInt(i+1);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    const schedule=candidates.slice(0,data.trialsPerSession).map(group=>{const t=group[randomInt(group.length)];return {trialId:t.id,left:t.videos[0],right:t.videos[1]};});
    for (let i = schedule.length-1; i>0; i--) { const j=randomInt(i+1); [schedule[i],schedule[j]]=[schedule[j],schedule[i]]; }
    schedule.forEach(t => { if(randomInt(2)) [t.left,t.right]=[t.right,t.left]; });
    return {schemaVersion:1,studyVersion:data.version,mediaRevision:data.mediaRevision||'full-v1',sessionId:root.crypto.randomUUID(),startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),cursor:0,schedule,answers:{}};
  }
  function validate(s, data) {
    if(!s || s.schemaVersion!==1 || s.studyVersion!==data.version || typeof s.sessionId!=='string' || !Array.isArray(s.schedule) || s.schedule.length!==data.trialsPerSession || !Number.isInteger(s.cursor) || s.cursor<0 || s.cursor>=s.schedule.length || !s.answers || typeof s.answers!=='object') return false;
    const map=new Map(data.trials.map(t=>[t.id,t])); const seen=new Set(); const seenGroups=new Set();
    for(const t of s.schedule) { const p=map.get(t.trialId); if(!p || seenGroups.has(p.group) || seen.has(t.trialId) || t.left===t.right || !p.videos.includes(t.left) || !p.videos.includes(t.right)) return false; seen.add(t.trialId); seenGroups.add(p.group); }
    return Object.entries(s.answers).every(([id,a])=>seen.has(id) && ['left','right'].includes(a.preference) && a.trialId===id && s.schedule.some(t=>t.trialId===id && t.left===a.leftVideoId && t.right===a.rightVideoId));
  }
  function result(s) { return {schemaVersion:1,studyVersion:s.studyVersion,mediaRevision:s.mediaRevision||'full-v1',sessionId:s.sessionId,startedAt:s.startedAt,updatedAt:s.updatedAt,completed:Object.keys(s.answers).length===s.schedule.length,totalTrials:s.schedule.length,schedule:s.schedule,responses:s.schedule.map(t=>s.answers[t.trialId]).filter(Boolean)}; }
  function csv(r) {
    const fields=['sessionId','studyVersion','trialId','leftVideoId','rightVideoId','preference','selectedVideoId','answeredAt','decisionMs','leftPlayed','rightPlayed','leftMaxTime','rightMaxTime','mediaRevision'];
    const quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
    return '\uFEFF'+[fields,...r.responses.map(a=>fields.map(k=>(k==='mediaRevision'?a[k]??r[k]:r[k]??a[k])))].map(row=>row.map(quote).join(',')).join('\r\n');
  }
  root.StudyCore={session,validate,result,csv};
  if(typeof module!=='undefined') module.exports=root.StudyCore;
})(typeof window!=='undefined'?window:globalThis);
