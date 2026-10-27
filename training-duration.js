export const TRAINING_MINUTES=[10,20,30,45,60,90,120];
export const DURATION_STEPS=[10,15,30,45,60,75,90,105,120];
export const durationChoices=minutes=>[...new Set([...DURATION_STEPS,...(Number.isInteger(minutes)&&minutes>=10&&minutes<=120?[minutes]:[])])].sort((a,b)=>a-b);
export function durationAt(index,choices){return Number.isInteger(index)&&Array.isArray(choices)&&choices.length<=10&&Number.isInteger(choices[index])&&choices[index]>=10&&choices[index]<=120?choices[index]:null;}
// A missing mode is a legacy request. Do not invalidate old short plans or logs.
export const minuteRange=r=>r?.timeMode==='training'?{min:10,max:120}:{min:2,max:180};
export const validMinutes=r=>Number.isInteger(r?.minutes)&&r.minutes>=minuteRange(r).min&&r.minutes<=minuteRange(r).max;
