import { redFlagCheck } from './abilities.js';

const REGION_NAMES={chest:'胸部',back:'背部',shoulders:'肩部',arms:'上臂',core:'腰腹',hips_legs:'臀腿 / 膝',forearms_wrists:'前臂 / 手腕',calves_ankles:'小腿 / 足踝',neck:'颈部'};
const PATTERNS={
  chest:/胸部|胸口|胸肌|胸/,back:/上背|背部|背阔|菱形肌|斜方肌|肩胛|背/,shoulders:/肩|三角肌/,arms:/上臂|肱二|肱三|肱肌|手臂|胳膊|肘/,
  core:/腰|腹|下背|躯干|核心|竖脊/,hips_legs:/臀|髋|膝|大腿|股四|腘绳|股二|内收|腿/,
  forearms_wrists:/前臂|小臂|腕|手掌|手指|手部|拇指|肘|握力|肱桡/,calves_ankles:/小腿|踝|足|脚|跟腱|腓肠|比目鱼/,neck:/颈|脖子/
};
const goalWords=/想.{0,12}(?:练|锻炼|训练)|希望.{0,12}(?:练|锻炼|训练)|强化|加强|增强|提升.{0,6}(?:力量|能力)|训练|锻炼|练(?:胸|背|肩|腿|手臂|前臂|小臂|足弓|核心|腹)/;
const clauses=text=>String(text||'').split(/[，,。；;！？!?\n]|但是|不过|但/).map(x=>x.trim()).filter(Boolean);
export function regionsInText(text){
  return Object.entries(PATTERNS).filter(([region,pattern])=>pattern.test(region==='hips_legs'?String(text).replace(/小腿/g,''):text)).map(([region])=>region);
}
// 只按用户明说的部位与疼痛词分类，不从目标、照片或诊断名称推断疼痛。
export function movementIntent(text){
  const painRegions=new Set(),targetRegions=new Set();let hasPain=false,unknownPain=false,hasGoals=false;
  for(const clause of clauses(text)){
    if(goalWords.test(clause)){hasGoals=true;regionsInText(clause).forEach(x=>targetRegions.add(x));}
    for(const match of clause.matchAll(/疼痛|疼|痛/g)){
      const before=clause.slice(0,match.index),after=clause.slice(match.index+match[0].length);
      const namedNegation=/(?:没有|并无|无|没)(?:左|右|两|双)?(?:胸口|胸部|胸|膝盖|膝|肩膀|肩部|肩|手腕|前臂|小臂|脚踝|足弓|足底|脚|颈部|脖子|腰部|腰|背部|背|腹部|小腿|大腿|肘|手臂)(?:的)?$/;
      if(namedNegation.test(before)||/(?:没有|并无|无|不|没|未)(?:任何|什么|明显|感到|觉得|出现|有)?$/.test(before)||/^(?:已经|已|现在)?(?:消失|没有了|没了|好了)/.test(after))continue;
      hasPain=true;
      const prefix=before.split(/不疼|没疼|不痛|没有疼痛|无痛/).at(-1).slice(-16);
      const regions=regionsInText(prefix).length?regionsInText(prefix):regionsInText(after.slice(0,14));
      if(!regions.length)unknownPain=true;
      regions.forEach(x=>painRegions.add(x));
    }
  }
  return {hasPain,unknownPain,hasGoals,painRegions:[...painRegions],targetRegions:[...targetRegions]};
}
const texts=(profile={},request={})=>[profile.bodyNotes,request.bodyToday,request.userText,request.painContextText].filter(x=>typeof x==='string'&&x.trim());
export const excludedPainRegions=(profile={},request={})=>[...new Set(texts(profile,request).flatMap(text=>movementIntent(text).painRegions))];
export function preservePainContext(previous,next){
  const context=[previous.painContextText,previous.bodyToday,previous.userText].filter(x=>x&&movementIntent(x).hasPain);
  return {...next,painContextText:[...new Set(context)].join('\n')};
}
export function safetyContext(profile,request={}) {
  return JSON.stringify({bodyNotes:profile.bodyNotes||'',restrictions:profile.restrictions||[],experience:profile.experience,readiness:request.readiness,bodyToday:request.bodyToday||'',...(request.userText?{userText:request.userText}:{}),...(request.painContextText?{painContextText:request.painContextText}:{})});
}
export function safetyBlock(profile={},request={}) {
  if(profile.ageRange==='under18')return '当前自动安排面向成年人；未成年人请先由合适的教练或专业人员制定安排。';
  if(profile.restrictions?.length)return '身体档案有待明确的专业限制，暂不自动安排训练；仍可浏览动作与记录已完成的活动。';
  for(const text of texts(profile,request)){
    const intent=movementIntent(text);
    if(redFlagCheck(text).status==='refer'||(intent.hasPain&&intent.painRegions.includes('chest'))||/剧烈|持续加重|明显加重|无法负重|不能走|无法走/.test(text))return '身体档案或本次描述中的症状需要先明确是否适合活动，这次暂停自动安排，请咨询医生或康复专业人员。';
    if(/医生|医嘱|诊断|确诊|术后|手术|损伤|扭伤|骨折|康复|炎|疾病/.test(text))return '身体档案或本次描述中有待明确的专业限制；本版不按诊断生成训练方案，请先确认可活动的范围。';
    if(intent.unknownPain)return '请先说明哪里疼；明确部位后会避开相关动作，再安排其他部位。';
    if(/不舒服|不适/.test(text)&&!intent.hasPain&&!/(?:没有|无|没什么)(?:不舒服|不适)/.test(text))return '请先说明是疼痛、还是单纯想活动或强化某个部位；本版不判断原因。';
  }
  const pain=excludedPainRegions(profile,request);
  if(request.readiness==='discomfort'&&!pain.length)return '请在今天想怎么练中说明哪里疼；明确后会避开相关动作，或把状态改回实际的训练状态。';
  if(profile.bodyNotes?.trim()&&!movementIntent(profile.bodyNotes).hasPain&&!movementIntent(profile.bodyNotes).hasGoals&&!/无痛|不疼|没有疼痛/.test(profile.bodyNotes))return '身体档案有待明确的限制，暂不自动安排训练；仍可浏览动作与记录已完成的活动。';
  return null;
}
// 自动排除也检查握持、支撑和站立时使用的部位。
export function activityLoadRegions(activity){
  const regions=new Set([...(activity.primaryRegions||[]),...(activity.secondaryRegions||[]),...(activity.loadedRegions||[]),...regionsInText((activity.body||[]).join(' '))]);
  const posture=(activity.setup||[]).join(' '),movement=[activity.name,activity.familyId,...(activity.steps||[])].join(' ');
  if(activity.category!=='recovery'){
    if(activity.category==='strength'&&regions.has('hips_legs'))regions.add('calves_ankles');
    if(activity.category==='strength'&&['chest','back','shoulders','arms'].some(x=>regions.has(x))){regions.add('forearms_wrists');regions.add('arms');}
    if((/全身/.test((activity.body||[]).join(' '))&&activity.id!=='walk')||activity.kind==='routine')Object.keys(REGION_NAMES).forEach(x=>regions.add(x));
    if(!/坐|仰卧|侧卧|俯卧|躺|卧姿|床上/.test(posture)){regions.add('hips_legs');regions.add('calves_ankles');}
    if(/跪|四点/.test(posture)){regions.add('hips_legs');regions.add('calves_ankles');}
    if(/四点|俯卧撑|平板|爬行|熊爬|鸟狗|倒立|悬垂|双杠|手掌.*撑|双手.*撑|双手.*扶|一手.*扶|扶墙|扶椅|扶物/.test(posture+' '+movement)){regions.add('shoulders');regions.add('arms');regions.add('forearms_wrists');regions.add('core');}
    if((activity.equipment||[]).some(x=>['dumbbell','barbell','kettlebell','band','cable','pullup_bar','dip_bars','jump_rope'].includes(x))){regions.add('forearms_wrists');regions.add('arms');}
    if((activity.equipment||[]).some(x=>['barbell','kettlebell','jump_rope'].includes(x))||activity.system==='boxing'){regions.add('shoulders');regions.add('core');}
    if(activity.category==='strength'&&!/坐/.test(posture)){regions.add('core');}
    if(activity.system==='boxing'||activity.category==='cardio'){regions.add('hips_legs');regions.add('calves_ankles');}
  }
  return [...regions];
}
export function activityAllowedByPain(activity,profile,request){
  if(!activity)return false;
  const pain=excludedPainRegions(profile,request);if(!pain.length)return true;
  if(activity.personal&&!(activity.primaryRegions?.length||activity.secondaryRegions?.length||activity.loadedRegions?.length))return false;
  return !activityLoadRegions(activity).some(region=>pain.includes(region));
}
export function painConstraintMessage(profile,request){
  const pain=excludedPainRegions(profile,request);
  return pain.length?`已避开你提到疼痛的部位：${pain.map(x=>REGION_NAMES[x]).join('、')}，包括相关拉伸、热身、握持和支撑动作；若其他动作引起不适，请停止。`:'';
}
export const textMentionsLimits=text=>/疼|痛|不舒服|不适|伤|麻|肿|扭|医生|医嘱|避免|避开|别做|不要做|不能做|不想做/.test(text||'');
export function canonicalMovement(a){return a?.canonicalId||a?.id;}
export function eligibleRisk(a,profile){return !a.requiresGuidance&&(a.tier??1)<=(profile.experience==='regular'?2:1);}
