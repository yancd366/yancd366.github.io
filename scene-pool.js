// AI-assisted pool building is not today's agenda and never changes global planning permissions.
import{activities,activityById}from'./catalog.js';import{manualEligible}from'./domain.js';
import{safetyBlock,regionsInText}from'./safety.js';import{abilityBlock}from'./abilities.js';
import{sceneById,addSceneActivities,sceneRequest}from'./movement-scenes.js';
const clip=(x,n)=>String(x??'').trim().slice(0,n),forbidden=/诊断|治疗|治愈|根治|康复|矫正|缓解.{0,8}(?:疼痛|症状)|导致.{0,8}(?:痛|病)/;
const evidence=a=>[a.name,a.description,`部位：${(a.body||[]).join('、')}`,`起始：${(a.setup||[]).join('；')}`,`步骤：${(a.steps||[]).join('；')}`].filter(Boolean).join('\n').slice(0,1000);
export function buildScenePoolInput(state,sceneId,question,{previous=[]}={}){
 const scene=sceneById(state,sceneId);if(!scene)throw Error('场景已不存在，请先创建或选择场景。');if(String(question||'').length>1500)throw Error('累计需求超过1500字，请精简后再提交；不会自动截去你的限制条件。');const text=clip(question,1500);if(!text)throw Error('请说说这个场景主要想做什么。');
 const request=sceneRequest(scene,{userText:text}),block=safetyBlock(state.profile,request)||abilityBlock(state.assessments||[]);if(block||state.draft?.pausedForDiscomfort)throw Error(block||'本次出现不舒服，先结束已有训练后再选动作。');
 const noFloor=/(?:不|不要|不能|不方便|不想)(?:趴地|躺地|跪地|在地上)|不(?:方便|想|能)?(?:趴|躺|跪|坐)(?:在)?(?:地上|地面)|只(?:想|能)?站(?:着|立)/.test(text);
 const regions=new Set(regionsInText(text,{includeSensory:true})),grams=new Set(Array.from({length:Math.max(0,text.length-1)},(_,n)=>text.slice(n,n+2))),priorIds=new Set(previous.map(x=>x.activityId));
 const all=activities.filter(a=>!a.archived&&manualEligible(a,request,state.profile)&&(!noFloor||!/仰卧|俯卧|四点|跪|垫上|躺|撑地|双手.{0,8}地面|坐在地/.test([a.name,...(a.setup||[])].join(' ')))).map(a=>({id:a.id,name:a.name,evidence:evidence(a),autoAllowed:a.selectable!==false,needsReview:a.selectable===false||!a.setup?.length}));
 const ranked=all.map((a,n)=>{let score=0;for(const g of grams)if(a.evidence.includes(g))score++;score+=regionsInText(a.evidence,{includeSensory:true}).filter(r=>regions.has(r)).length*20;score-=priorIds.has(a.id)?100:0;return {a,score,n};}).sort((a,b)=>b.score-a.score||a.n-b.n).slice(0,80).map(x=>x.a);
 if(!ranked.length)throw Error('现有动作库没有符合场景和限制的候选，可以修改需求或另用联网搜索补库。');
 return {sceneId,question:text,allEligible:all,input:{scene:{name:scene.name,place:scene.place},purpose:text,alreadySelectedIds:[...scene.activityIds],previousSuggestions:previous.map(x=>({activityId:x.activityId,priority:x.priority})).slice(-24),candidates:ranked,limits:{maxPreferred:8,maxRelated:8,maxQuote:240},rule:'只建候选池，不安排今天、不生成新动作或组次，不改变用户已经选好的清单。'}};
}
export function validateScenePool(output,built){
 if(!output||!['ok','empty','clarify'].includes(output.status))return {ok:false,errors:['status应为ok/empty/clarify']};
 if(output.status!=='ok')return {ok:true,status:output.status,reason:clip(output.reason||output.question,300)||'请补充场景目的。'};
 if(!Array.isArray(output.candidates)||!output.candidates.length||output.candidates.length>16)return {ok:false,errors:['建议应为1～16项']};
 const map=new Map(built.input.candidates.map(a=>[a.id,a])),seen=new Set(),out=[],errors=[];
 for(const c of output.candidates){if(!c||!map.has(c.activityId)||seen.has(c.activityId)){errors.push('动作必须来自本次候选且不能重复');continue;}seen.add(c.activityId);const a=map.get(c.activityId),quote=clip(c.evidenceQuote,240),reason=clip(c.reason,180);if(!['preferred','related'].includes(c.priority)||!reason||quote.length<4||!a.evidence.includes(quote)||forbidden.test(reason)){errors.push(`${a.name}需要有效的分组、理由和逐字动作库依据`);continue;}out.push({activityId:a.id,name:a.name,priority:a.needsReview?'related':c.priority,reason,evidenceQuote:quote,needsReview:a.needsReview});}
 if(out.filter(x=>x.priority==='preferred').length>8||out.filter(x=>x.priority==='related').length>8)errors.push('每组最多8项');
 return errors.length?{ok:false,errors}:{ok:true,status:'ok',intent:clip(output.intent,300),suggestions:out};
}
export function mergePoolSuggestions(previous,incoming,built){
 const fresh=new Map(built.allEligible.map(a=>[a.id,a])),map=new Map();for(const s of [...previous,...incoming]){const a=fresh.get(s.activityId);if(a&&a.evidence.includes(s.evidenceQuote))map.set(s.activityId,{...s,name:a.name,priority:a.needsReview?'related':s.priority,needsReview:a.needsReview});}return [...map.values()].slice(-24);
}
export function applyScenePoolSelection(state,bundle,ids,now=new Date()){
 const scene=sceneById(state,bundle.sceneId);if(!scene)throw Error('场景已移除，建议还未保存。');
 const built=buildScenePoolInput(state,bundle.sceneId,bundle.question),current=new Map(built.allEligible.map(a=>[a.id,a]));
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('至少选择一个尚未加入的动作。');
 for(const id of ids){const suggestion=bundle.suggestions.find(x=>x.activityId===id),a=current.get(id);if(!suggestion||!a||!a.evidence.includes(suggestion.evidenceQuote))throw Error('动作资料或当前条件已变化，请重新核对建议，不会覆盖动作池。');}
 const added=ids.filter(id=>!scene.activityIds.includes(id));if(!added.length)throw Error('这些动作已经在池中，不会重复添加。');addSceneActivities(state,scene.id,added,now);scene.poolPurpose=clip(bundle.question,1500);return added;
}
