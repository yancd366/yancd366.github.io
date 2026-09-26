export const abilityDimensions = {
  strength:{label:'力量与肌肉耐力',help:'优先用训练中真实完成的重量、次数、感受；不用先测极限重量。'},
  mobility:{label:'关节活动度与控制',help:'记录哪个动作或方向受限、左右差别、是否疼痛；照片不能直接判断原因。'},
  balance:{label:'平衡与稳定',help:'可记录熟悉的扶稳支撑旁单脚站立体验。测量方式保持一致。'},
  coordination:{label:'协调与运动技能',help:'记录步法、舞蹈、球类等熟练程度和困难点。'},
  cardio:{label:'心肺与耐力',help:'记录步行或其他熟悉活动的时间、距离、说话是否轻松；不要求最大强度测试。'},
  recovery:{label:'恢复与日常状态',help:'睡眠、压力、疲劳、久坐和练后反应。'}
};
export function abilityEntry(input,now=new Date()){
  if(!abilityDimensions[input.dimension])throw new Error('请选择能力维度。');
  if(!String(input.note||'').trim())throw new Error('请写下观察或测量结果。');
  if(!['self_report','measurement','professional'].includes(input.source))throw new Error('请选择信息来源。');
  const date=input.date||now.toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||date>now.toLocaleDateString('en-CA'))throw new Error('请填写有效的既往日期。');
  return {id:globalThis.crypto?.randomUUID?.()||`assessment-${Date.now()}`,dimension:input.dimension,source:input.source,method:String(input.method||'').trim(),note:input.note.trim().slice(0,4000),observedAt:date,createdAt:now.toISOString()};
}
