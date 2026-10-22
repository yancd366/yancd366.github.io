// Whole-video resources, separate from exercise extraction and workout records.
// All matching and validation is local. Nothing here fetches media or calls AI.
import {bodyRegions,places,equipmentLabels} from './catalog.js';
import {safeURL,availableEquipment} from './domain.js';
import {safetyBlock,excludedPainRegions,regionsInText,movementIntent} from './safety.js';
import {abilityBlock} from './abilities.js';
import {esc,icon} from './ui.js';
import {cleanKnowledgeTitle} from './knowledge-presentation.js';

const levels={beginner:'入门也可跟练',regular:'需要规律训练基础'};
const unique=xs=>[...new Set(xs)];
const validDuration=ms=>typeof ms==='number'&&Number.isFinite(ms)&&ms>0&&ms<=86400000;
const sourceFor=(knowledge,capture)=>{
  const original=safeURL(capture?.rawUrl),edited=safeURL(knowledge.url);
  // An edited card URL must not borrow the old capture's duration or body tags.
  if(original&&edited&&original.split('#')[0]!==edited.split('#')[0])return null;
  return original||edited;
};
export function followAlongDuration(knowledge,capture){
  if(knowledge.followAlong&&sourceFor(knowledge,capture)!==knowledge.followAlong.sourceUrl)return {ms:null,source:null,label:'来源变化，时长需重新确认'};
  const actual=capture?.resolvedSource?.durationMs;
  if(validDuration(actual))return {ms:actual,source:'provider',label:'视频文件时长'};
  const user=knowledge.followAlong?.userDurationMs;
  return validDuration(user)?{ms:user,source:'user',label:'你填写的时长'}:{ms:null,source:null,label:'视频时长待补充'};
}
export function durationLabel(ms){
  if(!validDuration(ms))return '时长待补充';
  const seconds=Math.ceil(ms/1000),m=Math.floor(seconds/60),s=seconds%60;
  return `${m?`${m} 分钟`:''}${s?`${m?' ':''}${s} 秒`:''}`;
}
// Used by backup validation too: unknown fields never silently mean "no equipment".
export function validateFollowAlong(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)throw new Error('跟练资源格式无效。');
  const list=(key,vocabulary)=>{
    if(!Array.isArray(value[key])||value[key].length>Object.keys(vocabulary).length||value[key].some(x=>!Object.hasOwn(vocabulary,x))||unique(value[key]).length!==value[key].length)throw new Error('跟练资源的部位、器械或场地无效。');
  };
  list('primaryRegions',bodyRegions);list('secondaryRegions',bodyRegions);list('places',places);list('equipment',equipmentLabels);
  if(value.primaryRegions.some(x=>value.secondaryRegions.includes(x)))throw new Error('主要与辅助部位不能重复。');
  if(!['unknown','beginner','regular'].includes(value.level)||typeof value.equipmentKnown!=='boolean'||typeof value.recommend!=='boolean'||typeof value.description!=='string'||value.description.length>200||!safeURL(value.sourceUrl)||typeof value.confirmedAt!=='string'||!Number.isFinite(Date.parse(value.confirmedAt))||value.userDurationMs!==null&&!validDuration(value.userDurationMs))throw new Error('跟练资源的时长或确认信息无效。');
  return value;
}
export function followAlongResource(knowledge,capture){
  if(knowledge.status!=='saved'||!knowledge.followAlong)return null;
  try{validateFollowAlong(knowledge.followAlong);}catch{return null;}
  const resource=knowledge.followAlong,url=sourceFor(knowledge,capture);
  if(!url||url!==resource.sourceUrl)return null;
  const duration=followAlongDuration(knowledge,capture);
  const missing=[!resource.primaryRegions.length&&'主要部位',!duration.ms&&'实际时长',!resource.places.length&&'场地',!resource.equipmentKnown&&'器械要求',resource.level==='unknown'&&'训练基础要求'].filter(Boolean);
  return {...resource,id:knowledge.id,title:cleanKnowledgeTitle(knowledge.title),creator:knowledge.sourceTitle||capture?.sourceTitle||'我的收藏',url,duration,missing};
}
export function saveFollowAlong(state,id,input,now=new Date()){
  const knowledge=state.knowledge.find(k=>k.id===id),capture=state.captures?.find(c=>c.knowledgeId===id);
  if(!knowledge||knowledge.status!=='saved')throw new Error('请先将有原链接的内容确认入库。');
  if(!sourceFor(knowledge,capture))throw new Error('卡片链接与原始来源不一致。请在“编辑内容”中恢复原链接，或将新链接另行收藏，不能沿用旧视频的资料。');
  if(capture&&knowledge.followAlong&&knowledge.followAlong.sourceUrl!==sourceFor(knowledge,capture))throw new Error('原始来源已经变化，请将新链接另行收藏后确认跟练，避免沿用旧视频资料。');
  if(!input.isFollowAlong)throw new Error('请先确认这是一套可直接打开跟练的视频。');
  const raw=String(input.minutes??'').trim(),minutes=raw===''?null:Number(raw);
  if(minutes!==null&&(!Number.isFinite(minutes)||minutes<=0||minutes>1440))throw new Error('请填写实际视频时长，范围为 0～1440 分钟，不知道就留空。');
  const value={version:1,sourceUrl:sourceFor(knowledge,capture),description:String(input.description||'').trim().slice(0,200),primaryRegions:unique(input.primaryRegions||[]),secondaryRegions:unique(input.secondaryRegions||[]),places:unique(input.places||[]),equipment:unique(input.equipment||[]),equipmentKnown:Boolean(input.equipmentKnown),level:input.level||'unknown',recommend:Boolean(input.recommend),userDurationMs:validDuration(capture?.resolvedSource?.durationMs)||minutes===null?null:Math.round(minutes*60000),confirmedAt:now.toISOString()};
  validateFollowAlong(value);
  const resource=followAlongResource({...knowledge,followAlong:value},capture);
  if(resource.recommend&&resource.missing.length)throw new Error(`推荐前还需确认：${resource.missing.join('、')}。也可关闭“用于跟练推荐”，先保存。`);
  knowledge.followAlong=value;knowledge.updatedAt=now.toISOString();return value;
}
export function followAlongRecommendations(state,request={}){
  const selected=state.settings?.planningReferences,mode=selected?.mode||(state.settings?.useCorpus===false?'none':'auto');
  if(mode==='none')return {rows:[],reason:''};
  const all=state.knowledge.map(k=>followAlongResource(k,state.captures?.find(c=>c.knowledgeId===k.id))).filter(r=>r?.recommend);
  if(!all.length)return {rows:[],reason:''};
  const blocked=safetyBlock(state.profile,request)||abilityBlock(state.assessments||[]);
  if(blocked||state.draft?.pausedForDiscomfort)return {rows:[],reason:'当前有待明确的身体限制，暂不推荐整套跟练；收藏仍可在知识库查看。'};
  if(excludedPainRegions(state.profile,request).length||request.readiness&&request.readiness!=='normal')return {rows:[],reason:'整套视频的支撑和负荷无法逐项核实；疼痛或状态不佳时暂不自动推荐跟练。'};
  if(request.avoid?.length||/避开|避免|不要|别做|不想|不能|不做|少练/.test([request.userText,request.bodyToday,request.preferences].filter(Boolean).join(' ')))return {rows:[],reason:'本次有需避开的动作或部位，暂不自动推荐无法逐项核对的整套视频。'};
  const wanted=unique((request.targetRegions?.length?request.targetRegions:movementIntent(request.userText).targetRegions).filter(x=>Object.hasOwn(bodyRegions,x)));
  if(!wanted.length)return {rows:[],reason:'选择想练的部位后，这里会显示相关的跟练视频。'};
  if(!places[request.place])return {rows:[],reason:''};
  const equipment=availableEquipment(state.profile,request);
  const rows=all.filter(r=>!r.missing.length&&r.places.includes(request.place)&&r.equipment.every(x=>equipment.includes(x))&&(r.level!=='regular'||state.profile.experience==='regular')&&(mode!=='selected'||selected.selectedIds?.includes(r.id))&&(!Number.isFinite(request.minutes)||r.duration.ms<=request.minutes*60000))
    .map(r=>({...r,primaryHits:wanted.filter(x=>r.primaryRegions.includes(x)),secondaryHits:wanted.filter(x=>r.secondaryRegions.includes(x))}))
    .filter(r=>r.primaryHits.length||r.secondaryHits.length)
    .sort((a,b)=>b.primaryHits.length-a.primaryHits.length||b.secondaryHits.length-a.secondaryHits.length||b.confirmedAt.localeCompare(a.confirmedAt))
    .slice(0,3).map(r=>({...r,reason:`${r.primaryHits.length?'主要匹配':'辅助涉及'}：${(r.primaryHits.length?r.primaryHits:r.secondaryHits).map(x=>bodyRegions[x].label).join('、')} · 覆盖本次 ${r.primaryHits.length+r.secondaryHits.length}/${wanted.length} 个目标部位`}));
  return {rows,reason:rows.length?'':'没有符合本次部位、时长、场地和器械条件的已确认跟练视频。'};
}
export function followAlongRecommendationsHTML(state,request){
  const result=followAlongRecommendations(state,request);
  if(!result.rows.length&&!result.reason)return '';
  return `<section class="follow-along-recommendations" aria-labelledby="follow-along-title"><div class="follow-along-heading"><span>${icon('play')}</span><div><small>另一种练法</small><h2 id="follow-along-title">也可以选择跟练视频</h2></div></div><p class="small muted">作为当前安排的替代选择，不会额外叠加训练；打开视频不算练完。</p>${result.rows.map(r=>`<article class="follow-along-option"><div class="follow-along-duration">${icon('play')} ${durationLabel(r.duration.ms)}<small>${esc(r.duration.label)}</small></div><div class="follow-along-option-copy"><h3>${esc(r.title)}</h3>${r.description?`<p>${esc(r.description)}</p>`:''}<span class="small muted">${esc(r.reason)}</span><span class="small muted">${esc(r.creator)} · ${r.equipment.map(x=>equipmentLabels[x]).join('、')||'无需器械'}</span></div><div class="follow-along-option-actions"><a class="secondary" data-follow-open="${esc(r.id)}" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">打开原视频 ${icon('arrow')}</a><button class="text-button" data-open-knowledge="${esc(r.id)}">查看笔记</button></div></article>`).join('')||`<p class="follow-along-empty">${esc(result.reason)}</p>`}</section>`;
}
export function followAlongDetailHTML(knowledge,capture){
  const r=followAlongResource(knowledge,capture);
  if(!r&&!knowledge.followAlong&&knowledge.contentType!=='follow_along')return '';
  const duration=r?.duration||followAlongDuration(knowledge,capture);
  return `<section class="follow-along-resource"><span class="notebook-media-label">整套跟练资源</span><h2>练什么 · 练多久</h2><p>${esc(r?.description||'核对跟练部位和使用条件，之后可在相关训练下方找到它。')}</p><div class="follow-along-resource-facts"><strong>${durationLabel(duration.ms)}</strong><span>${esc(duration.label)}</span><span>${r?.primaryRegions.length?r.primaryRegions.map(x=>bodyRegions[x].label).join('、'):'部位待确认'}</span>${r?.secondaryRegions.length?`<span>辅助：${r.secondaryRegions.map(x=>bodyRegions[x].label).join('、')}</span>`:''}</div><p class="small muted">${r?(r.missing.length?`尚缺：${r.missing.join('、')}。`:r.recommend?'已允许相关训练推荐；不等于自动加入训练计划。':'仅收藏，暂不用于跟练推荐。'):knowledge.followAlong?'来源或资料已变更，旧资料已暂停推荐；请重新确认。带原始解析的卡片换链接时，请另行收藏新来源。':'原视频已保留，不需要先把动作逐个加入动作库。'}</p><button class="secondary" data-follow-edit="${esc(knowledge.id)}">${r?'修改跟练资料':'确认跟练资料'} ${icon('edit')}</button></section>`;
}
export function followAlongFormHTML(knowledge,capture){
  const sourceAligned=!knowledge.followAlong||knowledge.followAlong.sourceUrl===sourceFor(knowledge,capture);
  const r=sourceAligned?knowledge.followAlong||{}:{},duration=followAlongDuration(knowledge,capture);
  const mentioned=sourceAligned?regionsInText((knowledge.claims||[]).map(c=>c.evidenceQuote||c.text).join(' ')):[];
  const choices=(name,entries,chosen)=>entries.map(([id,label])=>`<label class="check-pill"><input type="checkbox" name="${name}" value="${id}" ${chosen?.includes(id)?'checked':''}><span>${esc(label)}</span></label>`).join('');
  return `<p class="helper left">保留整套视频，相关训练时可打开跟练；知识入库和动作提取仍各自独立。</p>${!sourceAligned?'<p class="notice">来源已变化，旧的部位、条件和时长已清空，请重新核对。</p>':''}<form id="follow-along-form" data-id="${esc(knowledge.id)}"><div class="follow-form-error notice error" role="alert" hidden></div><label class="checkbox-line"><input name="isFollowAlong" type="checkbox" required ${sourceAligned&&knowledge.followAlong?'checked':''}>我确认这是可直接打开跟练的视频，不只是训练讲解</label><label>一句话介绍<textarea name="description" maxlength="200" rows="2" placeholder="简单写练什么，不必列出每个动作">${esc(r.description||'')}</textarea></label><fieldset><legend>主要练哪些部位</legend>${mentioned.length?`<p class="small muted">现有笔记提到 ${mentioned.map(x=>bodyRegions[x].label).join('、')}；请按实际跟练内容选择。</p>`:''}<div class="equipment-checks">${choices('primaryRegions',Object.entries(bodyRegions).map(([k,v])=>[k,v.label]),r.primaryRegions)}</div></fieldset><label>实际视频时长（分钟）<input name="minutes" type="number" min="0.01" max="1440" step="0.01" ${duration.source==='provider'?'readonly':''} value="${duration.source==='provider'?Math.round(duration.ms/60000*100)/100:r.userDurationMs?Math.round(r.userDurationMs/60000*100)/100:''}" placeholder="不知道就留空，不从标题猜测"></label><p class="small muted">${duration.source==='provider'?`读取到的视频文件时长：${durationLabel(duration.ms)}。`: '请填写打开原视频后看到的时长，不是作者建议的训练总时长。'}</p><fieldset><legend>适合在哪里跟练</legend><div class="equipment-checks">${choices('places',Object.entries(places),r.places)}</div></fieldset><label>适用训练基础<select name="level"><option value="unknown" ${!r.level||r.level==='unknown'?'selected':''}>还不确定</option>${Object.entries(levels).map(([id,label])=>`<option value="${id}" ${r.level===id?'selected':''}>${label}</option>`).join('')}</select></label><details class="follow-form-conditions"><summary>选择所需器械${r.equipment?.length?`（${r.equipment.map(x=>equipmentLabels[x]).join('、')}）`:'（无器械可不展开）'}</summary><div class="equipment-checks">${choices('equipment',Object.entries(equipmentLabels),r.equipment)}</div></details><label class="checkbox-line"><input name="equipmentKnown" type="checkbox" ${r.equipmentKnown?'checked':''}>已核对器械要求（上面不选表示无需器械）</label><details class="follow-form-conditions"><summary>辅助涉及的部位（可不选）</summary><fieldset><legend>辅助部位</legend><div class="equipment-checks">${choices('secondaryRegions',Object.entries(bodyRegions).map(([k,v])=>[k,v.label]),r.secondaryRegions)}</div></fieldset></details><label class="checkbox-line"><input name="recommend" type="checkbox" ${!knowledge.followAlong||r.recommend?'checked':''}>用于相关部位的跟练推荐</label><p class="helper left">推荐前需确认部位、时长、场地、器械和训练基础。资料不全可关闭推荐先保存；此设置不等于允许 AI 按视频编排动作。</p><button class="primary full" type="submit">保存跟练资料 ${icon('check')}</button></form>`;
}
