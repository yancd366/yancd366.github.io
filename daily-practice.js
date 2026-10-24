import {activities,activityById,places,sources} from './catalog.js';
import {manualEligible,safeURL,uid} from './domain.js';
import {safetyBlock} from './safety.js';import {abilityBlock} from './abilities.js';import {esc,icon} from './ui.js';
// An editorial small list, not every movement that happens to allow an office.
export const DAILY_IDS=['walk','scapula','thoracic','hip','calf','breath','eyes','func-sit-upper-rotation','func-sit-chest-opener','func-sit-ankle-pumps','func-sit-hip-march','foot-short-foot','baduanjin','wuxi'];
export const dailyDefaults=()=>({version:1,mode:'balanced',activityIds:[],focusId:null,place:'office',targets:{},routineAck:false});
export function validateDaily(value){
 if(value==null)return dailyDefaults();
 if(value.version!==1||!['balanced','focused'].includes(value.mode)||!places[value.place]||!Array.isArray(value.activityIds)||value.activityIds.length>DAILY_IDS.length||new Set(value.activityIds).size!==value.activityIds.length||value.activityIds.some(id=>!DAILY_IDS.includes(id))||typeof value.routineAck!=='boolean')throw new Error('日常活动设置无效。');
 if(value.focusId!=null&&!value.activityIds.includes(value.focusId)||value.mode==='focused'&&!value.focusId)throw new Error('集中模式请选择关注清单里的重点项目。');
 if(!value.targets||typeof value.targets!=='object'||Array.isArray(value.targets)||Object.entries(value.targets).some(([id,n])=>!value.activityIds.includes(id)||!Number.isInteger(n)||n<1||n>60))throw new Error('日常目标次数应为 1～60，不设置可留空。');
 return value;
}
const dayStart=date=>{const d=new Date(date);d.setHours(0,0,0,0);return d.getTime();};
export function dailyHistory(state,now=new Date()){
 const today=dayStart(now),start=new Date(today);start.setDate(start.getDate()-29);const map=new Map(),seen=new Set();
 for(const session of state.sessions||[]){const stamp=Date.parse(session.endedAt);if(seen.has(session.id)||!Number.isFinite(stamp)||stamp>Number(now))continue;seen.add(session.id);
  for(const id of new Set((session.items||[]).filter(i=>i.status==='completed'&&i.activityId).map(i=>i.activityId))){const row=map.get(id)||{count:0,lastAt:null,today:false};if(stamp>=Number(start))row.count++;if(row.lastAt==null||stamp>Date.parse(row.lastAt))row.lastAt=session.endedAt;if(dayStart(stamp)===today)row.today=true;map.set(id,row);}
 }return map;
}
export function dailyCandidates(state,now=new Date(),context={}){
 const cfg=validateDaily(state.dailyPractice),r={...context,place:cfg.place,minutes:5,focus:'balanced',readiness:context.readiness||'normal'},block=state.draft?.pausedForDiscomfort?'本次已记录不舒服，暂不继续推荐活动。':safetyBlock(state.profile,r)||abilityBlock(state.assessments||[]);
 if(block)return {rows:[],block};
 const history=dailyHistory(state,now),rows=cfg.activityIds.map(activityById).filter(a=>a&&!a.archived&&(a.kind==='routine'?cfg.routineAck:a.selectable!==false)&&manualEligible(a,r,state.profile)).map(a=>({activity:a,history:history.get(a.id)||{count:0,lastAt:null,today:false},target:cfg.targets[a.id]||null})).filter(x=>!x.history.today);
 const pending=rows.filter(x=>!x.target||x.history.count<x.target);
 const score=x=>x.target?x.history.count/x.target:x.history.count;
 pending.sort((a,b)=>(cfg.mode==='focused'?Number(b.activity.id===cfg.focusId)-Number(a.activity.id===cfg.focusId):0)||score(a)-score(b)||(Date.parse(a.history.lastAt)||0)-(Date.parse(b.history.lastAt)||0)||cfg.activityIds.indexOf(a.activity.id)-cfg.activityIds.indexOf(b.activity.id));
 return {rows:pending.slice(0,3),block:null};
}
export function confirmDaily(state,id,input,now=new Date(),context={}){
 const {rows,block}=dailyCandidates(state,now,context);if(block)throw new Error(block);
 const a=activityById(id);if(!a||!rows.some(x=>x.activity.id===id))throw new Error('该项目今天已记过，或不符合当前场地、器械和身体条件。');
 const raw=String(input.minutes??'').trim(),minutes=raw?Number(raw):null;if(minutes!==null&&(!Number.isFinite(minutes)||minutes<=0||minutes>1440))throw new Error('实际时长无效，不知道可留空。');
 if(!input.confirmed)throw new Error('请确认实际完成后再记录。');
 const session={id:uid(),source:'daily_confirmed',planSnapshot:null,startedAt:null,endedAt:now.toISOString(),actualMinutes:minutes,effort:null,feedback:String(input.note||'').slice(0,1000),items:[{id:uid(),activityId:id,activitySnapshot:structuredClone(a),status:'completed',actualMinutes:minutes,actualSets:null,actualReps:null,actualLoadKg:null,actualSetDetails:null,feedback:String(input.note||'').slice(0,1000)}]};
 state.sessions.push(session);return session;
}
export function dailySettingsHTML(state){
 const cfg=validateDaily(state.dailyPractice);
 return `<p class="helper left">只在你关注的清单里安排，不要求练遍全库。均衡优先近期少练、久未练的项目；集中优先重点项目，不自动增加强度。</p><form id="daily-settings-form"><label>模式<select name="mode"><option value="balanced" ${cfg.mode==='balanced'?'selected':''}>均衡轮换</option><option value="focused" ${cfg.mode==='focused'?'selected':''}>集中精进</option></select></label><label>日常活动场地<select name="place">${Object.entries(places).map(([id,label])=>`<option value="${id}" ${cfg.place===id?'selected':''}>${label}</option>`).join('')}</select></label><fieldset><legend>我想保留的日常项目</legend><div class="daily-choices">${DAILY_IDS.map(id=>{const a=activityById(id);return `<label class="check-pill"><input type="checkbox" name="activityIds" value="${id}" ${cfg.activityIds.includes(id)?'checked':''}><span>${esc(a.name)}${a.kind==='routine'?' · 整套跟练 / 手动记录':''}</span></label>`;}).join('')}</div></fieldset><label>集中模式的重点<select name="focusId"><option value="">未选择</option>${DAILY_IDS.map(id=>`<option value="${id}" ${cfg.focusId===id?'selected':''}>${esc(activityById(id).name)}</option>`).join('')}</select></label><details><summary>可选：近30天目标次数</summary><p class="small muted">这是你自己的目标，不是医学建议；留空只做轮换，不追补欠账。</p>${DAILY_IDS.map(id=>`<label>${esc(activityById(id).name)}<input name="target_${id}" type="number" min="1" max="60" value="${cfg.targets[id]||''}" placeholder="不设置"></label>`).join('')}</details><label class="checkbox-line"><input type="checkbox" name="routineAck" ${cfg.routineAck?'checked':''}>如果关注整套功法，我已了解原来源，只把它用于跟练提示和完成记录；App 不拆解教学、不解除原动作库限制</label><p class="helper left">近30天按实际保存的完成记录计数；一天同项目只在此记一次。办公室场地不会推荐需居家空间的整套功法。</p><button class="primary full" type="submit">保存日常偏好</button></form>`;
}
export function dailyHTML(state,context={}){
 const cfg=validateDaily(state.dailyPractice),history=dailyHistory(state),result=dailyCandidates(state,new Date(),context);
 return `<section class="card daily-card"><div class="section-heading"><div><span class="overline">DAILY MOVEMENT</span><h2>日常活动</h2></div><button class="text-button" data-action="daily-settings">${cfg.activityIds.length?'调整偏好':'选择关注项目'}</button></div><p class="small muted">${cfg.mode==='focused'?'集中精进':'均衡轮换'} · ${places[cfg.place]} · 最近30个自然日（含今天）</p>${!cfg.activityIds.length?'<p>办公空闲或日常想活动时，从少量关注项目开始，不必先定每周运动预算。</p>':result.block?`<p class="notice">${esc(result.block)}</p>`:result.rows.map(({activity:a,history:h,target})=>{const source=a.source?.sourceUrl||sources[a.sourceId]?.url||a.refs?.map(id=>sources[id]?.url).find(Boolean);return `<article class="daily-item"><div><button class="text-button" data-detail="${a.id}"><strong>${esc(a.name)}</strong></button><p>近30天 ${h.count} 次${target?` / 自设目标 ${target} 次`:''} · ${h.lastAt?`上次 ${esc(new Date(h.lastAt).toLocaleDateString('zh-CN'))}`:'还没有完成记录'}</p><span class="small muted">${a.kind==='routine'?'整套跟练提示，不是单动作自动处方':cfg.mode==='focused'&&a.id===cfg.focusId?'本阶段关注重点':'关注清单中的可选活动'}${safeURL(source)?` · <a href="${esc(safeURL(source))}" target="_blank" rel="noopener noreferrer">查看来源</a>`:''}</span></div><button class="secondary" data-daily-done="${a.id}">我做过了</button></article>`;}).join('')||'<p class="muted">今天已完成的项目不再催练；其余可能不符合当前场地或条件。</p>'}${cfg.activityIds.length?`<details class="daily-progress"><summary>关注清单的完成情况</summary>${cfg.activityIds.map(id=>`<p>${esc(activityById(id).name)}：近30天 ${history.get(id)?.count||0} 次${history.get(id)?.today?' · 今天已完成':''}${cfg.targets[id]?` / 自设目标 ${cfg.targets[id]}`:''}</p>`).join('')}</details>`:''}<p class="helper left">少练不代表薄弱；打开说明和来源不算练完，确认实际完成才记录。日常建议可离线使用。</p></section>`;
}
