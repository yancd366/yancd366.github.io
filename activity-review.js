// User confirmation of an AI suggestion or a manual entry. No network or writes.
import {activities} from './catalog.js';
import {normalizeActivityDraft} from './personal-activities.js';
const squash=value=>String(value||'').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export const REVIEW_MODES={existing:'关联已有动作',new:'新建我的动作',variant:'保存为已有动作的变式'};
export function reviewDraft(candidate){
  return candidate.draft?structuredClone(candidate.draft):{name:'',description:'',category:'mobility',phase:'warmup',primaryRegions:[],places:['home','gym'],equipment:[],tier:1,impact:'low',minutes:3,system:'general',setup:[],steps:[],cues:[],mistakes:[],dose:''};
}
export function readReviewFields(form,prefix){
  return Object.fromEntries(['name','aliases','description','category','phase','tier','impact','minutes','system','setup','steps','cues','mistakes','dose','customRegions'].map(key=>[key,form.get(prefix+key)]).concat(['primaryRegions','extraRegions','places','equipment'].map(key=>[key,form.getAll(prefix+key)])));
}
export function validateActivityReview(candidates,form,state){
  const known=[...activities,...(state.personalActivities||[]).filter(p=>!activities.some(a=>a.id===p.id))],items=[],errors=[],newNames=new Set();
  for(const [index,candidate]of candidates.entries()){
    if(!form.get(`keep_${index}`))continue;
    const type=String(form.get(`mode_${index}`)||candidate.type),chosen=form.get(`match_${index}`),matchedActivityId=String(chosen===null?candidate.matchedActivityId||'':chosen);
    const fail=(field,message)=>errors.push({index,field,message:`第 ${index+1} 个动作：${message}`});
    if(!REVIEW_MODES[type]){fail(`mode_${index}`,'请选择保存方式。');continue;}
    if(type!=='new'&&!known.some(a=>a.id===matchedActivityId)){fail(`match_${index}`,'请选择要关联的已有动作。');continue;}
    const item={...candidate,index,type,matchedActivityId:type==='new'?null:matchedActivityId,allowPlanning:Boolean(form.get(`allow_${index}`)),use:String(form.get(`use_${index}`)||''),region:String(form.get(`region_${index}`)||''),note:String(form.get(`note_${index}`)||'').trim().slice(0,60),userEdited:candidate.manual===true||type!==candidate.type||matchedActivityId!==(candidate.matchedActivityId||'')};
    if(type!=='existing'){
      const checked=normalizeActivityDraft({...readReviewFields(form,`a${index}_`),secondaryRegions:candidate.draft?.secondaryRegions||[]});
      if(!checked.ok){fail(checked.errors[0].includes('名称')?`a${index}_name`:checked.errors[0].includes('类别')?`a${index}_category`:checked.errors[0].includes('部位')?`a${index}_primaryRegions`:`a${index}_description`,checked.errors[0]);continue;}
      const key=squash(checked.draft.name),clash=known.find(a=>[a.name,...(a.aliases||[])].some(name=>squash(name)===key));
      if(clash){fail(`a${index}_name`,`“${clash.name}”已经在动作库里；可以改为关联它，或给新动作一个不同的名称。`);continue;}
      if(newNames.has(key)){fail(`a${index}_name`,'本次已填写了同名动作，请保留一项或修改名称。');continue;}
      newNames.add(key);item.draft=checked.draft;
      item.userEdited ||= !candidate.draft||JSON.stringify(checked.draft)!==JSON.stringify(normalizeActivityDraft(candidate.draft).draft);
    }
    items.push(item);
  }
  if(!items.length&&!errors.length)errors.push({index:null,field:null,message:'请先勾选至少一个要保存的动作。'});
  return {ok:!errors.length,items,errors};
}
