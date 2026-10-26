import {bodyRegions} from './catalog.js';
export const EXTRA_REGIONS={eyes:'眼部',face:'五官与面部'};
export function customRegionList(value){return [...new Set((Array.isArray(value)?value:String(value||'').split(/[、,，;；\n]+/)).map(x=>String(x).trim()).filter(Boolean))];}
export function regionExtras(x={}){
 const customRegions=customRegionList(x.customRegions),extraRegions=[...new Set(Array.isArray(x.extraRegions)?x.extraRegions:[])];
 if(customRegions.length>4||customRegions.some(x=>x.length>16||/[<>\x00-\x1f]/.test(x)))throw Error('自定义部位最多4项，每项1～16字，不含特殊标记。');
 if(extraRegions.some(x=>!Object.hasOwn(EXTRA_REGIONS,x)))throw Error('补充部位选项无效。');
 return {customRegions,extraRegions};
}
export function suggestActivityRegions(text){
 const patterns={chest:/胸/,back:/背|肩胛/,shoulders:/肩|三角肌/,arms:/手臂|肱二|肱三/,core:/核心|腹|躯干/,hips_legs:/臀|大腿|髋|膝/,forearms_wrists:/小臂|前臂|腕|握力/,calves_ankles:/小腿|足|踝|脚/,neck:/颈|脖子/};
 return {primaryRegions:Object.keys(bodyRegions).filter(k=>patterns[k].test(text)),extraRegions:Object.keys(EXTRA_REGIONS).filter(k=>(k==='eyes'?/眼|视觉/:/五官|面部|脸|唇|口部|下颌|鼻|耳部/).test(text))};
}
