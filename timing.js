// Background time is never counted as exercise time. Save the paused snapshot in the draft.
export function pauseActiveTimer(timer,now=Date.now()){
  if(!timer||timer.phase==='paused')return timer;
  return {...timer,elapsedSec:timer.phase==='work'?Math.max(0,Math.floor((now-timer.workStart)/1000)):0,phase:'paused'};
}
export function resumeActiveTimer(timer,now=Date.now(),readySeconds=3){
  if(!timer||timer.phase!=='paused')return timer;
  if(!timer.elapsedSec)return {...timer,phase:'ready',readyEndsAt:now+readySeconds*1000};
  const workStart=now-timer.elapsedSec*1000;
  return {...timer,phase:'work',workStart,workEndsAt:timer.target?workStart+(timer.target.countdown?timer.target.min:timer.target.max)*1000:undefined};
}
// UI-only dwell clock. Never use it as completed exercise time or persist it in a session.
export function viewDwellMs(clock,now=Date.now()){
  if(!clock?.key)return 0;
  return clock.elapsedMs+(clock.since==null?0:Math.max(0,now-clock.since));
}
export function updateViewDwell(clock,key,active,now=Date.now()){
  if(!key)return null;
  if(clock?.key!==key)return {key,elapsedMs:0,since:active?now:null};
  if(active===(clock.since!=null))return clock;
  return {key,elapsedMs:viewDwellMs(clock,now),since:active?now:null};
}
export function viewDwellText(clock,now=Date.now()){
  if(!clock?.key)return '—';
  const sec=Math.floor(viewDwellMs(clock,now)/1000);
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
