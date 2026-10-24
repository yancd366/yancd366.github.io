export const TRAINING_MINUTES=[10,20,30,45,60,90,120];
// A missing mode is a legacy request. Do not invalidate old short plans or logs.
export const minuteRange=r=>r?.timeMode==='training'?{min:10,max:120}:{min:2,max:180};
export const validMinutes=r=>Number.isInteger(r?.minutes)&&r.minutes>=minuteRange(r).min&&r.minutes<=minuteRange(r).max;
