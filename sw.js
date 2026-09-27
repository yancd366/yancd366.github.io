const CACHE='xundong-shell-v9';
const ASSETS=['/','/styles.css','/app.js','/views.js','/ui.js','/domain.js','/catalog.js','/ai.js','/ai-direct.js','/skill-prompts.js','/training.js','/timing.js','/abilities.js','/knowledge.js','/safety.js','/storage.js','/experience.js','/icon.svg','/manifest.webmanifest','/apple-touch-icon.png','/icon-192.png','/icon-512.png',...['entry','core','gym','bodyweight','convict','isometric','boxing','mobility'].map(x=>`/library/${x}.js`)];
function safeResponse(path,response){
  if(!response.ok||response.redirected)return false;
  const mime=response.headers.get('content-type')||'';
  if(path.endsWith('.js'))return /javascript|ecmascript/.test(mime);
  if(path.endsWith('.css'))return /text\/css/.test(mime);
  if(path==='/'||path.endsWith('.html'))return /text\/html/.test(mime);
  return true;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const downloaded=await Promise.all(ASSETS.map(async path=>{
    const response=await fetch(path,{credentials:'same-origin',cache:'reload'});
    if(!safeResponse(path,response))throw new Error(`Offline asset unavailable: ${path}`);
    return [path,response];
  }));
  const cache=await caches.open(CACHE);
  await Promise.all(downloaded.map(([path,response])=>cache.put(path,response)));
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('xundong-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('message',event=>{
  if(event.data?.type!=='OFFLINE_STATUS'||!event.ports?.[0])return;
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const ready=(await Promise.all(ASSETS.map(path=>cache.match(path)))).every(Boolean);
    event.ports[0].postMessage({ready,cache:CACHE});
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||!ASSETS.includes(url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(!safeResponse(url.pathname,response))throw new Error('Static response not cacheable');
    const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));return response;
  }).catch(()=>caches.match(event.request).then(r=>r||Response.error())));
});
