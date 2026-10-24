// Conservative quality gate, not a claim that all other text is correct.
export function transcriptQuality(text){
 const t=String(text||'').trim(),movement=/深蹲|俯卧撑|拉伸|训练|呼吸|膝盖|髋关节|肩胛|收紧|抬腿|侧平举|组数|次数|每侧|足弓|脚趾|抓地|起势|开立|举手|颈部|换边|\b(?:squat|lunge|workout|reps|sets|breath)\b/i.test(t);
 const lyric=/芭比|barbie|i['’]?m in love|\blove(?:[\s,，]+love){3,}|\bturned out[\s,，]+turned out[\s,，]+turned out[\s,，]+turned down/i.test(t);
 const repeated=t.match(/(.{2,8})(?:[\s,，。.!！]*\1){4,}/u),squash=s=>s.replace(/[\s\p{P}\p{S}]/gu,'');
 const repetitive=Boolean(repeated&&squash(t.replace(repeated[0],'')).length<8);
 return {status:t&&!movement&&(lyric||repetitive)?'suspected_music':t?'unverified':'empty',reason:t&&!movement&&(lyric||repetitive)?'疑似歌词或重复噪声，不能据此识别动作或训练安排。':''};
}
export function needsVisualReview(capture){
 if(!capture?.transcript?.text||capture.cardDraft||capture.manualSummary||capture.ingestErrorCode==='too_long')return false;
 const visual=capture.videoEvidence?.some(x=>x.text)||capture.imageEvidence?.some(x=>x.text)||capture.liveVideoEvidence?.some(x=>x.status==='analyzed'&&x.text);
 return !visual&&transcriptQuality(capture.transcript.text).status==='suspected_music';
}
