import { entry, chain } from './entry.js';
// 《囚徒健身》六艺十式。名称与三级标准据原书及公开整理资料交叉核对；
// 标准是原书的进阶门槛，不是个人处方。书中所有动作默认节奏：下放 2 秒、底部停顿 1 秒、发力 2 秒。
export const sources = {
  ccBook: { title: 'Convict Conditioning（中译《囚徒健身》）', author: 'Paul Wade', type: 'book', locator: 'Dragon Door, 2009 · 第二部分 六艺' },
  ccNotes: { title: 'Convict Conditioning Notes（原书摘录与标准）', url: 'https://gist.github.com/avar/1575165', type: 'community_summary' },
  ccNotebook: { title: 'hughbien · Convict Conditioning 读书笔记', url: 'https://github.com/hughbien/notebook/blob/master/convict_conditioning.md', type: 'community_summary' },
  ccLegRaises: { title: 'Convict Conditioning Movement 4: Leg Raises Cheat Sheet', url: 'https://s3.amazonaws.com/4-hour-life-cheat-sheets/Convict+Conditioning+Movement+4+Leg+Raises+-+Cheat+Sheet.pdf', type: 'community_summary' },
  ccAtg: { title: 'All Things Gym · Convict Conditioning Summary Cheat Sheet', url: 'https://www.allthingsgym.com/convict-conditioning-summary-cheat-sheet/', type: 'community_summary' }
};
const std = (b, i, p) => [{ label: '初级标准', value: b }, { label: '中级标准', value: i }, { label: '进阶标准', value: p }];
const TEMPO = '按书中节奏：下放约 2 秒，底部停顿 1 秒，再用约 2 秒发力还原，全程不借惯性。';
const DOSE = '按三级标准推进：先达到初级标准，逐次加次数至中级，再加组达到进阶标准后才进入下一式；每周该动作练 1～2 次，热身可做前两式各 1 组。';
const HOLD_DOSE = '按三级标准累积静止时间：可分几次凑满，逐步延长单次保持；达到进阶标准再进入下一式。';
const families = {
  'cc-pushup': { art: '俯卧撑', body: ['胸','肩前侧','肱三头肌','核心'], primaryRegions: ['chest'], secondaryRegions: ['shoulders','arms','core'], preserves: '推的动作模式与全身绷直的平板支撑姿态' },
  'cc-squat': { art: '深蹲', body: ['股四头肌','臀','大腿后侧','小腿'], primaryRegions: ['hips_legs'], secondaryRegions: ['core','calves_ankles'], preserves: '屈髋屈膝至全幅度的下蹲模式' },
  'cc-pullup': { art: '引体向上', body: ['背阔肌','肩胛周围','肱二头肌','前臂'], primaryRegions: ['back'], secondaryRegions: ['arms','forearms_wrists'], preserves: '把身体拉向把手的拉力模式' },
  'cc-legraise': { art: '举腿', body: ['腹直肌','侧腹','髋屈肌'], primaryRegions: ['core'], secondaryRegions: ['hips_legs'], preserves: '腹部主导的屈髋举腿与骨盆控制' },
  'cc-bridge': { art: '桥', body: ['竖脊肌','臀','大腿后侧','肩'], primaryRegions: ['core','hips_legs'], secondaryRegions: ['shoulders','arms'], preserves: '脊柱后侧链的伸展力量与活动度' },
  'cc-hspu': { art: '倒立撑', body: ['三角肌','肱三头肌','斜方肌上部','核心'], primaryRegions: ['shoulders'], secondaryRegions: ['arms','core'], preserves: '头上方向推与倒置平衡' }
};
const cc = (familyId, level, id, name, en, standards, o) => {
  const f = families[familyId];
  const tier = level <= 4 ? 1 : level <= 7 ? 2 : 3;
  return entry(id, name, 'strength', o.body || f.body, level <= 4 ? 4 : level <= 8 ? 5 : 6, {
    familyId, level, tier, system: 'convict', difficulty: `${['入门','中级','高级'][tier-1]} · 第 ${level} 式`,
    primaryRegions: o.primaryRegions || f.primaryRegions, secondaryRegions: o.secondaryRegions || f.secondaryRegions,
    aliases: [en, `囚徒健身 ${f.art}第${level}式`, `Convict Conditioning ${f.art} Step ${level}`, ...(o.aliases || [])],
    standards, dose: o.dose || DOSE, breathing: o.breathing || '下放时吸气，发力时呼气；呼吸跟不上时可多换一口气，不憋气。',
    sourceId: o.sourceId || 'ccBook', sourceLocator: `${f.art}系列 · 第 ${level} 式`,
    ...(level >= 9 ? { selectable: false } : {}),
    ...Object.fromEntries(Object.entries(o).filter(([k]) => !['body','primaryRegions','secondaryRegions','aliases','dose','breathing','sourceId'].includes(k)))
  });
};

const pushups = [
  cc('cc-pushup', 1, 'cc-pushup-1', '墙壁俯卧撑', 'Wall Pushups', std('1 组 × 10 次','2 组 × 25 次','3 组 × 50 次'), {
    description: '面对墙壁的站姿推撑，是整套俯卧撑系列的起点，也常用于伤后恢复期的温和训练。',
    setup: ['面对墙站立，双脚并拢，距墙约一臂。','双掌平贴墙面，与肩同宽、与胸同高，手臂伸直但肘部不锁死。'],
    steps: ['肩与肘同时弯曲，身体保持一条直线向墙靠近。','直到前额轻触墙面停顿 1 秒。','手掌推墙回到手臂伸直的起始位置。', TEMPO],
    cues: ['头、躯干、髋、腿始终在一条直线上，身体整体移动。','肘部与躯干约呈 45°，不要向两侧完全张开。','顶端保留微屈（“软肘”），避免肘关节过伸。'],
    mistakes: ['只动头和肩、塌腰送髋，胸部没有真正靠近墙面。','速度过快靠反弹完成，达不到控制力量的目的。']
  }),
  cc('cc-pushup', 2, 'cc-pushup-2', '上斜俯卧撑', 'Incline Pushups', std('1 组 × 10 次','2 组 × 20 次','3 组 × 40 次'), {
    description: '双手撑在约腰高的稳固物体上做俯卧撑，负荷比墙壁俯卧撑明显增加。',
    setup: ['双手撑在稳固、不会滑动的桌沿、台面或楼梯扶手上，高度约与髋部相当。','双手与肩同宽，双脚并拢后撤，使身体从头到脚成一条斜直线。'],
    steps: ['屈肘下放，胸部朝支撑物边缘靠近。','胸口轻触边缘停顿 1 秒。','推起至手臂伸直。', TEMPO],
    cues: ['臀部收紧、腹部绷住，避免塌腰或撅臀。','支撑物越低难度越大，可逐步降低高度过渡。'],
    mistakes: ['支撑物不稳或会滑动，存在摔倒风险。','下放时耸肩、头部前探，用颈部“够”支撑物。']
  }),
  cc('cc-pushup', 3, 'cc-pushup-3', '跪姿俯卧撑', 'Kneeling Pushups', std('1 组 × 10 次','2 组 × 15 次','3 组 × 30 次'), {
    aliases: ['膝盖俯卧撑','跪式俯卧撑'],
    description: '以膝盖为支点的地面俯卧撑，负重进一步接近标准俯卧撑。',
    setup: ['跪在地面，双脚并拢，可将一侧脚踝勾住另一侧。','双掌平放在胸部正下方，与肩同宽，手臂伸直。','髋部伸直，使头、躯干、大腿成一条直线。'],
    steps: ['以膝盖为支点，屈肩屈肘下放。','胸部离地约一拳时停顿 1 秒。','推回至手臂伸直。', TEMPO],
    cues: ['髋部不要弯折成“跪坐”姿势，大腿与躯干保持直线。','膝下可垫软垫减轻压迫。'],
    mistakes: ['撅臀或髋部下垂，把动作变成只动上半身。','下放幅度不足一半就推起。']
  }),
  cc('cc-pushup', 4, 'cc-pushup-4', '半俯卧撑', 'Half Pushups', std('1 组 × 8 次','2 组 × 12 次','2 组 × 25 次'), {
    description: '标准俯卧撑姿势下只做上半程，在髋下放篮球等物体控制深度。',
    setup: ['标准俯卧撑起始姿势：双掌与肩同宽，手臂伸直，双脚并拢，身体成一直线。','在髋部正下方放一个篮球或同高度的稳固物体作为深度参照。'],
    steps: ['屈肘下放，直到髋部轻触球面、肘部约 90°。','停顿 1 秒，轻触而不压上去。','推回至手臂伸直。', TEMPO],
    cues: ['书中称“亲吻婴儿”：接触参照物的力度应非常轻。','全程腹部与臀部收紧，身体像一块板。'],
    mistakes: ['把重量压在球上借力反弹。','臀部先下降碰到球，而上身仍很高。']
  }),
  cc('cc-pushup', 5, 'cc-pushup-5', '标准俯卧撑', 'Full Pushups', std('1 组 × 5 次','2 组 × 10 次','2 组 × 20 次'), {
    description: '全幅度标准俯卧撑，胸部下放至离地约一拳。',
    setup: ['双掌平放地面、与肩同宽，位于胸部下方。','双脚并拢，身体从头到脚跟成一直线，手臂伸直。'],
    steps: ['屈肘下放，胸部接近地面，离地约一拳（可放一个棒球作参照）。','停顿 1 秒。','推起至手臂伸直但不锁死。', TEMPO],
    cues: ['双腿并拢——分开双腿会降低躯干稳定需求。','肘部斜向后下方，与躯干约 45°。','目视地面前方，颈部与脊柱对齐。'],
    mistakes: ['塌腰：说明腰腹不够强，应退回上一式巩固。','只做一半幅度就计数。']
  }),
  cc('cc-pushup', 6, 'cc-pushup-6', '窄距俯卧撑', 'Close Pushups', std('1 组 × 5 次','2 组 × 10 次','2 组 × 20 次'), {
    aliases: ['窄距俯卧撑','并手俯卧撑'],
    body: ['肱三头肌','胸','肩前侧','核心'], primaryRegions: ['chest','arms'], secondaryRegions: ['shoulders','core'],
    description: '双手靠拢的俯卧撑，更多负荷转移到肱三头肌与肘部。',
    setup: ['俯卧撑姿势，双手在胸下并拢，两手食指与拇指相触。','双脚并拢，身体成一直线。'],
    steps: ['屈肘下放，直至胸部轻触手背。','停顿 1 秒。','推起至手臂伸直。', TEMPO],
    cues: ['肘部贴近身体两侧向后，而不是向外张开。','手腕不适时可稍微分开双手，保留接近的距离。'],
    mistakes: ['肘部外翻，造成肩前侧和肘内侧压力。','身体前后晃动借力。']
  }),
  cc('cc-pushup', 7, 'cc-pushup-7', '偏重俯卧撑', 'Uneven Pushups', std('1 组 × 5 次（每侧）','2 组 × 10 次（每侧）','2 组 × 20 次（每侧）'), {
    aliases: ['不对称俯卧撑'],
    description: '一只手撑在篮球上、另一只手撑地，把大部分负荷交给撑地一侧，为单臂动作做准备。',
    setup: ['一只手撑在篮球上，另一只手平放地面，两手间距略宽于肩。','双脚并拢，身体成一直线；球需放稳，可先在墙边练习防滚动。'],
    steps: ['以撑地手为主发力，屈肘下放至胸部轻触撑地手的手背附近。','停顿 1 秒。','推回起始位置；完成一侧次数后换手。', TEMPO],
    cues: ['撑球的手主要负责平衡，尽量少出力。','躯干保持水平，不向撑地侧倾倒。'],
    mistakes: ['球不稳导致手腕扭伤——初次练习可用砖块等稳固物替代。','两侧次数不对等。']
  }),
  cc('cc-pushup', 8, 'cc-pushup-8', '单臂半俯卧撑', 'Half One-Arm Pushups', std('1 组 × 5 次（每侧）','2 组 × 10 次（每侧）','2 组 × 20 次（每侧）'), {
    description: '单手支撑做上半程俯卧撑，髋下放球控制深度。',
    setup: ['单手撑地位于胸部下方中线附近，另一只手背在身后。','双脚分开略宽于肩以提供平衡，髋下放一个篮球作深度参照。'],
    steps: ['单臂屈肘下放，直到髋部轻触球面。','停顿 1 秒。','单臂推回至伸直；完成后换手。', TEMPO],
    cues: ['肩部与地面尽量保持平行，不扭转躯干来借力。','撑地手用力抓地，手指张开分散压力。'],
    mistakes: ['躯干大幅旋转，变成侧撑推起。','双脚距离过窄导致失衡倒向一侧。']
  }),
  cc('cc-pushup', 9, 'cc-pushup-9', '杠杆俯卧撑', 'Lever Pushups', std('1 组 × 5 次（每侧）','2 组 × 10 次（每侧）','2 组 × 20 次（每侧）'), {
    description: '一只手撑地、另一只手伸直撑在侧方篮球上作为杠杆辅助，完成全幅度的近单臂俯卧撑。',
    setup: ['一只手撑地于胸下，另一只手臂向侧方伸直，手掌放在篮球上。','双脚分开约与肩同宽，身体成一直线。'],
    steps: ['撑地一侧屈肘下放，伸直的辅助臂随球滚动但保持伸直。','胸部接近地面时停顿 1 秒。','主要由撑地侧推起；完成后换侧。', TEMPO],
    cues: ['辅助臂始终伸直，只提供少量支撑。','随着力量提高，逐步减少压在球上的重量。'],
    mistakes: ['辅助臂弯曲变成双手推起。','球滚走导致失去平衡。']
  }),
  cc('cc-pushup', 10, 'cc-pushup-10', '单臂俯卧撑', 'One-Arm Pushups', std('1 组 × 5 次（每侧）','2 组 × 10 次（每侧）','1 组 × 100 次（每侧，书中精英标准）'), {
    description: '俯卧撑系列的终极式：单手完成全幅度俯卧撑。',
    setup: ['单手撑地于胸下，另一只手背在身后。','双脚分开约与肩同宽，身体从头到脚成一直线。'],
    steps: ['单臂屈肘下放，直至胸部离地约一拳。','停顿 1 秒。','单臂推起至伸直；完成后换手。', TEMPO],
    cues: ['肩带尽量保持水平，旋转越少说明控制越好。','全身绷紧：臀、腹、腿同时用力。'],
    mistakes: ['双腿分得过开，把动作变成三点支撑的侧推。','在上一式未达标时硬练，容易伤及肩肘。']
  })
];

const squats = [
  cc('cc-squat', 1, 'cc-squat-1', '肩倒立深蹲', 'Shoulderstand Squats', std('1 组 × 10 次','2 组 × 25 次','3 组 × 50 次'), {
    body: ['臀','股四头肌','髋','腰背'],
    description: '仰卧肩倒立姿势下屈膝至前额，下肢不承重，温和练习全幅度屈髋屈膝。',
    setup: ['仰卧，双腿向上举起，双手托住后腰，用肩和上背支撑，身体尽量垂直于地面。','颈部下方地面平整，头部不转动。'],
    steps: ['屈膝屈髋，膝盖朝前额方向下落。','膝盖接近或轻触前额时停顿 1 秒。','伸膝伸髋，双腿回到竖直。', TEMPO],
    cues: ['重量落在肩和上背，而不是颈部。','动作全程保持缓慢，不甩腿。'],
    mistakes: ['头部转动或颈部承重过多。','靠惯性甩腿，髋部塌落。'],
    breathing: '膝盖下落时呼气，伸直时吸气；保持均匀呼吸。'
  }),
  cc('cc-squat', 2, 'cc-squat-2', '折刀深蹲', 'Jackknife Squats', std('1 组 × 10 次','2 组 × 20 次','3 组 × 40 次'), {
    description: '双手扶住约膝高的物体，身体折叠成“折刀”状下蹲，手臂分担部分体重。',
    setup: ['面对一张稳固的椅子或矮台，距离约一步，双脚与肩同宽。','俯身双手扶在椅面上，手臂伸直，背部平直，身体呈倒“V”形。'],
    steps: ['屈膝屈髋下蹲，臀部向后下方坐，直到大腿后侧接近小腿。','停顿 1 秒。','腿部主导站起回到折刀位，手臂只做辅助。', TEMPO],
    cues: ['膝盖朝脚尖方向，不内扣。','越少用手推，腿部负荷越大。'],
    mistakes: ['全程用手推起，腿部几乎不出力。','下蹲时脚跟离地。']
  }),
  cc('cc-squat', 3, 'cc-squat-3', '支撑深蹲', 'Supported Squats', std('1 组 × 10 次','2 组 × 15 次','3 组 × 30 次'), {
    description: '手扶稳固物体完成全幅度深蹲，手臂提供平衡与少量助力。',
    setup: ['站在门框、立柱或稳固椅背前，双手握住，双脚与肩同宽或略宽，脚尖微向外。'],
    steps: ['屈髋屈膝下蹲至最低点，大腿后侧贴近小腿。','停顿 1 秒。','以腿部发力站起，手只在最困难处轻微辅助。', TEMPO],
    cues: ['躯干可以前倾，但保持背部中立不弓背。','脚掌全程贴地，重心在全脚掌中后部。'],
    mistakes: ['下蹲到底后放松塌坐，反弹起身。','手拉支撑物把身体拽起。']
  }),
  cc('cc-squat', 4, 'cc-squat-4', '半蹲', 'Half Squats', std('1 组 × 8 次','2 组 × 35 次','2 组 × 50 次'), {
    description: '不借助支撑，下蹲至膝关节约 90° 的半程深蹲，建立独立承重能力。',
    setup: ['双脚与肩同宽，脚尖微向外，双臂前伸以帮助平衡。'],
    steps: ['屈髋屈膝，像坐向身后的椅子一样下蹲至大腿接近水平、膝约 90°。','停顿 1 秒。','站起至双腿伸直但膝不锁死。', TEMPO],
    cues: ['膝盖与脚尖方向一致。','躯干适度前倾，胸口朝前。'],
    mistakes: ['膝盖内扣或脚跟抬起。','只下蹲很浅就计数。']
  }),
  cc('cc-squat', 5, 'cc-squat-5', '标准深蹲', 'Full Squats', std('1 组 × 5 次','2 组 × 10 次','2 组 × 30 次'), {
    aliases: ['全蹲','徒手深蹲'],
    description: '全幅度徒手深蹲，下蹲至大腿后侧贴住小腿。',
    setup: ['双脚与肩同宽，脚尖微向外，双臂前伸平举。'],
    steps: ['屈髋屈膝下蹲，直到大腿后侧与小腿相贴、无法再低。','停顿 1 秒，不在底部弹起。','以腿部发力站起。', TEMPO],
    cues: ['想象坐进一张看不见的椅子，躯干前倾但不过度。','全脚掌踩实，脚跟不离地。'],
    mistakes: ['底部放松、靠弹性反弹站起。','为了下蹲更深而大幅弓背。']
  }),
  cc('cc-squat', 6, 'cc-squat-6', '窄距深蹲', 'Close Squats', std('1 组 × 5 次','2 组 × 10 次','2 组 × 20 次'), {
    description: '双脚并拢完成全幅度深蹲，对踝、髋活动度与大腿力量要求更高。',
    setup: ['双脚并拢（脚跟相触），双臂前伸平举。'],
    steps: ['下蹲至大腿后侧贴住小腿。','停顿 1 秒。','站起至直立。', TEMPO],
    cues: ['身体前倾以平衡重心，手臂前伸有助稳定。','脚跟始终压地。'],
    mistakes: ['脚跟离地、重心前移至脚尖。','为保持平衡而膝盖向两侧大幅打开。']
  }),
  cc('cc-squat', 7, 'cc-squat-7', '偏重深蹲', 'Uneven Squats', std('1 组 × 5 次（每侧）','2 组 × 10 次（每侧）','2 组 × 20 次（每侧）'), {
    aliases: ['不对称深蹲'],
    description: '一只脚踩在篮球上、另一只脚踩地深蹲，负荷偏向踩地腿。',
    setup: ['一只脚平放地面，另一只脚踩在身前侧方的篮球（或同高稳固物）上，双臂前伸。'],
    steps: ['主要以踩地腿承重下蹲至全幅度。','停顿 1 秒。','站起；完成一侧次数后换腿。', TEMPO],
    cues: ['踩球的脚主要负责平衡，不主动发力。','初练可在旁边放支撑物以防失衡。'],
    mistakes: ['球滚动导致膝盖扭转。','躯干倾向踩球侧，把重量转移过去。']
  }),
  cc('cc-squat', 8, 'cc-squat-8', '单腿半蹲', 'Half One-Leg Squats', std('1 组 × 5 次（每侧）','2 组 × 10 次（每侧）','2 组 × 20 次（每侧）'), {
    description: '单腿站立、另一条腿伸直前举，下蹲至膝约 90° 的半程单腿深蹲。',
    setup: ['单腿站立，另一条腿伸直向前抬离地面，双臂前伸。'],
    steps: ['支撑腿屈髋屈膝下蹲至大腿接近水平。','停顿 1 秒。','支撑腿发力站起；完成后换腿。', TEMPO],
    cues: ['支撑腿膝盖对准第二、三脚趾方向。','抬起的腿全程不弯曲、不触地。'],
    mistakes: ['膝盖内扣。','幅度不足时可先从四分之一幅度开始，逐次加深。']
  }),
  cc('cc-squat', 9, 'cc-squat-9', '辅助单腿深蹲', 'Assisted One-Leg Squats', std('1 组 × 5 次（每侧）','2 组 × 10 次（每侧）','2 组 × 20 次（每侧）'), {
    description: '单腿全幅度深蹲，一只手按在侧方篮球上提供少量助力。',
    setup: ['单腿站立，另一条腿伸直前举；在支撑腿外侧放一个篮球，同侧手可按到球面。'],
    steps: ['单腿下蹲至最低点，下蹲后半程手按球辅助。','停顿 1 秒。','支撑腿发力站起，手只在最困难处辅助；完成后换腿。', TEMPO],
    cues: ['辅助物越高、越多（两侧各一），动作越容易。','随力量提高逐步减少手部用力。'],
    mistakes: ['手部用力过多变成手推起身。','底部失去控制跌坐。']
  }),
  cc('cc-squat', 10, 'cc-squat-10', '单腿深蹲', 'One-Leg Squats', std('1 组 × 5 次（每侧）','2 组 × 10 次（每侧）','2 组 × 50 次（每侧，书中精英标准）'), {
    aliases: ['手枪蹲','Pistol Squat'],
    description: '深蹲系列终极式：单腿全幅度下蹲，另一条腿伸直前举。',
    setup: ['单腿站立，另一条腿伸直前举离地，双臂前伸平衡。'],
    steps: ['支撑腿屈髋屈膝，全幅度下蹲至大腿后侧贴近小腿。','停顿 1 秒。','单腿站起至直立；完成后换腿。', TEMPO],
    cues: ['躯干前倾与前伸的手臂共同平衡重心。','全脚掌踩实，脚跟不离地。'],
    mistakes: ['底部放松弹起，膝关节受冲击。','前举腿下垂触地。']
  })
];

const pullups = [
  cc('cc-pullup', 1, 'cc-pullup-1', '垂直引体', 'Vertical Pulls', std('1 组 × 10 次','2 组 × 20 次','3 组 × 40 次'), {
    description: '站姿抓住门框或稳固立柱，身体后倾后把自己拉回，是最温和的拉力练习。',
    setup: ['面对门框或牢固的立柱站立，双脚靠近其底部。','双手在胸高处握住门框两侧（或立柱），身体后倾直到手臂伸直。'],
    steps: ['肩胛先向后收，然后屈肘把身体拉向门框。','胸口接近门框时停顿 1 秒。','缓慢伸直手臂回到后倾位。', TEMPO],
    cues: ['身体保持笔直，从脚踝处整体转动。','脚离门框越远、身体越倾斜，难度越大。'],
    mistakes: ['使用不牢固的门或把手。','只用手臂拉，肩胛没有参与。'],
    breathing: '拉近时呼气，远离时吸气。'
  }),
  cc('cc-pullup', 2, 'cc-pullup-2', '水平引体', 'Horizontal Pulls', std('1 组 × 10 次','2 组 × 20 次','3 组 × 30 次'), {
    aliases: ['澳式引体','斜身引体','反向划船'],
    equipment: ['pullup_bar'],
    description: '仰卧在约腰高的低杠下，身体绷直把胸口拉向横杆。',
    setup: ['低杠（或极稳固的桌沿）约与腰同高，仰卧于其下，双手略宽于肩握住。','脚跟着地，身体从头到脚成一直线，手臂伸直。'],
    steps: ['肩胛后收，屈肘把胸口拉向横杆。','胸口接近或轻触横杆停顿 1 秒。','缓慢伸直手臂还原。', TEMPO],
    cues: ['臀部收紧，不塌髋。','屈膝踩地可降低难度。'],
    mistakes: ['用挺腹顶髋代替拉起。','桌子等临时物件承重不足或会移位。']
  }),
  cc('cc-pullup', 3, 'cc-pullup-3', '折刀引体', 'Jackknife Pulls', std('1 组 × 10 次','2 组 × 15 次','3 组 × 20 次'), {
    equipment: ['pullup_bar'],
    description: '双脚架在身前椅子上、身体折成直角的引体，腿部分担部分体重。',
    setup: ['单杠约与胸同高，杠前放一张稳固的椅子。','双手握杠，坐在杠下，把脚跟放在椅子上，双腿伸直，髋部约 90°。'],
    steps: ['屈肘把身体向上拉，直到下巴超过横杆。','停顿 1 秒。','缓慢放下至手臂伸直。', TEMPO],
    cues: ['以背和手臂为主，腿只在必要时轻推。','肩膀下沉，远离耳朵。'],
    mistakes: ['双腿用力蹬椅子把自己送上去。','椅子不稳。']
  }),
  cc('cc-pullup', 4, 'cc-pullup-4', '半引体向上', 'Half Pullups', std('1 组 × 8 次','2 组 × 11 次','2 组 × 15 次'), {
    equipment: ['pullup_bar'],
    description: '从肘部约 90° 的位置开始拉到下巴过杠，练习引体的上半程。',
    setup: ['双手与肩同宽正握单杠，脚踩凳子把身体送到肘约 90° 的位置后悬挂。'],
    steps: ['从半程位置向上拉，直到下巴超过横杆。','停顿 1 秒。','缓慢下放回到肘约 90°，不完全伸直。', TEMPO],
    cues: ['双腿并拢、身体不摆动。','下放时同样控制速度。'],
    mistakes: ['踢腿、摆动身体借力。','下放过低变成全程，或过高幅度过小。']
  }),
  cc('cc-pullup', 5, 'cc-pullup-5', '标准引体向上', 'Full Pullups', std('1 组 × 5 次','2 组 × 8 次','2 组 × 10 次'), {
    aliases: ['引体向上','Pull-up'],
    equipment: ['pullup_bar'],
    description: '从手臂接近伸直的悬挂位拉至下巴过杠的全程引体。',
    setup: ['正握单杠，双手与肩同宽，悬挂至手臂接近伸直（保留微屈），双腿并拢。'],
    steps: ['先下沉肩胛，再屈肘把身体向上拉，直到下巴超过横杆。','停顿 1 秒。','缓慢下放到手臂接近伸直。', TEMPO],
    cues: ['底部保持“软肘”，不完全放松挂在关节上。','胸口朝向横杆，避免只用下巴够杠。'],
    mistakes: ['踢腿或摆荡完成动作。','底部完全放松，肩关节被动悬挂。']
  }),
  cc('cc-pullup', 6, 'cc-pullup-6', '窄距引体向上', 'Close Pullups', std('1 组 × 5 次','2 组 × 8 次','2 组 × 10 次'), {
    equipment: ['pullup_bar'],
    description: '双手相靠握杠的引体，增加手臂负荷，为单臂系列做准备。',
    setup: ['正握单杠，两手相触或间距极小，悬挂至手臂接近伸直。'],
    steps: ['拉起直到下巴超过双手。','停顿 1 秒。','缓慢下放。', TEMPO],
    cues: ['身体稍向后倾可让胸口接近横杆。','手腕不适时可改为对握或稍分开。'],
    mistakes: ['身体绕杠旋转或摆动。']
  }),
  cc('cc-pullup', 7, 'cc-pullup-7', '偏重引体向上', 'Uneven Pullups', std('1 组 × 5 次（每侧）','2 组 × 7 次（每侧）','2 组 × 9 次（每侧）'), {
    equipment: ['pullup_bar'],
    description: '一只手握杠、另一只手握住挂在杠上的毛巾或手腕，负荷偏向握杠侧。',
    setup: ['一只手正握单杠；在杠上搭一条结实的毛巾，另一只手握住毛巾较低处（或握住握杠手的手腕）。'],
    steps: ['以握杠手为主拉起，直到下巴超过横杆。','停顿 1 秒。','缓慢下放；完成后换手。', TEMPO],
    cues: ['握毛巾位置越低，辅助越少。','躯干保持正对，不向一侧扭转。'],
    mistakes: ['辅助手用力过多。','毛巾不牢或打滑。']
  }),
  cc('cc-pullup', 8, 'cc-pullup-8', '单臂半引体向上', 'Half One-Arm Pullups', std('1 组 × 4 次（每侧）','2 组 × 6 次（每侧）','2 组 × 8 次（每侧）'), {
    equipment: ['pullup_bar'],
    description: '单手握杠，从肘约 90° 拉至下巴过杠的半程单臂引体。',
    setup: ['借助凳子把身体送到单手握杠、肘约 90° 的位置，另一只手放在体侧或背后。'],
    steps: ['单臂从半程拉至下巴超过横杆。','停顿 1 秒。','缓慢下放回半程；完成后换手。', TEMPO],
    cues: ['肩胛下沉锁住肩关节。','双腿并拢，减少旋转。'],
    mistakes: ['身体大幅旋转、踢腿借力。','肘部在底部突然放松。']
  }),
  cc('cc-pullup', 9, 'cc-pullup-9', '辅助单臂引体向上', 'Assisted One-Arm Pullups', std('1 组 × 3 次（每侧）','2 组 × 5 次（每侧）','2 组 × 7 次（每侧）'), {
    equipment: ['pullup_bar'],
    description: '单臂全程引体，另一只手握住下垂的毛巾提供少量助力。',
    setup: ['一只手握杠，另一只手握住搭在杠上的毛巾，位置尽量低。','悬挂至握杠手臂接近伸直。'],
    steps: ['握杠臂为主拉起至下巴过杠，毛巾手只做少量辅助。','停顿 1 秒。','缓慢下放至全程；完成后换手。', TEMPO],
    cues: ['逐步把毛巾握点下移，减少辅助。','握杠臂肩胛先下沉再屈肘，避免耸肩吊挂。'],
    mistakes: ['主要靠毛巾手拉起。','底部失控下坠冲击肘肩。']
  }),
  cc('cc-pullup', 10, 'cc-pullup-10', '单臂引体向上', 'One-Arm Pullups', std('1 组 × 1 次（每侧）','2 组 × 3 次（每侧）','2 组 × 6 次（每侧，书中精英标准）'), {
    equipment: ['pullup_bar'],
    description: '引体系列终极式：单手从悬挂拉至下巴过杠。',
    setup: ['单手握杠悬挂，手臂接近伸直，另一只手放在体侧。'],
    steps: ['下沉肩胛后单臂拉起，直至下巴超过横杆。','停顿 1 秒。','缓慢下放。', TEMPO],
    cues: ['全身绷紧、双腿并拢以减少旋转。','能力未达标前以第 8、9 式为主。'],
    mistakes: ['踢腿、扭身借力。','在未充分准备时尝试，易拉伤肘部与肩部。']
  })
];

const HANG = { equipment: ['pullup_bar'], secondaryRegions: ['hips_legs','forearms_wrists'], body: ['腹直肌','侧腹','髋屈肌','握力'] };
const legraises = [
  cc('cc-legraise', 1, 'cc-legraise-1', '坐姿收膝', 'Knee Tucks', std('1 组 × 10 次','2 组 × 25 次','3 组 × 40 次'), {
    description: '坐在椅边，身体微后仰，把伸直的腿收向胸口。',
    setup: ['坐在稳固的椅子前沿，双手握住椅面两侧。','上身微向后倾，双腿并拢向前伸直，脚跟略离地。'],
    steps: ['屈膝把大腿收向胸口，同时呼气。','停顿 1 秒。','缓慢把腿伸回前方，不落地。', TEMPO],
    cues: ['用腹部卷起骨盆，而不是只抬大腿。','全程保持背部平直、不塌肩。'],
    mistakes: ['上身来回摆动借力。','伸腿时脚跟砸地。'],
    breathing: '收膝时呼气，伸腿时吸气。', sourceId: 'ccLegRaises'
  }),
  cc('cc-legraise', 2, 'cc-legraise-2', '仰卧屈膝举腿', 'Flat Knee Raises', std('1 组 × 10 次','2 组 × 20 次','3 组 × 35 次'), {
    description: '仰卧在地，屈膝约 90° 把膝盖抬向胸口。',
    setup: ['仰卧，双手放在身体两侧或臀下，双腿并拢屈膝约 90°，脚跟轻触地面。'],
    steps: ['腹部发力把膝盖抬向胸口，臀部略离地。','停顿 1 秒。','缓慢放下，脚跟轻触地面后再开始下一次。', TEMPO],
    cues: ['下背部贴紧地面，不拱起。','膝关节角度全程保持不变。'],
    mistakes: ['甩腿借惯性。','下放时腰部离地拱起。'],
    breathing: '抬腿时呼气，放下时吸气。', sourceId: 'ccLegRaises'
  }),
  cc('cc-legraise', 3, 'cc-legraise-3', '仰卧屈腿举腿', 'Flat Bent Leg Raises', std('1 组 × 10 次','2 组 × 15 次','3 组 × 30 次'), {
    description: '仰卧，腿部微屈（膝约 45°）举至竖直，杠杆比屈膝举腿更长。',
    setup: ['仰卧，双手放在身体两侧，双腿并拢，膝盖微屈约 45°，脚跟离地约一寸。'],
    steps: ['保持膝角不变，把腿举至竖直。','停顿 1 秒。','缓慢放下至脚跟即将触地。', TEMPO],
    cues: ['腰部始终压实地面。','越接近伸直，难度越大。'],
    mistakes: ['下放过低导致腰部拱起。','举腿过程中膝角变化。'],
    breathing: '抬腿时呼气，放下时吸气。', sourceId: 'ccLegRaises'
  }),
  cc('cc-legraise', 4, 'cc-legraise-4', '仰卧蛙式举腿', 'Flat Frog Raises', std('1 组 × 8 次','2 组 × 15 次','3 组 × 25 次'), {
    description: '屈腿抬起，在顶端伸直双腿，再以直腿缓慢放下，衔接直腿举腿。',
    setup: ['仰卧，双手放在身体两侧，双腿并拢屈膝。'],
    steps: ['屈膝把大腿抬向胸口。','在顶端把腿伸直向上，停顿 1 秒。','保持直腿缓慢放下至脚跟接近地面，然后再屈膝开始下一次。', TEMPO],
    cues: ['直腿下放是本式重点，控制离心阶段。','下放时腰部不离地。'],
    mistakes: ['直腿下放速度过快，砸向地面。'],
    breathing: '抬腿时呼气，放下时吸气。', sourceId: 'ccLegRaises'
  }),
  cc('cc-legraise', 5, 'cc-legraise-5', '仰卧直腿举腿', 'Flat Straight Leg Raises', std('1 组 × 5 次','2 组 × 10 次','2 组 × 20 次'), {
    description: '仰卧，双腿伸直并拢举至竖直，是地面举腿的最高式。',
    setup: ['仰卧，双手放在身体两侧，双腿并拢伸直，膝关节锁定。'],
    steps: ['直腿抬起至与地面垂直。','停顿 1 秒。','缓慢放下至脚跟即将触地。', TEMPO],
    cues: ['骨盆轻微后倾，下背贴地。','膝盖不弯。'],
    mistakes: ['腰部拱起说明核心不足，应退回第 4 式。'],
    breathing: '抬腿时呼气，放下时吸气。', sourceId: 'ccLegRaises'
  }),
  cc('cc-legraise', 6, 'cc-legraise-6', '悬垂屈膝举腿', 'Hanging Knee Raises', std('1 组 × 5 次','2 组 × 10 次','2 组 × 15 次'), {
    ...HANG, aliases: ['吊杠收膝'],
    description: '悬挂在单杠上，屈膝把大腿抬至与地面平行以上。',
    setup: ['正握单杠，双手与肩同宽，悬挂，双腿并拢伸直。'],
    steps: ['屈膝把膝盖向上抬，直至大腿至少与地面平行、可接近胸口。','停顿 1 秒。','缓慢伸腿下放至竖直。', TEMPO],
    cues: ['肩部下沉稳定，不让身体前后摆动。','下放到底时稍作停顿再开始下一次，消除惯性。'],
    mistakes: ['摆荡身体借力。','握力先力竭——可单独加强握力。'],
    breathing: '抬腿时呼气，放下时吸气。', sourceId: 'ccLegRaises'
  }),
  cc('cc-legraise', 7, 'cc-legraise-7', '悬垂屈腿举腿', 'Hanging Bent Leg Raises', std('1 组 × 5 次','2 组 × 10 次','2 组 × 15 次'), {
    ...HANG,
    description: '悬垂，膝盖微屈约 45° 把腿举至与地面平行。',
    setup: ['正握单杠悬挂，双腿并拢，膝盖微屈约 45°。'],
    steps: ['保持膝角，将腿抬至与地面平行。','停顿 1 秒。','缓慢放下至竖直。', TEMPO],
    cues: ['骨盆向上卷起，而不仅是屈髋。','身体不摆动。'],
    mistakes: ['下放时松掉，身体大幅前后晃。'],
    breathing: '抬腿时呼气，放下时吸气。', sourceId: 'ccLegRaises'
  }),
  cc('cc-legraise', 8, 'cc-legraise-8', '悬垂蛙式举腿', 'Hanging Frog Raises', std('1 组 × 5 次','2 组 × 10 次','2 组 × 15 次'), {
    ...HANG,
    description: '悬垂屈膝抬腿后在顶端伸直，再以直腿下放。',
    setup: ['正握单杠悬挂，双腿并拢。'],
    steps: ['屈膝抬起大腿至高于水平。','在顶端伸直双腿，使其与地面平行，停顿 1 秒。','保持直腿缓慢放下至竖直。', TEMPO],
    cues: ['直腿下放阶段慢而稳定。','伸腿时保持大腿高度不掉，腹部持续收紧。'],
    mistakes: ['伸腿后立即掉落，没有控制离心。'],
    breathing: '抬腿时呼气，放下时吸气。', sourceId: 'ccLegRaises'
  }),
  cc('cc-legraise', 9, 'cc-legraise-9', '悬垂直腿部分举腿', 'Partial Straight Leg Raises', std('1 组 × 5 次','2 组 × 10 次','2 组 × 15 次'), {
    ...HANG,
    description: '悬垂直腿在小幅范围内举起至水平，是通往终极式的过渡。',
    setup: ['正握单杠悬挂，双腿伸直并拢，先把腿稍微抬离竖直位置。'],
    steps: ['从微抬位置开始，直腿上举至与地面平行。','停顿 1 秒。','缓慢下放回微抬位置，不完全放到竖直。','随能力提高逐渐扩大起始幅度。'],
    cues: ['膝盖全程锁直。','动作幅度虽小，但保持严格的慢速。'],
    mistakes: ['弯膝借力。','身体摆荡。'],
    breathing: '抬腿时呼气，放下时吸气。', sourceId: 'ccLegRaises'
  }),
  cc('cc-legraise', 10, 'cc-legraise-10', '悬垂直腿举腿', 'Hanging Straight Leg Raises', std('1 组 × 5 次','2 组 × 10 次','2 组 × 30 次（书中大师标准）'), {
    ...HANG,
    description: '举腿系列终极式：悬垂状态下直腿从竖直全程举至与地面平行。',
    setup: ['正握单杠悬挂，双腿伸直并拢，膝关节锁定，身体静止。'],
    steps: ['直腿上举，直至双腿与地面平行。','停顿 1 秒。','缓慢放下至竖直，稍作停顿消除摆动。', TEMPO],
    cues: ['骨盆后倾卷起，腹部主导而非仅靠髋屈肌。','全程不摆动、不弯膝。'],
    mistakes: ['借摆荡完成。','下放时失控导致下背受冲击。'],
    breathing: '抬腿时呼气，放下时吸气。', sourceId: 'ccLegRaises'
  })
];

const bridges = [
  cc('cc-bridge', 1, 'cc-bridge-1', '短桥', 'Short Bridges', std('1 组 × 10 次','2 组 × 25 次','3 组 × 50 次'), {
    aliases: ['臀桥'],
    body: ['臀','大腿后侧','下背'],
    description: '仰卧屈膝抬起骨盆，使身体从肩到膝成一直线，是桥系列的起点。',
    setup: ['仰卧，屈膝，双脚平放地面、与髋同宽，脚跟靠近臀部约一小臂距离。','双手放在身体两侧。'],
    steps: ['脚跟与肩部发力抬起髋部，直到肩、髋、膝成一直线。','停顿 1 秒，臀部收紧。','缓慢放下至臀部轻触地面。', TEMPO],
    cues: ['用臀和大腿后侧把髋推高，而不是用腰顶。','肋骨下沉，避免顶端腰椎过度后弯。'],
    mistakes: ['顶端过度挺腰。','脚离臀部太远，只有大腿后侧抽紧。'],
    breathing: '抬起时呼气，下放时吸气。'
  }),
  cc('cc-bridge', 2, 'cc-bridge-2', '直桥', 'Straight Bridges', std('1 组 × 10 次','2 组 × 20 次','3 组 × 40 次'), {
    body: ['臀','大腿后侧','下背','肩后侧'],
    description: '坐姿双腿伸直，双手撑地把身体推起成一块斜直的“板”。',
    setup: ['坐在地上，双腿伸直并拢，双手掌心撑在髋部两侧，指尖朝向脚的方向。'],
    steps: ['手掌与脚跟发力把髋部推起，直到身体从肩到脚成一直线，手臂伸直。','目视上方，停顿 1 秒。','缓慢放下回到坐姿。', TEMPO],
    cues: ['手臂伸直但不锁死，肩胛向后下方收。','头部可略后仰顺势看向天花板。'],
    mistakes: ['髋部没有抬到与身体一线。','手腕不适时可稍调整指尖方向。']
  }),
  cc('cc-bridge', 3, 'cc-bridge-3', '高低桥', 'Angled Bridges', std('1 组 × 8 次','2 组 × 15 次','3 组 × 30 次'), {
    aliases: ['角度桥'],
    description: '双手撑在身后约膝高的床或凳上、双脚踩地，把身体推成拱形。',
    setup: ['背对一张约膝高的稳固床或凳子坐下，双手反手撑在其边缘。','屈膝，双脚平踩地面与肩同宽。'],
    steps: ['伸髋伸臂把身体推起，躯干呈斜向拱形，头部后仰。','停顿 1 秒。','缓慢屈臂屈髋还原。', TEMPO],
    cues: ['腰背与臀部共同发力，形成平滑的弧线。','支撑物越低，越接近完整的桥。'],
    mistakes: ['只抬髋、胸椎不伸展。','支撑物不稳或会移动。']
  }),
  cc('cc-bridge', 4, 'cc-bridge-4', '头桥', 'Head Bridges', std('1 组 × 8 次','2 组 × 15 次','2 组 × 25 次'), {
    secondaryRegions: ['shoulders','arms','neck'],
    description: '仰卧，手脚撑地把身体推起、头顶轻触地面，练习从半程向全桥过渡。',
    setup: ['仰卧屈膝，双脚平踩地面与肩同宽。','双手置于耳侧，掌心贴地、指尖朝向脚。'],
    steps: ['推起身体至头顶轻触地面，手臂约屈曲 90°，身体呈拱形。','停顿 1 秒。','缓慢放下回到仰卧。', TEMPO],
    cues: ['主要由手脚承重，头部只是轻触，不压颈部。','下方可垫软垫。'],
    mistakes: ['把体重压在头颈上。','颈部有不适时不宜练习本式。']
  }),
  cc('cc-bridge', 5, 'cc-bridge-5', '半桥', 'Half Bridges', std('1 组 × 8 次','2 组 × 15 次','2 组 × 20 次'), {
    description: '双手撑地、腰下垫篮球，把身体推成半弧形的桥。',
    setup: ['仰卧，屈膝踩地；在下背部下方放一个篮球作为参照。','双手放在耳侧，掌心贴地、指尖朝向脚。'],
    steps: ['手脚同时发力，把身体推起形成弧形，手臂接近伸直。','停顿 1 秒。','缓慢放下至背部轻触球面。', TEMPO],
    cues: ['肩部尽量推到手腕上方。','呼吸保持平稳，不憋气。'],
    mistakes: ['脚离手太远，拱形过于平坦。']
  }),
  cc('cc-bridge', 6, 'cc-bridge-6', '全桥', 'Full Bridges', std('1 组 × 6 次','2 组 × 10 次','2 组 × 15 次'), {
    aliases: ['后桥','Wheel Pose'],
    description: '从仰卧推起至手臂与腿伸直的完整拱桥。',
    setup: ['仰卧，屈膝踩地，脚跟靠近臀部，与肩同宽。','双手放在耳侧，掌心贴地、指尖朝向脚。'],
    steps: ['推起至手臂伸直，髋部抬到最高，身体呈完整拱形。','停顿 1 秒。','缓慢屈臂屈膝放回地面。', TEMPO],
    cues: ['胸口朝向手的方向推，打开胸椎与肩。','两脚平行，膝盖不外翻。'],
    mistakes: ['只靠下背弯曲，胸椎与肩没有打开。','动作前热身不足。']
  }),
  cc('cc-bridge', 7, 'cc-bridge-7', '下行墙桥', 'Wall Walking Bridges (Down)', std('1 组 × 3 次','2 组 × 6 次','2 组 × 10 次'), {
    impact: 'medium',
    description: '背对墙站立后仰，双手沿墙向下“走”直到进入全桥。',
    setup: ['背对墙站立，脚跟距墙约一臂，双脚与肩同宽。','双臂上举，后仰把手掌贴在墙上，指尖朝下。'],
    steps: ['双手交替沿墙向下移动，髋部前推、身体逐渐后弯。','手到达地面进入全桥，停顿片刻。','降下身体仰卧休息；本式不练向上走回。'],
    cues: ['全程髋部向前送，保持重心在双脚之间。','移动速度缓慢，每一步都停稳。'],
    mistakes: ['离墙距离过远或过近导致失衡。','在尚未熟练全桥前尝试。']
  }),
  cc('cc-bridge', 8, 'cc-bridge-8', '上行墙桥', 'Wall Walking Bridges (Up)', std('1 组 × 2 次','2 组 × 4 次','2 组 × 8 次'), {
    impact: 'medium',
    description: '在下行墙桥基础上，从全桥沿墙向上“走”回站立。',
    setup: ['与下行墙桥相同：背对墙、距墙约一臂站立。'],
    steps: ['沿墙向下走进入全桥。','在底部停顿后，双手交替沿墙向上走。','髋部前推、腿部发力，回到站立姿势。'],
    cues: ['上行时依靠腿与臀把重心推回双脚上方。','每一步手都要稳住再移动，不急于起身。'],
    mistakes: ['上行时手推墙过猛导致前扑。']
  }),
  cc('cc-bridge', 9, 'cc-bridge-9', '合桥', 'Closing Bridges', std('1 组 × 1 次','2 组 × 3 次','2 组 × 6 次'), {
    impact: 'medium',
    description: '不借助墙面，从站立后仰慢慢下放进入全桥。',
    setup: ['双脚与肩同宽站立，双臂上举过头。','地面平整，可在后方铺软垫。'],
    steps: ['髋部前推、膝微屈，身体缓慢向后弯曲。','目视后方地面，双手在控制中着地进入全桥。','停顿后放回地面。'],
    cues: ['下降全程保持控制，不“掉”下去。','初期可请人保护腰部。'],
    mistakes: ['下行失控砸地。','腰椎单点折弯而不是整条脊柱均匀后弯。']
  }),
  cc('cc-bridge', 10, 'cc-bridge-10', '铁板桥', 'Stand-to-Stand Bridges', std('1 组 × 1 次','2 组 × 3 次','2 组 × 30 次（书中精英标准）'), {
    impact: 'medium', aliases: ['站立-全桥-站立'],
    description: '桥系列终极式：从站立后弯进入全桥，再从全桥直接起身回到站立。',
    setup: ['双脚与肩同宽站立，双臂上举。'],
    steps: ['髋部前推，缓慢后弯至双手着地成全桥。','停顿 1 秒。','重心前移到双脚，腿与臀发力推起身体回到站立。'],
    cues: ['起身关键是把重心从手移回脚，可前后轻微摆动协助。','下行与起身都保持脊柱整体均匀弯曲，而非只折下背。'],
    mistakes: ['起身时猛甩上身。','未掌握合桥就尝试。']
  })
];

const hspu = [
  cc('cc-hspu', 1, 'cc-hspu-1', '靠墙头倒立', 'Wall Headstands', std('保持 30 秒','保持 1 分钟','保持 2 分钟'), {
    secondaryRegions: ['arms','core','neck'],
    description: '以头和双手三点支撑靠墙倒立，建立倒置状态下的适应与平衡感。',
    setup: ['在墙前铺软垫，跪姿，双手撑地距墙约一掌宽，两手间距略宽于肩。','头顶发际线附近放在两手前方，与双手成三角形。'],
    steps: ['双脚走近身体，髋部抬到肩上方。','一次一条腿、或屈膝收腿后缓慢上抬，脚跟靠墙。','保持静止，稍后先放下一条腿再放另一条，缓慢回到跪姿。'],
    cues: ['大部分重量由双手分担，头颈不承受全部体重。','身体沿墙伸直，腹部收紧。'],
    mistakes: ['踢腿过猛撞墙。','颈部有不适或高血压、青光眼等情况不宜倒立。'],
    breathing: '倒立中保持平稳自然呼吸，不憋气。', dose: HOLD_DOSE
  }),
  cc('cc-hspu', 2, 'cc-hspu-2', '乌鸦式', 'Crow Stands', std('保持 10 秒','保持 30 秒','保持 1 分钟'), {
    primaryRegions: ['shoulders','forearms_wrists'], secondaryRegions: ['arms','core'],
    aliases: ['Crow Pose','鸦式'],
    description: '双手撑地、膝盖放在肘外侧，身体前倾让双脚离地的手平衡。',
    setup: ['深蹲，双手平放在身前地面，与肩同宽，手指张开。','屈肘，把膝盖内侧抵在上臂外侧、肘部附近。'],
    steps: ['身体缓慢前倾，把重心移到双手。','一只脚、再另一只脚离地，保持平衡。','在控制中先放脚落地。'],
    cues: ['目视前方地面，不看脚下。','手指抓地调节前后平衡。'],
    mistakes: ['前倾过度扑倒——面前可放软垫。','手腕未热身即长时间支撑。'],
    breathing: '保持平稳呼吸，不憋气。', dose: HOLD_DOSE
  }),
  cc('cc-hspu', 3, 'cc-hspu-3', '靠墙手倒立', 'Wall Handstands', std('保持 30 秒','保持 1 分钟','保持 2 分钟'), {
    impact: 'medium',
    description: '双手撑地、双脚靠墙的手倒立静止保持，为倒立撑积累肩部耐力。',
    setup: ['面向墙，双手撑地距墙约一掌宽，与肩同宽，手指张开。'],
    steps: ['一条腿先上，另一条腿轻蹬地面，受控地把双脚送到墙上。','手臂伸直，身体沿墙伸展，保持静止。','一次放下一条腿，回到站姿。'],
    cues: ['肩膀向上顶，把自己“推高”。','腹部、臀部收紧，减少塌腰。'],
    mistakes: ['踢墙过猛。','手臂弯曲、肩部塌陷。'],
    breathing: '保持平稳呼吸，不憋气。', dose: HOLD_DOSE
  }),
  cc('cc-hspu', 4, 'cc-hspu-4', '靠墙半倒立撑', 'Half Handstand Pushups', std('1 组 × 5 次','2 组 × 10 次','2 组 × 20 次'), {
    impact: 'medium',
    description: '靠墙手倒立，屈肘下放一半（约 90°）后推起。',
    setup: ['靠墙手倒立，双手与肩同宽；可在头下方放篮球作深度参照。'],
    steps: ['屈肘下放至肘约 90°（或头触到球）。','停顿 1 秒。','推起至手臂伸直。', TEMPO],
    cues: ['肘部略向前，不完全外张。','身体贴墙保持直线。'],
    mistakes: ['下放过快，头部碰撞。','脚在墙上乱蹬。']
  }),
  cc('cc-hspu', 5, 'cc-hspu-5', '靠墙倒立撑', 'Handstand Pushups', std('1 组 × 5 次','2 组 × 10 次','2 组 × 15 次'), {
    impact: 'medium',
    description: '靠墙手倒立，全程下放至头顶轻触地面再推起。',
    setup: ['靠墙手倒立，双手与肩同宽，头下方铺软垫。'],
    steps: ['屈肘缓慢下放，直到头顶轻触垫面。','停顿 1 秒，头部不承重。','推起至手臂伸直。', TEMPO],
    cues: ['“亲吻婴儿”式轻触，不把重量放到头颈。','下放时保持肩部稳定，避免塌肩。'],
    mistakes: ['头部撞地。','肩部活动度不足时，身体大幅弓背代偿。']
  }),
  cc('cc-hspu', 6, 'cc-hspu-6', '靠墙窄距倒立撑', 'Close Handstand Pushups', std('1 组 × 5 次','2 组 × 9 次','2 组 × 12 次'), {
    impact: 'medium',
    description: '双手靠拢（两手相触）的靠墙倒立撑，增加手臂负荷。',
    setup: ['靠墙手倒立，双手靠拢，两手食指与拇指相触或几乎相触。'],
    steps: ['屈肘下放至头部轻触手背附近。','停顿 1 秒。','推起至伸直。', TEMPO],
    cues: ['肘部向前而不是向外。','头部仍只轻触地面，重量留在双手。'],
    mistakes: ['肘外翻、腕部压力过大。']
  }),
  cc('cc-hspu', 7, 'cc-hspu-7', '靠墙偏重倒立撑', 'Uneven Handstand Pushups', std('1 组 × 5 次（每侧）','2 组 × 8 次（每侧）','2 组 × 10 次（每侧）'), {
    impact: 'medium',
    description: '一只手撑在篮球上、另一只手撑地的靠墙倒立撑，负荷偏向撑地侧。',
    setup: ['在墙前放一个篮球，靠墙倒立时一只手撑在球上、另一只手撑地。'],
    steps: ['以撑地手为主屈肘下放。','停顿 1 秒。','推回伸直；完成后换侧。', TEMPO],
    cues: ['撑球手只负责平衡。','双脚贴墙，躯干保持正对墙面不扭转。'],
    mistakes: ['球滚动导致失衡。']
  }),
  cc('cc-hspu', 8, 'cc-hspu-8', '靠墙单臂半倒立撑', 'Half One-Arm Handstand Pushups', std('1 组 × 4 次（每侧）','2 组 × 6 次（每侧）','2 组 × 8 次（每侧）'), {
    impact: 'medium',
    description: '靠墙单手倒立，做上半程屈伸。',
    setup: ['靠墙手倒立后，把一只手移到体侧离地，用单手支撑，身体侧靠墙保持平衡。'],
    steps: ['单臂屈肘下放一半。','停顿 1 秒。','推起至伸直；完成后换手。', TEMPO],
    cues: ['身体紧贴墙面以获得稳定。','支撑手手指张开抓地，肩部主动上顶。'],
    mistakes: ['单臂支撑时间过长导致肩部过度疲劳。']
  }),
  cc('cc-hspu', 9, 'cc-hspu-9', '靠墙杠杆倒立撑', 'Lever Handstand Pushups', std('1 组 × 3 次（每侧）','2 组 × 4 次（每侧）','2 组 × 6 次（每侧）'), {
    impact: 'medium',
    description: '靠墙倒立，一只手撑地做全程屈伸，另一只手伸直撑在侧方篮球上作杠杆辅助。',
    setup: ['靠墙倒立，一只手撑地，另一只手臂向侧方伸直，按在篮球上。'],
    steps: ['撑地臂屈肘下放至头部接近地面。','停顿 1 秒。','主要由撑地臂推起；完成后换侧。', TEMPO],
    cues: ['辅助臂保持伸直，逐步减少用力。','下放速度慢于推起，头部轻触即止。'],
    mistakes: ['辅助臂弯曲分担过多负荷。']
  }),
  cc('cc-hspu', 10, 'cc-hspu-10', '靠墙单臂倒立撑', 'One-Arm Handstand Pushups', std('1 组 × 1 次（每侧）','2 组 × 2 次（每侧）','1 组 × 5 次（每侧，书中精英标准）'), {
    impact: 'medium',
    description: '倒立撑系列终极式：靠墙单手倒立完成全程屈伸。',
    setup: ['靠墙单手倒立，另一只手放在体侧。'],
    steps: ['单臂屈肘下放至头部轻触地面。','停顿 1 秒。','单臂推起；完成后换手。', TEMPO],
    cues: ['身体与墙保持接触获得稳定。','公开讨论中，这一式的可行性与标准存在争议，作为长期目标看待。'],
    mistakes: ['肩部准备不足即尝试，受伤风险高。']
  })
];

export const activities = [...pushups, ...squats, ...pullups, ...legraises, ...bridges, ...hspu];
export const relations = [
  ...chain(pushups.map(a => a.id), families['cc-pushup'].preserves),
  ...chain(squats.map(a => a.id), families['cc-squat'].preserves),
  ...chain(pullups.map(a => a.id), families['cc-pullup'].preserves),
  ...chain(legraises.map(a => a.id), families['cc-legraise'].preserves),
  ...chain(bridges.map(a => a.id), families['cc-bridge'].preserves),
  ...chain(hspu.map(a => a.id), families['cc-hspu'].preserves)
];
