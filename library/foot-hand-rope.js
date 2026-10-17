import { entry } from './entry.js';

// Movement mechanics are paraphrased from the cited educational material.
// These are general candidates for pain-free activity, not clinical rehabilitation plans.
const ref=(title,url)=>({title,url,type:'professional_reference'});
export const sources={
  nhsFootControl:ref('NHS BNSSG · Toe Yoga / Foot Doming / Towel Grab','https://myjointhealthhub.bnssg.nhs.uk/foot-ankle-pain/bunions-hallux-valgus/'),
  nhsToeSplay:ref('NHS Bexley · Toe splaying','https://msk-bexley.nhs.uk/conditions/foot-and-ankle-pain/arthritis-of-the-first-toe-joint'),
  aaosFootConditioning:ref('AAOS · Foot and Ankle Conditioning Program','https://orthoinfo.aaos.org/globalassets/pdfs/2022-rehab_foot-and-ankle_final.pdf'),
  nhsActiveWrist:ref('Chelsea and Westminster NHS · Active wrist exercises','https://www.chelwest.nhs.uk/your-visit/patient-leaflets/hand-therapy/active-wrist-exercises'),
  aaosForearmRotation:ref('AAOS · Forearm Supination & Pronation','https://orthoinfo.aaos.org/globalassets/pdfs/a00790_therapeutic-exercise-program-for-epicondylitis_final.pdf'),
  nhsFingerSpread:ref('NHS Bexley · Resisted Finger Spread','https://msk-bexley.nhs.uk/conditions/hand-pain/strengthening-finger-exercises'),
  aceBasicRope:ref('ACE · Jumping Rope technique','https://www.acefitness.org/resources/pros/expert-articles/5326/6-exercise-swaps-that-will-kick-up-the-intensity-of-your-workout/'),
  aceRopePatterns:ref('ACE · Jump rope coordination patterns','https://www.acefitness.org/certifiednewsarticle/2583/what-s-in-a-top-trainer-s-toolkit-six-elite-fitness-pros-share-their-favorite-equipment-and-exercises/'),
  aceAirRope:ref('ACE · At-Home Exercise Routines for Busy Parents','https://www.acefitness.org/resources/everyone/blog/7556/at-home-exercise-routines-for-busy-parents/')
};
const FOOT={primaryRegions:['calves_ankles'],places:['home','office','gym']};
const HAND={primaryRegions:['forearms_wrists'],places:['home','office','gym']};
const ROPE={primaryRegions:['calves_ankles'],secondaryRegions:['forearms_wrists'],loadedRegions:['hips_legs','shoulders','arms','core'],places:['home','gym'],impact:'medium',familyId:'rope-skipping',canonicalId:'rope-skipping'};
const stop='出现疼痛、麻木、眩晕或明显不适时停止。';

export const activities=[
  entry('foot-short-foot','坐姿短足（足弓收拢）','strength',['足弓','足底小肌群'],3,{...FOOT,familyId:'foot-intrinsic',aliases:['短足训练','足弓训练','足弓抬升','short foot','foot doming'],sourceId:'nhsFootControl',
    description:'不蜷脚趾地轻轻收拢足底，练习足弓的主动控制；不据此判断扁平足或承诺矫正足型。',
    setup:['坐稳，双脚平放；脚跟与前脚掌接触地面。'],steps:['保持脚趾舒展，轻轻收紧足底，让足弓略微抬起。','保持约 3～5 秒后完全放松，换脚重复。'],
    cues:['幅度很小也可以，不需要明显改变脚型。','脚跟、前脚掌不抬起，脚踝不向外倒。',stop],mistakes:['抓地蜷趾、滚向脚外侧或用力抽紧足底。'],breathing:'自然呼吸。',dose:'每侧 5～8 次，先做 1 组；这是一般练习参考，不是康复处方。'}),
  entry('foot-toe-yoga','脚趾分离抬起','coordination',['足部','脚趾控制'],3,{...FOOT,familyId:'toe-control',aliases:['脚趾瑜伽','大脚趾抬起','脚趾独立控制','toe yoga'],sourceId:'nhsFootControl',
    description:'交替抬大脚趾与其余四趾，练习脚趾分离控制，不等同于足弓力量训练。',
    setup:['坐稳，脚跟及前脚掌落地。'],steps:['四个小脚趾留在地面，尝试轻抬大脚趾。','放回后让大脚趾轻贴地，尝试抬起其余四趾，再放松。'],
    cues:['抬不起时先尝试小幅度，不用手掰脚趾。','脚踝和膝盖不随之摆动。',stop],mistakes:['屏气硬抬、用脚踝外翻代替脚趾运动。'],breathing:'自然呼吸。',dose:'每侧交替 5～8 次，先做 1 轮。'}),
  entry('foot-toe-splay','坐姿脚趾展开','coordination',['足部','脚趾控制'],2,{...FOOT,familyId:'toe-control',aliases:['脚趾张开','脚趾外展','toe splay'],sourceId:'nhsToeSplay',
    description:'主动展开再放松脚趾，练习足部小幅度控制；本版为不加阻力的版本。',
    setup:['坐稳，脚掌放在平整地面，脚趾放松。'],steps:['尝试把脚趾向两侧分开，保持片刻。','缓慢放松回位，左右脚分别练习。'],cues:['分开的幅度不重要，不用手拉扯。','脚掌留在地面，不用蜷趾抓地。',stop],mistakes:['强行掰趾或用踝关节扭动制造幅度。'],breathing:'自然呼吸。',dose:'每侧 5～10 次，1 轮。'}),
  entry('foot-towel-curl','脚趾抓毛巾','strength',['足部','足趾屈肌'],3,{...FOOT,familyId:'toe-flexion',aliases:['毛巾抓地','脚趾卷毛巾','towel toe curl','小肌群足部训练'],sourceId:'nhsFootControl',
    description:'用脚趾逐次把毛巾带向自己，练习脚趾屈曲抓握；与不蜷趾的短足练习不同。',
    setup:['坐稳，在前脚掌下放一条小毛巾；周围清空杂物。'],steps:['脚跟留在地上，轻屈脚趾抓住毛巾并拉近。','松开脚趾，把毛巾铺平后再练，随后换脚。'],cues:['先用空毛巾，不在毛巾上加重物。','慢慢抓、完全放松，不反复用力到抽筋。',stop],mistakes:['用整条腿拖动毛巾、脚趾长时间攥紧。'],breathing:'自然呼吸。',dose:'每侧 5～10 次，1～2 组。'}),
  entry('foot-cotton-pickup','脚趾拾取棉球','coordination',['足部','脚趾控制'],3,{...FOOT,familyId:'toe-flexion',aliases:['脚趾捡物','脚趾抓棉球','marble pickup','cotton ball pickup'],sourceId:'aaosFootConditioning',
    description:'坐姿用脚趾把棉球移到小碗，练习足趾抓放和精细控制；用棉球代替易滚动的弹珠。',
    setup:['坐稳，在脚前近处放几个棉球和小碗；结束后全部收好。'],steps:['用脚趾轻夹一个棉球，移到碗上方。','松开脚趾放入碗中，逐个重复，再换脚。'],cues:['保持坐姿，不站在零散物品旁练习。','物品放近一些，不用身体探远处。',stop],mistakes:['站着捡物、使用玻璃碎片或把小物品散留在地面。'],breathing:'自然呼吸。',dose:'每侧 5～10 个，1 轮。'}),
  entry('hand-forearm-rotation','坐姿前臂旋前旋后','mobility',['前臂','肘'],2,{...HAND,familyId:'forearm-rotation',aliases:['小臂旋转','前臂翻掌','掌心上下翻转','forearm pronation supination'],sourceId:'nhsActiveWrist',
    description:'固定上臂，缓慢翻转掌心朝上、朝下，练习前臂旋转活动；这是无负重版本。',
    setup:['坐稳，肘弯曲约 90 度贴近身侧，手指放松。'],steps:['缓慢转动前臂，让掌心朝上。','回到拇指朝上的中间位置，再让掌心朝下，随后回正。'],cues:['动作来自前臂，不用肩膀或身体带动。','手腕不向两侧折，幅度舒适即可。',stop],mistakes:['上臂向外摆或用力拧到极限。'],breathing:'自然呼吸。',dose:'每侧 5～10 次，1～2 轮。'}),
  entry('hand-weighted-rotation','轻哑铃前臂旋转','strength',['前臂','旋前旋后肌群','小臂'],4,{...HAND,places:['home','gym'],equipment:['dumbbell'],familyId:'forearm-rotation',tier:2,difficulty:'中级 · 先掌握无负重翻掌',aliases:['负重旋前旋后','小臂旋前旋后','weighted forearm rotation'],sourceId:'aaosForearmRotation',
    description:'在稳定支撑上慢慢翻转轻哑铃，练习前臂旋转力量；不用于疼痛或术后自行康复。',
    setup:['坐稳，屈肘约 90 度，前臂放在稳固桌面，手腕伸出边缘；握住很轻的哑铃中部。'],steps:['从拇指朝上的位置缓慢转到掌心朝上，再回正。','缓慢转到掌心朝下，再回正；全程控制重量。'],cues:['先熟悉无负重版本，再从可控制的最轻重量开始。','肩膀和肘不借力，不握哑铃末端延长杠杆。',stop],mistakes:['用锤子式长杠杆、让重量把手猛拉到极限。'],breathing:'自然呼吸，不屏气。',dose:'每侧 6～10 次，1～2 组；组间休息 45～60 秒。'}),
  entry('hand-band-finger-spread','轻阻力手指展开','strength',['手部','手指外展肌'],3,{...HAND,equipment:['band'],familyId:'finger-spread',aliases:['手指外展','弹力圈张指','finger spread','手部小肌群训练'],sourceId:'nhsFingerSpread',
    description:'用手指专用轻阻力宽弹力圈练习张开手指，与握力抓紧动作互补。',
    setup:['坐稳，前臂放在桌面，手指并拢；套上不勒手的轻阻力宽弹力圈。'],steps:['手指慢慢展开，保持短暂停顿。','有控制地合拢，随后松开弹力圈休息并换手。'],cues:['普通高阻力健身带不能直接代替手指小弹力圈。','幅度小而可控，手腕保持平直。',stop],mistakes:['圈过紧使手指变色、追求最大张幅或快速弹回。'],breathing:'张开时呼气，合拢时吸气。',dose:'每手 5～10 次，1～2 组。'}),
  entry('hand-wrist-side-glide','坐姿手腕侧向活动','mobility',['手腕','前臂'],2,{...HAND,familyId:'wrist-deviation',aliases:['腕桡偏尺偏','手腕左右摆','radial ulnar deviation'],sourceId:'nhsActiveWrist',
    description:'前臂保持不动，手掌在平面内向拇指侧、小指侧缓慢移动，练习腕部活动。',
    setup:['坐稳，前臂和手掌朝下放在光滑桌面，手指放松。'],steps:['手掌缓慢向拇指侧移动少许，再回正。','向小指侧移动少许，再回正，交替重复。'],cues:['不加重量，不用另一只手压。','前臂留在桌面，肩肘不跟着摆。',stop],mistakes:['用肘部带动整只手，或把手腕推到疼痛范围。'],breathing:'自然呼吸。',dose:'每侧 5～10 次，1～2 轮。'}),
  entry('rope-basic-single','基础双脚单摇跳绳','cardio',['小腿','足踝','心肺'],4,{...ROPE,equipment:['jump_rope'],aliases:['基础跳绳','双脚跳绳','双脚单摇','basic jump rope','single under'],sourceId:'aceBasicRope',
    description:'每转绳一圈做一次低幅双脚跳，练习转绳节奏与心肺；跳绳有落地冲击，不是疼痛部位的恢复动作。',
    setup:['穿合适运动鞋，选择平整防滑、有一定弹性的地面；头顶和四周留足空间。','按绳具说明调整长度，先原地轻跳确认可控。'],steps:['双手持柄，主要用手腕转绳。','绳接近脚前时低幅起跳，柔和落地；绊绳后停稳重新开始。'],cues:['肘靠近身体、手不过度张开，膝盖保持柔和。','不追求速度、高度或连续时长；喘不过来就停。',stop],mistakes:['僵直落地、跳得过高或在拥挤办公室里甩绳。'],breathing:'随节奏均匀呼吸。',dose:'先 15～30 秒一轮，休息 30～60 秒，2～4 轮。'}),
  entry('rope-alternate-step','交替换脚单摇跳绳','cardio',['小腿','足踝','心肺','协调'],4,{...ROPE,equipment:['jump_rope'],tier:2,difficulty:'中级 · 先掌握基础单摇',aliases:['跑步式跳绳','交替脚跳绳','alternate-foot skipping'],sourceId:'aceRopePatterns',
    description:'每圈绳交替换脚落地，练习左右节奏；与拳击步重心切换不同，不视为零冲击版本。',
    setup:['先能稳定完成基础单摇；穿运动鞋，在宽敞防滑地面练习。'],steps:['从基础双脚跳开始，逐渐换成左右脚交替落地。','维持低幅跳动与均匀转绳，失去节奏时停下来重置。'],cues:['脚步小、身体直立，不做大幅高抬腿。','先短回合，不靠加速补救绊绳。',stop],mistakes:['用单脚反复猛跳、跳得越来越高。'],breathing:'自然均匀呼吸。',dose:'每轮 15～30 秒，休息 45～60 秒，2～3 轮。'}),
  entry('rope-air-skip','徒手模拟跳绳','cardio',['小腿','足踝','心肺','节奏'],3,{...ROPE,aliases:['无绳跳绳','空气跳绳','air jump rope'],sourceId:'aceAirRope',
    description:'不拿绳做小幅跳动与模拟转绳，练习节奏；虽然没有绳，仍有落地冲击。',
    setup:['穿运动鞋，在平整防滑、周围无障碍的地方站稳。'],steps:['双手在身侧模拟轻转绳，同时低幅跳起。','柔和落地后继续几次，休息后再练。'],cues:['膝盖柔和、落地轻；不刻意踮高脚尖。','保持轻松节奏，不能舒服交谈时降低强度或休息。',stop],mistakes:['误把无绳当零冲击而持续猛跳。'],breathing:'均匀呼吸。',dose:'每轮 15～30 秒，休息 30～60 秒，2～3 轮。'})
];
export const relations=[
  {from:'foot-short-foot',to:'foot-towel-curl',type:'alternative',preserves:'足部小肌群练习',differs:'短足不蜷趾、练足弓控制；毛巾练脚趾抓握，并非完全等效。'},
  {from:'hand-forearm-rotation',to:'hand-weighted-rotation',type:'progression',preserves:'固定上臂的前臂旋转',differs:'增加轻阻力，需要先掌握无负重动作；疼痛时两种版本都不推荐。'},
  {from:'rope-basic-single',to:'rope-alternate-step',type:'progression',preserves:'单摇节奏与柔和落地',differs:'从双脚同步变为左右交替，协调要求提高。'},
  {from:'rope-basic-single',to:'rope-air-skip',type:'alternative',preserves:'小幅跳动与节奏练习',differs:'无需绳具但仍有冲击，不能练习实际过绳时机。'},
  {from:'rope-alternate-step',to:'bx-jump-rope',type:'alternative',preserves:'转绳节奏与心肺练习',differs:'跑步式每圈换脚；拳击步可以连续数圈后换承重脚，脚下节奏不同。'}
];
