// Shared recording rules. Numeric limits protect data integrity, not medical clearance.
export const LOAD_BASES = { total:'总重量（含杠）', per_hand:'每只哑铃', machine:'器械标示', assistance:'辅助重量', unknown:'未注明口径' };
export const FEELINGS = { easy:'轻松', right:'合适', hard:'吃力', discomfort:'不舒服' };
export function validateSets(sets) {
  if (!Array.isArray(sets) || sets.length > 30) throw new Error('每个动作最多记录 30 组。');
  for (const x of sets) {
    if (!x || typeof x !== 'object') throw new Error('组次格式无效。');
    for (const [key,max,integer] of [['reps',1000,true],['loadKg',500,false],['seconds',7200,true]]) {
      const v=x[key];
      if (v!=null && (typeof v!=='number'||!Number.isFinite(v)||v<(key==='loadKg'?0:1)||v>max||(integer&&!Number.isInteger(v)))) throw new Error('次数、重量或秒数超出可记录范围。');
    }
    if (x.reps==null && x.loadKg==null && x.seconds==null && !x.feeling) throw new Error('空白组不用保存。');
    if (x.loadBasis!=null && !Object.hasOwn(LOAD_BASES,x.loadBasis)) throw new Error('请注明重量口径。');
    if (x.feeling!=null && x.feeling!=='' && !Object.hasOwn(FEELINGS,x.feeling)) throw new Error('感受选项无效。');
  }
  return sets;
}
export function setSummary(sets) {
  validateSets(sets);
  const same = v => v.length && v.every(x=>x!=null&&x===v[0])?v[0]:null;
  return {actualSets:sets.length||null,actualReps:same(sets.map(x=>x.reps)),actualLoadKg:same(sets.map(x=>x.loadKg)),actualSetDetails:sets.length?sets:null};
}
export const setsText = sets => (sets||[]).map(x=>`${x.loadKg!=null?`${x.loadKg}kg${x.reps!=null||x.seconds!=null?'×':''}`:''}${x.reps??''}${x.seconds!=null?`${x.seconds}秒`:''}`).join('、');
export function parseSetsText(text) {
  const tokens=String(text||'').trim().split(/[、,，;；\s]+/).filter(Boolean);
  return validateSets(tokens.map(t=>{
    const m=t.replace(/[xX*＊]/g,'×').match(/^(?:(\d+(?:\.\d+)?)kg×?)?(?:(\d+)(秒|s)?)?$/i);
    if(!m||(m[1]==null&&m[2]==null))throw new Error(`看不懂「${t}」，请写成 60kg×8、8 或 60秒`);
    return {reps:m[3]?null:m[2]==null?null:Number(m[2]),loadKg:m[1]==null?null:Number(m[1]),seconds:m[3]?Number(m[2]):null};
  }));
}
// External-load movements carry a plate/dumbbell weight; others are bodyweight or light resistance.
const LOADED = e => ['dumbbell','barbell','kettlebell','machine','smith','cable'].includes(e);
// Only loaded movements should ask for a kg value; mobility / bodyweight / cardio should not.
export const isLoaded = a => (a?.equipment||[]).some(LOADED);
// Rest is a suggestion, never a command: loaded strength work rests longer, everything else shorter.
export function restDefault(activity) {
  return activity?.category==='strength'&&(activity?.equipment||[]).some(LOADED)?90:60;
}
// 计时/保持型动作:剂量以「秒」为主(等长保持、拳击/有氧回合),进行中用倒计时而非记 kg×次。
export const isTimed = (item, activity) => {
  const p = item?.prescription;
  if (p?.seconds != null) return true;   // 明确给了秒数(含区间)
  if (p?.reps != null) return false;     // 明确给了次数 → 走计次
  return activity?.system === 'isometric'; // 无处方时,只有等长按保持处理
};
// 解析处方里的秒数目标:固定值(如 "30")→ 倒计时;区间(如 "20-30")→ 正计时,低值是达标线、高值是目标。
export const timeTarget = item => {
  const s = item?.prescription?.seconds;
  if (s == null) return null;
  const [a, b] = String(s).split('-').map(Number);
  return Number.isFinite(a) ? { min: a, max: Number.isFinite(b) ? b : a, countdown: b == null } : null;
};
// The last recorded set for this exact exercise, used only to pre-fill inputs (never to auto-increase load).
export function lastLoad(activity,state,now=new Date()) {
  const latest=[...state.sessions].filter(s=>new Date(s.endedAt)<=now).sort((a,b)=>new Date(b.endedAt)-new Date(a.endedAt))
    .flatMap(s=>s.items.filter(i=>i.status==='completed'&&i.activityId===activity.id)).find(i=>i.actualSetDetails?.some(x=>x.loadKg!=null)||i.actualLoadKg!=null);
  if(!latest)return null;
  const rows=latest.actualSetDetails||[{loadKg:latest.actualLoadKg,reps:latest.actualReps}];
  const last=rows.filter(x=>x.loadKg!=null).at(-1);
  return last?{loadKg:last.loadKg,loadBasis:last.loadBasis||'unknown',reps:last.reps??null}:null;
}
export function weightReference(activity,state,now=new Date()) {
  const latest=[...state.sessions].filter(s=>new Date(s.endedAt)<=now).sort((a,b)=>new Date(b.endedAt)-new Date(a.endedAt))
    .flatMap(s=>s.items.filter(i=>i.status==='completed'&&i.activityId===activity.id).map(i=>({s,i}))).find(({i})=>i.actualSetDetails?.some(x=>x.loadKg!=null)||i.actualLoadKg!=null);
  if(latest){
    const {s,i}=latest,rows=i.actualSetDetails||[{loadKg:i.actualLoadKg,reps:i.actualReps}];
    const last=rows.filter(x=>x.loadKg!=null).at(-1);
    const difficult=rows.some(x=>['hard','discomfort'].includes(x.feeling));
    return {source:'history',text:`上次记录：${last.loadKg} kg · ${LOAD_BASES[last.loadBasis]||'口径未注明'}${last.reps?` × ${last.reps} 次`:''}${last.feeling?` · ${FEELINGS[last.feeling]}`:''}。${difficult?'上次吃力或不舒服，不自动加重。':'只作同一动作与同一器械的参考，不自动加重。'}`,date:s.endedAt};
  }
  return {source:'general',text:activity.equipment.some(e=>['dumbbell','barbell','kettlebell','machine','smith','cable'].includes(e))?'首次没有可靠公斤数：从较轻阻力试起，选择能舒适、稳定完成动作的重量。自行填写本次实际重量；哑铃注明每只还是总重。':'先用能稳定控制的动作版本或阻力；自重动作不必填公斤数。'};
}
