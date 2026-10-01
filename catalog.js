import * as core from './library/core.js';
import * as gym from './library/gym.js';
import * as bodyweight from './library/bodyweight.js';
import * as convict from './library/convict.js';
import * as isometric from './library/isometric.js';
import * as boxing from './library/boxing.js';
import * as mobility from './library/mobility.js';
export const goals = { balanced: '综合活动', strength: '力量', mobility: '活动度', coordination: '协调与平衡', cardio: '心肺', recovery: '放松' };
export const places = { home: '居家', office: '办公室', gym: '健身房' };
export const equipmentLabels = {
  mat: '瑜伽垫', band: '弹力带', dumbbell: '哑铃', kettlebell: '壶铃', pullup_bar: '单杠 / 引体杆', jump_rope: '跳绳',
  bench: '训练凳', barbell: '杠铃', rack: '深蹲架', smith: '史密斯架', cable: '绳索器械', machine: '固定器械', dip_bars: '双杠', heavy_bag: '沙袋'
};
// Training systems group the library by origin and method; they do not affect plan scoring.
export const systems = { general: '日常活动', gym: '健身房器械', bodyweight: '自重训练', convict: '囚徒健身', isometric: '等长训练', boxing: '拳击基础' };
export const tiers = { 1: '入门', 2: '中级', 3: '高级' };
// 训练阶段:与 category 是两个维度(放松拉伸是 mobility 类但属 cooldown 阶段)。
export const phases = { warmup: '热身', main: '正式', cooldown: '放松' };
// User-facing regions are deliberately broader than anatomical muscle tags.
export const bodyRegions = {
  chest: { label:'胸', detail:'胸部推举与推撑', common:true },
  back: { label:'背', detail:'背部与肩胛周围', common:true },
  shoulders: { label:'肩', detail:'肩部力量与控制', common:true },
  arms: { label:'手臂', detail:'上臂前侧、后侧', common:true },
  core: { label:'核心', detail:'腹部、侧腹与腰背稳定', common:true },
  hips_legs: { label:'臀腿', detail:'臀部、大腿前后侧及内外侧', common:true },
  forearms_wrists: { label:'前臂与手腕', detail:'前臂、握力与腕部控制', common:false },
  calves_ankles: { label:'小腿与足踝', detail:'小腿、足部与踝部控制', common:false },
  neck: { label:'颈部', detail:'需明确基础与适用动作', common:false }
};
export const regionLabel = ids => ids.map(id=>bodyRegions[id]?.label).filter(Boolean).join('、');
const modules = [core, gym, bodyweight, convict, isometric, boxing, mobility];
export const sources = Object.assign({}, ...modules.map(m => m.sources));
// The doses are illustrative time boxes, not individualized exercise prescriptions.
// Every candidate needs per-exercise editorial/clinical review before public release.
// 例外（2026-10-01 用户决定）：囚徒健身深蹲第 5 式就是普通的徒手深蹲，按入门动作对待、可以自动安排；
// 其余第 4 式以上仍需先评估或指导。
const BASIC_BODYWEIGHT = { 'cc-squat-5': { tier: 1, difficulty: '入门 · 徒手深蹲（囚徒健身第 5 式）' } };
export const activities = modules.flatMap(m => m.activities).map(a=>{
  if(BASIC_BODYWEIGHT[a.id])a={...a,...BASIC_BODYWEIGHT[a.id]};
  const guarded=!BASIC_BODYWEIGHT[a.id]&&(a.familyId==='cc-hspu'||(a.familyId==='cc-bridge'&&a.level>=3)||a.id==='cc-squat-1'||a.tier===3||(a.system==='convict'&&a.level>3));
  return {...a,canonicalId:a.id==='cc-pushup-1'?'wallpush':a.id,
    requiresGuidance:guarded, ...(guarded?{selectable:false,tier:3,difficulty:'需先评估或指导'}:{}),
    standardsVerified:false};
});
export const relations = modules.flatMap(m => m.relations);
// 个人动作：和公共动作同一种单元格式，追加在 activities 末尾，所有模块照常查找、筛选、安排。
// 这是 state.personalActivities 的派生缓存，由 app 在读取 / 保存数据后同步；公共动作不会被改动。
export const PUBLIC_ACTIVITY_COUNT = activities.length;
export const publicActivities = activities.slice();
let index = new Map(activities.map(a => [a.id, a]));
export const activityById = id => index.get(id);
export function setPersonalActivities(list = []) {
  activities.splice(PUBLIC_ACTIVITY_COUNT, activities.length - PUBLIC_ACTIVITY_COUNT, ...list);
  index = new Map(activities.map(a => [a.id, a]));
}
// Private user notes live in browser storage, never in a distributable JavaScript bundle.
export const seedNotes = [];
export const seedKnowledge = [];
