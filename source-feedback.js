import {esc} from './ui.js';
export const PRACTICE_STATUS={not_yet:'还没练 · 先记想法',partial:'练了部分',complete:'完整练过'};
export const NEXT_USE={again:'下次还想用',review:'还需核对',pause:'暂不使用'};
const day=now=>`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
export function validateFeedback(x){
 if(!x||!/^feedback-[\w-]+$/.test(x.id||'')||typeof x.knowledgeId!=='string'||!x.knowledgeId||!Object.hasOwn(PRACTICE_STATUS,x.practice)||!Object.hasOwn(NEXT_USE,x.nextUse)||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!Number.isFinite(Date.parse(x.date))||new Date(x.date+'T12:00:00Z').toISOString().slice(0,10)!==x.date)throw Error('实践反馈格式无效。');
 for(const [key,max] of [['note',2000],['practiced',500]])if(typeof x[key]!=='string'||x[key].length>max)throw Error('实践反馈文字过长或格式无效。');
 if(!x.note.trim()&&!x.practiced.trim())throw Error('请写一点感受或本次练习内容。');
 if(!Number.isFinite(Date.parse(x.createdAt))||!Number.isFinite(Date.parse(x.updatedAt)))throw Error('反馈日期无效。');
 return x;
}
export function saveSourceFeedback(state,knowledgeId,input,now=new Date()){
 if(!state.knowledge.some(k=>k.id===knowledgeId))throw Error('原收藏已不存在，请返回知识库。');
 const old=input.id?(state.sourceFeedback||[]).find(x=>x.id===input.id&&x.knowledgeId===knowledgeId):null;
 if(input.id&&!old)throw Error('这条反馈已不存在，请重新打开。');
 if(String(input.date)>day(now))throw Error('不能把未来日期记为已发生的反馈。');
 const x=validateFeedback({id:old?.id||`feedback-${crypto.randomUUID()}`,knowledgeId,date:String(input.date||day(now)),practice:input.practice,nextUse:input.nextUse,note:String(input.note||'').trim(),practiced:String(input.practiced||'').trim(),createdAt:old?.createdAt||now.toISOString(),updatedAt:now.toISOString()});
 state.sourceFeedback ||= [];if(old)Object.assign(old,x);else state.sourceFeedback.push(x);return x;
}
export function sourceFeedbackHTML(state,knowledgeId){
 const rows=(state.sourceFeedback||[]).filter(x=>x.knowledgeId===knowledgeId).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
 return `<p class="helper left">你的个人使用笔记，不代表效果验证；保存不会增加训练次数，也不改变推荐权限。</p><button class="primary" data-feedback-new="${esc(knowledgeId)}">写一次反馈</button><div class="feedback-timeline">${rows.map(x=>`<article class="feedback-entry"><div class="feedback-meta"><time>${esc(x.date)}</time><span>${esc(PRACTICE_STATUS[x.practice])}</span></div>${x.practiced?`<p><strong>本次练习</strong> ${esc(x.practiced)}</p>`:''}<p class="feedback-note">${esc(x.note)}</p><span class="badge">${esc(NEXT_USE[x.nextUse])}</span><div class="knowledge-management"><button class="secondary" data-feedback-edit="${esc(x.id)}">编辑</button><button class="secondary" data-feedback-delete="${esc(x.id)}">删除反馈</button></div></article>`).join('')||'<p class="muted">还没有反馈。读完、试过或想留个提醒时，都可以写。</p>'}</div>`;
}
export function feedbackFormHTML(knowledgeId,x={},now=new Date()){
 const options=(map,current)=>Object.entries(map).map(([v,l])=>`<option value="${v}" ${v===current?'selected':''}>${l}</option>`).join('');
 return `<form id="source-feedback-form" data-knowledge="${esc(knowledgeId)}" data-id="${esc(x.id||'')}"><p class="helper left">只记录你自己的实践和感受，不会自动记成一次训练。</p><label>日期<input type="date" name="date" required max="${day(now)}" value="${esc(x.date||day(now))}"></label><label>实践情况<select name="practice">${options(PRACTICE_STATUS,x.practice||'not_yet')}</select></label><label>本次练了什么（可选）<textarea name="practiced" maxlength="500" placeholder="例如：只做了视频里的前两个动作">${esc(x.practiced||'')}</textarea></label><label>我的感受与提醒<textarea name="note" maxlength="2000" rows="4" placeholder="好掌握吗？哪些想再练，哪些需要核对？">${esc(x.note||'')}</textarea></label><label>下次怎么用<select name="nextUse">${options(NEXT_USE,x.nextUse||'review')}</select></label><p class="helper left">如有疼痛，先停止相关练习，不用反复尝试来验证视频效果。</p><button class="primary full" type="submit">保存反馈</button></form>`;
}
