export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const paths = {
  today:'M3 12h4l3-8 4 16 3-8h4', records:'M8 3H5v18h14V3h-3M9 3h6v4H9zM8 12h8M8 16h5',
  library:'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z', knowledge:'M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1v15',
  body:'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M5 21v-3a7 7 0 0 1 14 0v3', arrow:'M5 12h14m-5-5 5 5-5 5',
  chevron:'m9 5 7 7-7 7', plus:'M12 5v14M5 12h14', close:'m6 6 12 12M18 6 6 18', check:'m5 12 4 4L19 6',
  clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', home:'m3 10 9-7 9 7v11h-7v-7h-4v7H3z',
  office:'M4 21V3h11v18M15 10h5v11M8 7h3M8 11h3M8 15h3M2 21h20', gym:'M7 8v8m10-8v8M7 12h10M3 9v6h4V9H3m14 0h4v6h-4',
  strength:'M7 8v8m10-8v8M7 12h10M3 9v6h4V9H3m14 0h4v6h-4', mobility:'M12 3v18M3 12h18m-6-6 6 6-6 6M9 6l-6 6 6 6',
  coordination:'M5 7h6v6H5zM13 15h6v6h-6zM17 3v6M14 6h6', cardio:'M3 12h4l3-8 4 16 3-8h4', recovery:'M20 4c-8-1-15 3-15 9a7 7 0 0 0 7 7c6 0 9-8 8-16ZM5 20l9-10',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', edit:'m4 16-1 5 5-1L20 8l-4-4ZM14 6l4 4',
  bookmark:'M5 3h14v18l-7-5-7 5V3z', link:'m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-2 2',
  download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', info:'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  swap:'M3 7h16l-4-4m6 14H5l4 4', play:'m8 4 12 8-12 8V4z', sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  bell:'M18 9a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0', bellOff:'M18 9a6 6 0 0 0-9-5m-2 3v2c0 7-3 8-3 8h13M13.7 21a2 2 0 0 1-3.4 0M3 3l18 18'
};
export const icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.today}"/></svg>`;
export const badge = (text, style='') => `<span class="badge ${style}">${esc(text)}</span>`;
export const dateText = (date, opts={month:'long',day:'numeric'}) => date ? new Date(date).toLocaleDateString('zh-CN',opts) : '从表格收藏';
export const empty = (title,text,button='') => `<div class="empty">${icon('records')}<h3>${title}</h3><p>${text}</p>${button}</div>`;
export const elapsedText = start => { const sec=Math.max(0,Math.floor((Date.now()-new Date(start))/1000));return `${Math.floor(sec/60).toString().padStart(2,'0')}:${(sec%60).toString().padStart(2,'0')} 已经过`; };
