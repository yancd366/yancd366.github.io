// Shared constructor for catalogue entries. Guidance fields are plain text; the doses are
// general reference ranges, not individualized prescriptions.
export const entry = (id, name, category, body, minutes, options = {}) => ({
  id, familyId: id, name, category, body, minutes,
  // 默认阶段:活动度当热身、放松当收尾、其余进正式段;个别动作在 options.phase 里覆盖。
  phase: category === 'mobility' ? 'warmup' : category === 'recovery' ? 'cooldown' : 'main',
  primaryRegions: [], secondaryRegions: [],
  places: ['home', 'gym'], equipment: [], difficulty: '入门', tier: 1, impact: 'low',
  system: 'general', level: null,
  setup: [], steps: [], cues: ['在舒适范围内尝试，保持自然呼吸。', '出现疼痛、眩晕或明显不适时停止。'], mistakes: [],
  breathing: '', dose: '', standards: [],
  sourceId: 'design', sourceLocator: null, editorialStatus: 'prototype', aliases: [],
  description: '', ...options
});
// Builds easier→harder progression relations for an ordered list of activity ids.
export const chain = (ids, preserves, differs = '难度、杠杆或支撑方式提高，先达到上一式标准再进阶。') =>
  ids.slice(1).map((to, i) => ({ from: ids[i], to, type: 'progression', preserves, differs }));
