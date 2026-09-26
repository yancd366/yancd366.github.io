export function safetyContext(profile,request={}) {
  return JSON.stringify({bodyNotes:profile.bodyNotes||'',restrictions:profile.restrictions||[],experience:profile.experience,readiness:request.readiness,bodyToday:request.bodyToday||''});
}
export function safetyBlock(profile,request={}) {
  if(profile.ageRange==='under18')return '当前自动安排面向成年人；未成年人请先由合适的教练或专业人员制定安排。';
  if(request.readiness==='discomfort'||request.bodyToday?.trim())return '今天有身体不适，先记录情况并明确适合的活动范围；本版不自动生成针对症状的方案。';
  if(profile.bodyNotes?.trim()||profile.restrictions?.length)return '身体档案有待明确的限制，暂不自动安排训练；仍可浏览动作与记录已完成的活动。';
  return null;
}
// 本地规则读不懂文字；提到不适或要避开的动作时，不能拿本地安排顶替 AI。
export const textMentionsLimits=text=>/疼|痛|不舒服|不适|伤|麻|肿|扭|医生|医嘱|避免|避开|别做|不要做|不能做|不想做/.test(text||'');
export function canonicalMovement(a){return a?.canonicalId||a?.id;}
export function eligibleRisk(a,profile){
  return !a.requiresGuidance && (a.tier??1)<=(profile.experience==='regular'?2:1);
}
