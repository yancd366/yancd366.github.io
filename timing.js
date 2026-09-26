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
