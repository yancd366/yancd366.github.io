// Shared display/server policy. Older tasks retain their original two-day lifetime.
export const PREVIEW_RETENTION_DAYS=7;
export const PREVIEW_RETENTION_SECONDS=PREVIEW_RETENTION_DAYS*24*60*60;
export const previewDaysFor=capture=>capture?.previewRetentionDays===PREVIEW_RETENTION_DAYS?PREVIEW_RETENTION_DAYS:2;
export function jobLookupExpired(capture,error,now=Date.now()){
  const age=now-Date.parse(capture?.updatedAt||capture?.capturedAt||'');
  // Allow brief KV propagation, but stop polling old two-day jobs that no longer exist.
  return age>PREVIEW_RETENTION_SECONDS*1000||(error?.code==='job_not_found'&&age>2*60*1000);
}
