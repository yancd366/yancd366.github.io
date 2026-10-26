import {regionsInText} from './safety.js';
export const LIBRARY_GROUPS={all:'全部动作',warmup:'热身',main:'正式训练',cooldown:'拉伸与放松',gym:'健身房器械',bodyweight:'自重训练',traditional:'传统功法',office:'办公室',eyes:'眼部休息',face:'面部动作'};
export function activityPhases(a,state={}){
  return [...new Set([a.phase||'main',...(state.activityUses||[]).filter(u=>u.activityId===a.id&&['warmup','main','cooldown'].includes(u.use)).map(u=>u.use)])];
}
export const activityRegions=a=>[...new Set([...(a.primaryRegions||[]),...(a.secondaryRegions||[]),...regionsInText((a.body||[]).join(' '))])];
export function inLibraryGroup(a,group,state={}){
  if(!group||group==='all')return true;
  if(['warmup','main','cooldown'].includes(group))return activityPhases(a,state).includes(group)||group==='cooldown'&&['mobility','recovery'].includes(a.category)&&a.phase==='cooldown';
  if(group==='gym')return a.system==='gym'||a.equipment.some(e=>['dumbbell','barbell','kettlebell','smith','rack','machine','cable','bench'].includes(e));
  if(group==='bodyweight')return ['bodyweight','convict'].includes(a.system)||a.category==='strength'&&!a.equipment.length;
  if(group==='traditional')return /八段锦|五禽戏|太极|易筋经/.test([a.name,...a.aliases].join(' '));
  if(group==='office')return a.places.includes('office');
  if(group==='eyes')return a.body.some(x=>/眼部|视觉/.test(x));
  if(group==='face')return a.body.some(x=>/五官|面部|面肌|脸部|唇部|下颌/.test(x));
  return false;
}
