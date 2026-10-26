export const PLANNER_SECTIONS=['focus','references'];
export function plannerPanelsHTML(s,focus,refs){
 refs=refs.replace('<legend>本次参考资料</legend>','<legend class="sr-only">本次参考资料</legend>');
 const order=plannerOrder(s.settings?.plannerSectionOrder).filter(id=>id==='focus'||refs),titles={focus:'训练重点与状态',references:'本次参考资料'};
 return `<div class="planner-panels">${order.map((id,n)=>`<section class="planner-panel" data-planner-section="${id}"><header><h3>${titles[id]}</h3><div class="planner-panel-tools"><button class="icon-button" type="button" data-planner-move="${id}" data-direction="-1" aria-label="上移${titles[id]}" ${n===0?'disabled':''}>↑</button><button class="icon-button" type="button" data-planner-move="${id}" data-direction="1" aria-label="下移${titles[id]}" ${n===order.length-1?'disabled':''}>↓</button><button class="icon-button planner-drag" type="button" data-planner-drag="${id}" aria-label="拖动${titles[id]}排序">⠿</button></div></header>${id==='focus'?focus:refs}</section>`).join('')}</div>`;
}
export function plannerOrder(value){return Array.isArray(value)&&value.length===2&&new Set(value).size===2&&value.every(x=>PLANNER_SECTIONS.includes(x))?[...value]:[...PLANNER_SECTIONS];}
export function movePlannerSection(value,id,direction){const order=plannerOrder(value),at=order.indexOf(id),to=at+direction;if(at<0||![-1,1].includes(direction)||to<0||to>=order.length)return order;[order[at],order[to]]=[order[to],order[at]];return order;}
