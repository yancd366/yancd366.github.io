// Derived from confirmed sessions only. Counts describe recorded behaviour, not ability.
const DAY=86400000;
export const HISTORY_DAYS=28;
export const FREE_SORTS={frequent:'常练优先',infrequent:'少练优先',balanced:'常练＋补充',collected:'常练＋新收藏'};
export function buildActivityHistory(state,now=new Date()){
  const end=Number(now),start=end-HISTORY_DAYS*DAY,map=new Map(),seen=new Set();
  for(const session of state.sessions||[]){
    const stamp=Date.parse(session.endedAt);if(!Number.isFinite(stamp)||stamp>end||seen.has(session.id))continue;seen.add(session.id);
    const grouped=new Map();
    for(const i of session.items||[]){if(i.status!=='completed'||!i.activityId)continue;grouped.set(i.activityId,[...(grouped.get(i.activityId)||[]),i]);}
    for(const [id,items] of grouped){
      const sets=items.flatMap(i=>i.actualSetDetails||[]),row=map.get(id)||{id,totalSessions:0,sessions28:0,sets28:0,mainSets28:0,warmupSets28:0,unlabelledSets28:0,lastAt:null,lastSets:[],records:[]};
      row.totalSessions++;
      if(stamp>=start){row.sessions28++;row.sets28+=sets.length;row.mainSets28+=sets.filter(x=>x.phase==='main').length;row.warmupSets28+=sets.filter(x=>x.phase==='warmup').length;row.unlabelledSets28+=sets.filter(x=>!x.phase).length;}
      const record={sessionId:session.id,endedAt:session.endedAt,sets:structuredClone(sets),feedback:items.map(i=>i.feedback||'').filter(Boolean).join('；'),legacySummary:!sets.length?{sets:items[0].actualSets??null,reps:items[0].actualReps??null,loadKg:items[0].actualLoadKg??null}:null};
      row.records.push(record);
      if(row.lastAt==null||stamp>Date.parse(row.lastAt)){row.lastAt=session.endedAt;row.lastSets=record.sets;}
      map.set(id,row);
    }
  }
  for(const row of map.values())row.records.sort((a,b)=>Date.parse(b.endedAt)-Date.parse(a.endedAt));
  return map;
}
export function recentCollectionDates(state,now=new Date()){
  const map=new Map(),end=Number(now),put=(id,raw,kind)=>{const date=Date.parse(raw);if(id&&Number.isFinite(date)&&date<=end&&date>(map.get(id)?.date||0))map.set(id,{date,kind});};
  for(const k of state.knowledge||[])if(k.status==='saved')for(const id of new Set([...(k.activityIds||[]),...(k.activityLinks||[]).map(l=>l.activityId)]))put(id,k.createdAt||k.updatedAt,'收藏');
  for(const p of state.personalActivities||[])if(p.status==='confirmed')put(p.id,p.createdAt,'加入我的动作库');
  return map;
}
const compound=a=>a.category==='strength'&&/squat|hinge|lunge|deadlift|push|row|pull|carry/.test(a.familyId||'');
// Stable interleaving: familiarity plus different movement families, never random or a
// claim of weakness/high benefit. Every original candidate remains accessible.
export function sortFreeCandidates(rows,state,mode='balanced',now=new Date()){
  const history=buildActivityHistory(state,now),collections=recentCollectionDates(state,now);
  const enriched=rows.map(r=>({...r,history:history.get(r.activity.id)||null,collection:collections.get(r.activity.id)||null}));
  const count=r=>r.history?.sessions28||0,last=r=>Date.parse(r.history?.lastAt)||0,name=(a,b)=>a.activity.name.localeCompare(b.activity.name,'zh-CN');
  const frequent=(a,b)=>count(b)-count(a)||last(b)-last(a)||Number(compound(b.activity))-Number(compound(a.activity))||name(a,b);
  const infrequent=(a,b)=>count(a)-count(b)||last(a)-last(b)||name(a,b);
  const order=list=>{
    if(mode==='frequent')return list.sort(frequent).map(r=>({...r,sortReason:count(r)?`近 28 天练过 ${count(r)} 次`:'还没有近 28 天的已保存记录'}));
    if(mode==='infrequent')return list.sort(infrequent).map(r=>({...r,sortReason:count(r)?`近 28 天练过 ${count(r)} 次，按频次由少到多`:'近 28 天没有已保存记录，不代表身体薄弱'}));
    const familiar=list.filter(r=>count(r)>0).sort(frequent),extras=mode==='collected'?list.filter(r=>r.collection).sort((a,b)=>b.collection.date-a.collection.date||infrequent(a,b)):list.slice().sort(infrequent);
    const result=[],ids=new Set(),families=new Set();
    const add=(r,reason)=>{if(!r||ids.has(r.activity.id))return;ids.add(r.activity.id);families.add(r.activity.familyId);result.push({...r,sortReason:reason});};
    familiar.slice(0,2).forEach(r=>add(r,`熟悉候选：近 28 天练过 ${count(r)} 次`));
    for(const r of extras){if(result.length>=4)break;if(mode==='collected'||!families.has(r.activity.familyId))add(r,mode==='collected'?`最近${r.collection.kind}，可自行核对尝试`:'本次可选补充：近期少练且动作方向不同；不代表必须练');}
    for(const r of extras){if(result.length>=4)break;add(r,'近期少练的其他候选；不代表必须练');}
    list.slice().sort(frequent).forEach(r=>add(r,'其他候选，可按你的目标选择'));
    return result;
  };
  return [...order(enriched.filter(r=>r.allowed)),...order(enriched.filter(r=>!r.allowed))];
}
