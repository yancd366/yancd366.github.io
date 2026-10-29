(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./space'),require('./locations'),require('./care'),require('./supplies'),require('./duplicates'),require('./recognition-history'),require('./storage-review'),require('./scene-storage'));
  else root.Whereitis = factory(root.WhereitisSpace,root.WhereitisLocations,root.WhereitisCare,root.WhereitisSupplies,root.WhereitisDuplicates,root.WhereitisRecognitionHistory,root.WhereitisStorage,root.WhereitisSceneStorage);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Space, Locations, Care, Supplies, Duplicates, RecognitionHistory, Storage, SceneStorage) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = prefix => prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  const labels = { placed: '放置', missing: '未找到', found: '找回', purchased: '购买', received: '收到',registered:'登记持有',removed:'移除记录',restored:'恢复记录',split:'拆分数量',unpacked:'移出容器',merged:'合并档案',merge_undone:'撤销合并' };
  const categories = ['日常用品', '衣服', '数码配件', '工具', '证件资料', '书籍', '家电', '其他', '食物', '药品'];
  const clothingTypes = ['T恤','外套','衬衫','裤子','裙子','毛衣','内衣','鞋履','配饰','其他'];
  const icons = { '日常用品': '◇', '衣服':'♧', '书籍':'▥', '数码配件': '⌁', '工具': '⚒', '证件资料': '▤', '家电': '▣', '其他': '◇' };
  const attributes = ['clothingType','color','material','materialSource','materialEvidence','size','brand'];
  function normalizeClothingType(value) {value=String(value||'').trim();return /^(t\s*恤|t[ -]?shirt|tee)$/i.test(value)?'T恤':value;}
  function normalizeColor(value) {value=String(value||'').trim();const aliases={白:'白色',黑:'黑色',蓝:'蓝色',红:'红色',灰:'灰色',绿:'绿色',黄:'黄色',粉:'粉色',棕:'棕色'};return aliases[value]||value;}
  function searchTerm(value) {
    let text=String(value||'').trim().split(/[，,。；;！!]/)[0].replace(/[？?]+$/,'').trim();
    const prefix=/^(?:你好|请问|请|帮我|我想|我要|我之前买的|我之前的|我之前|我刚才的|我的|我那个|我|找一下|找一找|找找|找不到|没找到|找不着|寻找|查一下|查查|找|之前那个|之前的|之前|那个|那件|那条|那根|这件|这个|一下|的|一下子)\s*/;
    let last;do{last=text;text=text.replace(prefix,'').trim();}while(text!==last);
    const suffix=/(?:我)?(?:放在哪里了|放在哪里|放在哪儿了|放在哪儿|放在哪了|放在哪|放哪了|在哪里了|在哪里|在哪儿了|在哪儿|在哪了|在哪|找不到了|找不到|找不着了|找不着|没找到了|没找到|不见了|丢了|去哪了)[呢啊呀吗么嘛]?$/;
    do{last=text;text=text.replace(suffix,'').trim();}while(text!==last);
    return text.toLowerCase();
  }
  function seed() {
    const now = Date.now();
    const ago = days => new Date(now - days * 86400000).toISOString();
    const rooms = [{id:'room_bed',name:'卧室'}, {id:'room_living',name:'客厅'}, {id:'room_balcony',name:'阳台'}];
    const places = [
      {id:'place_drawer',roomId:'room_bed',name:'书桌左侧第二个抽屉'},
      {id:'place_bag',roomId:'room_bed',name:'床头柜 · 灰色收纳袋'},
      {id:'place_table',roomId:'room_living',name:'茶几下层'},
      {id:'place_tools',roomId:'room_balcony',name:'工具箱'}
    ];
    const items = [
      {id:'item_scissors',name:'黑柄剪刀',category:'日常用品',aliases:'剪子',note:'手柄是黑色的',attachments:[]},
      {id:'item_charger',name:'白色充电器',category:'数码配件',aliases:'充电头',note:'平时给手机充电用',attachments:[]},
      {id:'item_driver',name:'十字螺丝刀',category:'工具',aliases:'改锥',note:'黄色手柄',attachments:[]},
      {id:'item_passport',name:'护照',category:'证件资料',aliases:'',note:'和证件资料一起放',attachments:[]}
    ];
    const e = (eid,itemId,type,placeId,days,note) => ({id:eid,itemId,type,placeId,happenedAt:ago(days),recordedAt:ago(days),source:'示例',note:note||''});
    return {version:1,collections:categories.slice(),media:[],rooms,places,items,events:[
      e('e1','item_scissors','found','place_table',8), e('e2','item_scissors','placed','place_drawer',3),
      e('e3','item_charger','found','place_table',6), e('e4','item_charger','placed','place_bag',2), e('e5','item_charger','missing','place_bag',1),
      e('e6','item_driver','placed','place_tools',4), e('e7','item_passport','placed','place_drawer',5)
    ],care:[
      {id:'care_filter',name:'空调滤网',roomId:'room_bed',intervalDays:30,note:'这里只记录滤网清洁',history:[{id:'c1',at:ago(33),note:'示例记录'}]},
      {id:'care_track',name:'窗户轨道',roomId:'room_living',intervalDays:14,note:'到期时检查是否需要清洁',history:[{id:'c2',at:ago(10),note:'示例记录'}]}
    ]};
  }
  function validate(s) {
    if (!s || s.version !== 1 || !['rooms','places','items','events','care'].every(k => Array.isArray(s[k]))) throw new Error('不是有效的在哪儿备份文件');
    if(s.collections!==undefined && (!Array.isArray(s.collections)||s.collections.some(x=>typeof x!=='string'||!x.trim())||new Set(s.collections).size!==s.collections.length))throw new Error('专栏数据无效');
    if(s.media!==undefined && (!Array.isArray(s.media)||s.media.some(x=>!x||typeof x.id!=='string'||typeof x.path!=='string'||x.type!=='image')||new Set(s.media.map(x=>x.id)).size!==s.media.length))throw new Error('媒体数据无效');
    ['rooms','places','items','events','care'].forEach(key => {
      const ids = new Set();
      s[key].forEach(row => { if (!row || typeof row.id !== 'string' || ids.has(row.id)) throw new Error('备份包含无效或重复 ID'); ids.add(row.id); });
    });
    const rooms = new Set(s.rooms.map(x => x.id)), places = new Set(s.places.map(x => x.id)), items = new Set(s.items.map(x => x.id));
    s.rooms.forEach(x => {if (typeof x.name !== 'string' || !x.name.trim()) throw new Error('空间名称无效');if(x.type!==undefined&&!['room','vehicle','garage','storage','other'].includes(x.type))throw new Error('空间类型无效');});
    s.places.forEach(x => {if (!rooms.has(x.roomId) || typeof x.name !== 'string') throw new Error('位置数据无效');});
    const placeMap=new Map(s.places.map(x=>[x.id,x]));
    s.places.forEach(x=>{const seen=new Set([x.id]);let parent=x.parentId;while(parent){const p=placeMap.get(parent);if(!p||p.roomId!==x.roomId||seen.has(parent)||seen.size>16)throw new Error('位置层级无效、跨房间或循环');seen.add(parent);parent=p.parentId;}if(x.kind!==undefined&&x.kind!=='container')throw new Error('位置类型无效');if(x.lastContentsAt!==undefined&&!Number.isFinite(Date.parse(x.lastContentsAt)))throw new Error('容器补充时间无效');if(x.lastContentsText!==undefined&&typeof x.lastContentsText!=='string')throw new Error('容器补充说明无效');if(x.containerSource){const source=x.containerSource,snapshot=(s.spaceSnapshots||[]).find(y=>y.id===source.snapshotId&&y.roomId===x.roomId);if(!snapshot||!snapshot.report.rooms[0].places.some(p=>p.ref===source.ref))throw new Error('容器观察来源无效');}});
    if(s.spaceSnapshots!==undefined){if(!Array.isArray(s.spaceSnapshots))throw new Error('空间观察数据无效');const ids=new Set();s.spaceSnapshots.forEach(x=>{if(!x||!rooms.has(x.roomId)||typeof x.id!=='string'||ids.has(x.id)||!Number.isFinite(Date.parse(x.importedAt)))throw new Error('空间观察记录无效');ids.add(x.id);const report=Space.normalize(x.report);if(report.rooms.length!==1||JSON.stringify(report)!==JSON.stringify(x.report))throw new Error('空间观察格式无效');});}
    (s.spaceSnapshots||[]).forEach(v=>{if(v.photos!==undefined&&(!Array.isArray(v.photos)||v.photos.length>9||v.photos.some(p=>typeof p?.path!=='string'||!p.path||!v.report.sources.some(src=>src.id===p.sourceId&&src.type==='photo'))))throw new Error('空间参考照片无效');});
    s.items.forEach(x => {if(x.removed&&(!['mistake','disposed'].includes(x.removed.reason)||!Number.isFinite(Date.parse(x.removed.at))))throw new Error('移除状态无效');if(x.locationNeedsReview!==undefined&&typeof x.locationNeedsReview!=='boolean')throw new Error('位置核实状态无效');if (typeof x.name !== 'string' || typeof x.category !== 'string' || typeof x.aliases !== 'string' || typeof x.note !== 'string' || !Array.isArray(x.attachments)) throw new Error('物品数据无效');if(x.quantity!==undefined && (!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>999))throw new Error('物品数量无效');if(attributes.some(k=>x[k]!==undefined && typeof x[k]!=='string'))throw new Error('物品属性无效'); x.attachments.forEach(a=>{if(!a || !['image','audio'].includes(a.type) || typeof a.path!=='string') throw new Error('附件数据无效');});});
    s.events.forEach(x => {if (!items.has(x.itemId) || !labels[x.type] || (x.placeId && !places.has(x.placeId)) || !Number.isFinite(Date.parse(x.happenedAt)) || !Number.isFinite(Date.parse(x.recordedAt)) || (x.pathSnapshot!==undefined && (!Array.isArray(x.pathSnapshot)||x.pathSnapshot.length>17||x.pathSnapshot.some(v=>typeof v!=='string')))) throw new Error('事件数据无效');});
    if(s.packingBatches!==undefined){if(!Array.isArray(s.packingBatches)||new Set(s.packingBatches.map(x=>x.id)).size!==s.packingBatches.length||s.packingBatches.some(x=>!x||typeof x.id!=='string'||!places.has(x.containerId)||!Array.isArray(x.itemIds)||x.itemIds.some(i=>!items.has(i))||!Number.isFinite(Date.parse(x.at))))throw new Error('装箱批次数据无效');}
    s.places.forEach(p=>{if(p.photo!==undefined&&typeof p.photo!=='string')throw new Error('箱子照片无效');});
    s.items.forEach(item=>RecognitionHistory.validateItem(item));
    Duplicates.validate(s);
    Supplies.validate(s);
    Care.validate(s);
    Locations.validate(s);
    Storage.validate(s);
    SceneStorage.validate(s);
    return s;
  }
  function createStore(adapter) {
    let stored = adapter.read();
    let state = stored == null ? seed() : validate(typeof stored === 'string' ? JSON.parse(stored) : stored);
    state=clone(state);
    if(!state.collections)state.collections=categories.slice();
    if(!state.media)state.media=[];
    if (stored == null) adapter.write(clone(state));
    function commit(fn) {const next = clone(state); const result = fn(next); validate(next); adapter.write(clone(next)); state = next; return result;}
    function path(placeId) {let p = state.places.find(x => x.id === placeId); if (!p) return ''; const r = state.rooms.find(x => x.id === p.roomId),names=[];while(p){names.unshift(p.name);p=state.places.find(x=>x.id===p.parentId);}return [r.name].concat(names).join(' › ');}
    function within(placeId,ancestorId){let p=state.places.find(x=>x.id===placeId);while(p){if(p.id===ancestorId)return true;p=state.places.find(x=>x.id===p.parentId);}return false;}
    function eventsFor(itemId) {return state.events.filter(x => x.itemId === itemId).map((x,i)=>Object.assign({order:i},x)).sort((a,b)=>Date.parse(b.happenedAt)-Date.parse(a.happenedAt)||b.order-a.order).map(x=>Object.assign({},x,{location:x.pathSnapshot?x.pathSnapshot.join(' › '):path(x.placeId),label:labels[x.type]}));}
    function itemView(item,includeRecognitionHistory=true) {
      const events = eventsFor(item.id), last = events.find(e=>!['removed','restored','split','merged','merge_undone'].includes(e.type));
      const confirmed = events.find(x=>['placed','found','received'].includes(x.type) && x.placeId);
      const known = !item.removed&&!item.locationNeedsReview&&last && ['placed','found','received'].includes(last.type) && !!last.placeId;
      const storageMembership=known?null:SceneStorage.member(state,item)||Storage.membership(state,item),locationState=known?'known':last?.type==='missing'?'missing':last?.type==='purchased'?'ordered':storageMembership?'contained':'unlocated';
      const status = item.removed?(item.removed.mergeId?'已合并':item.removed.reason==='disposed'?'已丢弃':'已移除'):known?'已确认':last&&last.type==='purchased'?'待收货':locationState==='contained'?'待补空间':locationState==='missing'?'待查找':'待补位置';
      const attachments=item.attachments.map(a=>{if(!a.path.startsWith('media:'))return Object.assign({},a);const media=state.media.find(x=>x.id===a.path.slice(6));return Object.assign({},a,{path:media?media.path:''});});
      const containingBoxes=[];let node=known?state.places.find(p=>p.id===last.placeId):null;while(node){if(node.kind==='container')containingBoxes.push({id:node.id,name:node.name,photo:node.photo||'',location:path(node.id)});node=state.places.find(p=>p.id===node.parentId);}
      const view=Object.assign({quantity:1,clothingType:'',color:'',material:'',materialSource:'unknown',materialEvidence:'',size:'',brand:''}, item, {attachments,containingBoxes,icon:icons[item.category]||'◇',events,status,cover:attachments.find(a=>a.type==='image')?.path||'',owned:!item.removed&&status!=='待收货',known:!!known,location:known ? path(last.placeId) : '',lastLocation:confirmed ? path(confirmed.placeId) : '',lastConfirmedAt:confirmed ? confirmed.happenedAt : '',placeId:known ? last.placeId : '',roomId:known ? state.places.find(p=>p.id===last.placeId).roomId : '',latestAt:events[0]?events[0].happenedAt:''});
      view.locationState=locationState;view.storageMembership=storageMembership;view.storageLocationHint=known?'':SceneStorage.hint(state,item)||Storage.hint(state,item);view.recognitionCorrectionCount=(item.recognitionCorrections||[]).length;if(!includeRecognitionHistory){delete view.recognitionOrigin;delete view.recognitionCorrections;}return view;
    }
    function resolvePlace(s, roomId, name, parentId) {
      if (!s.rooms.some(r=>r.id===roomId)) throw new Error('请选择房间');
      name = String(name||'').trim(); if (!name) throw new Error('请填写具体位置');
      if(parentId&&!s.places.some(p=>p.id===parentId&&p.roomId===roomId))throw new Error('上级位置不存在或不属于此房间');
      let place = s.places.find(p=>p.roomId===roomId && p.name===name && (p.parentId||null)===(parentId||null));
      if(!place&&!parentId){const nested=s.places.filter(p=>{if(p.roomId!==roomId||!p.parentId)return false;let node=p,names=[];while(node){names.unshift(node.name);node=s.places.find(x=>x.id===node.parentId);}return p.name===name||names.join(' › ')===name;});if(nested.length>1)throw new Error('有多个同名位置，请填写完整层级或从对应容器中补充');if(nested.length===1)place=nested[0];}
      if (!place) {place={id:id('place'),roomId,name};if(parentId)place.parentId=parentId;s.places.push(place);} return place.id;
    }
    function writeRecord(s,input) {
      if(!['placed','purchased','registered'].includes(input.type))throw new Error('记录类型无效');
      const name=String(input.name||'').trim();if(!name)throw new Error('请填写物品名称');
      let item=input.itemId?s.items.find(x=>x.id===input.itemId):null;
      if(input.itemId&&!item)throw new Error('物品不存在');if(item&&item.removed)throw new Error('物品已移除，请先在设置中恢复后再更新');
      const quantity=input.quantity===undefined?(item&&item.quantity||1):Number(input.quantity);
      if(!Number.isInteger(quantity)||quantity<1||quantity>999)throw new Error('数量请输入 1～999 的整数');
      if(input.metadataOnly&&!item)throw new Error('只能修改已有物品资料');
      const placementAt=new Date().toISOString();let placeId=null;if(!input.metadataOnly&&input.type==='placed'){if(input.locationParts){if(!Array.isArray(input.locationParts)||!input.locationParts.length||input.locationParts.length>15||input.locationParts.some(x=>typeof x!=='string'||!x.trim()||x.length>120))throw new Error('位置层级无效');let parent=null;input.locationParts.forEach(name=>{parent=resolvePlace(s,input.roomId,name,parent);s.places.find(p=>p.id===parent).locationConfirmedAt=placementAt;});placeId=parent;}else if(input.anchorPlaceId||input.newAnchorName){placeId=Locations.target(s,input,placementAt);}else if(input.containerId){const c=s.places.find(p=>p.id===input.containerId&&p.kind==='container'&&p.roomId===input.roomId);if(!c)throw new Error('请选择有效的容器及房间');placeId=String(input.insideLocation||'').trim()?resolvePlace(s,c.roomId,input.insideLocation,c.id):c.id;}else if(input.placeId){const p=s.places.find(x=>x.id===input.placeId&&x.roomId===input.roomId);if(!p)throw new Error('原位置不存在或房间不匹配');placeId=p.id;}else placeId=resolvePlace(s,input.roomId,input.placeName);}
      if(item&&!input.metadataOnly&&input.type==='placed'){delete item.locationNeedsReview;delete item.storageCarrierId;delete item.storageDetail;delete item.storageRelationType;delete item.storageSceneId;delete item.storageNodeId;}
      const category=String(input.category||item&&item.category||'其他').trim();
      if(!s.collections.includes(category))s.collections.push(category);
      if(!item){item={id:id('item'),name,category,aliases:String(input.aliases||''),note:String(input.note||''),attachments:[]};s.items.push(item);}
      item.name=name;item.category=category;item.quantity=quantity;
      if(input.storageKind!==undefined){if(!Storage.valid(input.storageKind))throw new Error("收纳载体标记无效");item.storageKind=input.storageKind;}else if(item.storageKind===undefined)item.storageKind=Storage.infer(name);
      if(input.aliases!==undefined)item.aliases=String(input.aliases);
      if(input.note!==undefined)item.note=String(input.note);
      attributes.forEach(k=>{if(input[k]!==undefined)item[k]=String(input[k]||'').trim();});
      item.clothingType=normalizeClothingType(item.clothingType);
      item.color=normalizeColor(item.color);
      if(!item.material){item.materialSource='unknown';item.materialEvidence='';}
      else if(!['manual','label_text','product_text','spoken'].includes(item.materialSource)){item.materialSource='manual';}
      Object.assign(item,RecognitionHistory.merge(item,input));
      item.attachments=(input.replaceAttachments?[]:item.attachments).concat(clone(input.attachments||[]).map(a=>{if(a.type==='image'&&a.path.startsWith('data:image/')){let media=s.media.find(x=>x.path===a.path);if(!media){media={id:id('media'),type:'image',path:a.path};s.media.push(media);}return Object.assign({},a,{type:'image',path:'media:'+media.id});}return a;}));
      if(input.metadataOnly)return item.id;
      const now=new Date().toISOString();if(placeId)s.places.find(p=>p.id===placeId).locationConfirmedAt=now;s.events.push({id:id('event'),itemId:item.id,type:input.type,placeId,pathSnapshot:placeId?Locations.parts(s,placeId):[],happenedAt:now,recordedAt:now,source:input.source||'手动',note:String(input.eventNote||'')});return item.id;
    }
    function lastPosition(s,itemId){return s.events.filter(e=>e.itemId===itemId&&!['removed','restored','split','merged','merge_undone'].includes(e.type)).map((e,i)=>({...e,order:i})).sort((a,b)=>Date.parse(b.happenedAt)-Date.parse(a.happenedAt)||b.order-a.order)[0];}
    function stateWithin(s,placeId,ancestor){let p=s.places.find(x=>x.id===placeId);while(p){if(p.id===ancestor)return true;p=s.places.find(x=>x.id===p.parentId);}return false;}
    function activePosition(s,item){const last=lastPosition(s,item.id);return !item.removed&&!item.locationNeedsReview&&last&&['placed','found','received'].includes(last.type)?last.placeId:null;}
    function packingEvent(s,itemId,type,placeId,note,source='批量装箱 · 你已确认'){const now=new Date().toISOString();s.events.push({id:id('event'),itemId,type,placeId:placeId||null,pathSnapshot:placeId?Locations.parts(s,placeId):[],happenedAt:now,recordedAt:now,source,note:note||''});}
    function changeContainer(s,input,create){
      let c=input.id?s.places.find(p=>p.id===input.id&&p.kind==='container'):null;if(input.id&&!c)throw new Error('箱子不存在，请重新选择');if(!c&&!create)throw new Error('请选择已有箱子');
      const roomId=input.roomId||c&&c.roomId,name=String(input.name===undefined?c&&c.name||'':input.name).trim();if(!s.rooms.some(r=>r.id===roomId)||!name||name.length>60)throw new Error('请选择箱子所在空间，名称请输入1～60字');
      const descendants=c?s.places.filter(p=>stateWithin(s,p.id,c.id)).map(p=>p.id):[];let parentId=input.parentId===undefined&&input.position===undefined&&(!input.roomId||c&&input.roomId===c.roomId)?c?.parentId||null:input.parentId||null;
      if(parentId&&(!s.places.some(p=>p.id===parentId&&p.roomId===roomId)||descendants.includes(parentId)))throw new Error('不能把箱子放进自己或下级位置，请选择有效的外部位置');
      if(!parentId&&String(input.position||'').trim()){
        let parent=null;const names=String(input.position).split(/\s*[›>]\s*/).map(x=>x.trim()).filter(Boolean);if(names.length>10||names.some(n=>n.length>100))throw new Error('外部位置过长，请简化');
        for(const n of names){parent=resolvePlace(s,roomId,n,parent);if(descendants.includes(parent))throw new Error('不能把箱子放进自己或下级位置');}parentId=parent;
      }
      if(s.places.some(p=>p.id!==c?.id&&p.roomId===roomId&&(p.parentId||null)===parentId&&p.name===name))throw new Error('这个位置已有同名箱子，请选择已有箱子，或给新箱子起可区分的名字');
      const now=new Date().toISOString(),isNew=!c;let relocated=false;if(!c){c={id:id('container'),kind:'container',roomId,name};if(parentId)c.parentId=parentId;s.places.push(c);}
      else if(c.name!==name||c.roomId!==roomId||(c.parentId||null)!==parentId){
        // Freeze history BEFORE changing a shared ancestor. Descendant IDs stay stable.
        s.events.forEach(e=>{if(e.placeId&&!e.pathSnapshot)e.pathSnapshot=Locations.parts(s,e.placeId);});
        relocated=c.roomId!==roomId||(c.parentId||null)!==parentId;const affectedSupplies=(s.supplyLots||[]).filter(x=>x.placeId&&stateWithin(s,x.placeId,c.id)).map(x=>({lot:x,path:Locations.parts(s,x.placeId)}));const previousPath=Locations.parts(s,c.id),affected=s.items.filter(item=>{const p=activePosition(s,item);return p&&stateWithin(s,p,c.id);}),crossRoom=c.roomId!==roomId;
        for(const p of s.places.filter(x=>descendants.includes(x.id))){if(crossRoom){if(p.sourceLinks?.length){p.previousSourceLinks=(p.previousSourceLinks||[]).concat(p.sourceLinks.map(link=>({...link,roomId:p.roomId})));delete p.sourceLinks;}if(p.containerSource){p.previousContainerSources=(p.previousContainerSources||[]).concat({...p.containerSource,roomId:p.roomId});delete p.containerSource;}}p.roomId=roomId;}
        affectedSupplies.forEach(({lot,path:previousPath})=>{lot.roomId=roomId;if(relocated){lot.storageConfirmed=false;lot.history.push({id:id('supply_move'),type:'moved_with_container',at:now,previousPath});}});c.name=name;c.roomId=roomId;if(parentId)c.parentId=parentId;else delete c.parentId;
        if(!s.placeEvents)s.placeEvents=[];s.placeEvents.push({id:id('place_event'),placeId:c.id,type:relocated?'container_moved':'container_renamed',at:now,previousPath,pathSnapshot:Locations.parts(s,c.id)});
        if(relocated)affected.forEach(item=>packingEvent(s,item.id,'placed',activePosition(s,item),'随箱子移动：'+previousPath.join(' › ')+' → '+Locations.parts(s,c.id).join(' › '),'整箱移动 · 你已确认'));
      }
      if(input.photo!==undefined){if(typeof input.photo!=='string')throw new Error('箱子照片无效');c.photo=input.photo;}
      if(isNew||relocated||!c.locationConfirmedAt)c.locationConfirmedAt=now;return c.id;
    }
    function duplicateContext(s,containerId){return {id,place:item=>activePosition(s,item),inside:item=>{const place=activePosition(s,item);return !!place&&stateWithin(s,place,containerId);},event:(itemId,type,place,note)=>packingEvent(s,itemId,type,place,note,'箱内整理 · 你已确认')};}
    function packingRows(rows){
      if(!Array.isArray(rows)||!rows.length||rows.length>50)throw new Error('每次请选择1～50条物品');
      const selected=rows.filter(r=>r.selected!==false),keys=new Set();if(!selected.length)throw new Error('先选择要装入的物品');
      selected.forEach(r=>{if(!r.key||keys.has(r.key))throw new Error('本批物品标识重复');keys.add(r.key);if(r.decision==='unresolved'||r.duplicateDecision==='unresolved')throw new Error('请先核对相似物品，选择同一件、不同件或跳过');});
      const roots=selected.filter(r=>!r.mergeInto).map(r=>({...r,attachments:(r.attachments||[]).slice()}));
      for(const r of selected.filter(r=>r.mergeInto)){const target=roots.find(x=>x.key===r.mergeInto);if(!target||target.key===r.key)throw new Error('合并照片的主条目未选中或形成循环，请重新选择');target.attachments=target.attachments.concat(r.attachments||[]);}
      return roots;
    }
    function packBatch(s,input){
      if(typeof input.batchId!=='string'||!input.batchId||input.batchId.length>100)throw new Error('装箱批次无效，请重新进入');
      const completed=(s.packingBatches||[]).find(x=>x.id===input.batchId);if(completed)return {containerId:completed.containerId,itemIds:completed.itemIds,alreadySaved:true};
      const rows=packingRows(input.rows),seen=new Set();rows.forEach(r=>{if(r.itemId){if(seen.has(r.itemId))throw new Error('同一已有物品被选择了两次，请将补拍照片合并到同一条');seen.add(r.itemId);}});
      const box=input.container||{},oldBox=box.id?s.places.find(p=>p.id===box.id&&p.kind==='container'):null;
      if(oldBox&&input.expectedContainerPath&&Locations.parts(s,oldBox.id).join(' › ')!==input.expectedContainerPath)throw new Error('箱子位置已变化，请刷新后再核对');
      // Check all existing selections before any move or quantity split.
      rows.forEach(r=>{if(!r.itemId)return;const item=s.items.find(x=>x.id===r.itemId);if(!item||item.removed)throw new Error('选择的物品已移除或不存在');const latest=lastPosition(s,item.id);if(latest?.type==='purchased')throw new Error('待收货物品不能装箱，请先记录已收到');if(r.expectedQuantity!==undefined&&r.expectedQuantity!==(item.quantity||1)||r.expectedLatestAt!==undefined&&r.expectedLatestAt!==(s.events.filter(e=>e.itemId===item.id).slice().sort((a,b)=>Date.parse(b.happenedAt)-Date.parse(a.happenedAt))[0]?.happenedAt||''))throw new Error('物品记录已变化，请重新选择并核对数量和位置');if(oldBox&&stateWithin(s,activePosition(s,item),oldBox.id))throw new Error('「'+item.name+'」已在这个箱子内，不必重复装入');});
      const containerId=changeContainer(s,box,true),c=s.places.find(p=>p.id===containerId),ids=[];
      for(const row of rows){
        const quantity=Number(row.quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>999)throw new Error('请核对每条装入数量（1～999）');let old=row.itemId?s.items.find(x=>x.id===row.itemId):null;
        if(old&&quantity>(old.quantity||1))throw new Error('「'+old.name+'」装入数量超过现有数量');
        let itemId=old?.id;
        if(old&&quantity<(old.quantity||1)){
          const originalTotal=old.quantity||1;old.quantity=originalTotal-quantity;
          packingEvent(s,old.id,'split',null,'拆出'+quantity+'件装箱，原档案保留'+old.quantity+'件');
          const cloneItem=clone(old);delete cloneItem.id;delete cloneItem.removed;delete cloneItem.locationNeedsReview;
          itemId=writeRecord(s,{...cloneItem,itemId:null,name:old.name,type:'placed',roomId:c.roomId,containerId,quantity,attachments:clone(old.attachments),source:'批量装箱拆分 · 你已确认',eventNote:input.statement||'部分数量装入箱子'});
          s.items.find(x=>x.id===itemId).splitFrom=old.id;
          if(row.attachments?.length)writeRecord(s,{itemId,name:old.name,type:'registered',metadataOnly:true,attachments:row.attachments});
        }else if(old){
          itemId=writeRecord(s,{itemId:old.id,name:old.name,type:'placed',roomId:c.roomId,containerId,quantity,attachments:row.attachments||[],source:'批量装箱 · 你已确认',eventNote:input.statement||'本批物品放入此箱'});
        }else{
          const fresh={name:row.name,category:row.category,aliases:row.aliases||'',note:row.note||'',attachments:row.attachments||[]};attributes.forEach(k=>{if(row[k]!==undefined)fresh[k]=row[k];});['recognitionOrigin','recognitionCorrections'].forEach(k=>{if(row[k]!==undefined)fresh[k]=row[k];});itemId=writeRecord(s,{...fresh,itemId:null,type:'placed',roomId:c.roomId,containerId,quantity,source:'照片批量装箱 · 你已确认',eventNote:input.statement||'根据物品照片与装箱确认建立关联'});
        }
        ids.push(itemId);
      }
      c.lastContentsAt=new Date().toISOString();c.lastContentsText=String(input.statement||'批量装箱').slice(0,4000);if(!s.packingBatches)s.packingBatches=[];s.packingBatches.push({id:input.batchId,containerId,itemIds:ids,at:new Date().toISOString()});return {containerId,itemIds:ids};
    }

    const api = {
      snapshot:()=>clone(state), rooms:()=>clone(state.rooms), path,
      namedPlaces:roomId=>clone(Locations.entries(state,roomId)),
      addNamedPlace:input=>commit(s=>Locations.put(s,input,new Date().toISOString())),
      confirmSpacePlace:input=>commit(s=>Locations.confirm(s,input,new Date().toISOString())),
      resolveLocation:(mention,roomName)=>clone(Locations.match(state,mention,roomName)),
      items(query, roomId) {let rows=state.items.filter(x=>!x.removed).map(item=>itemView(item,false)); const q=searchTerm(query); if(q) rows=rows.filter(x=>[x.name,x.aliases,x.category,x.note,x.location,x.lastLocation,x.clothingType,x.color,x.material,x.size,x.brand,x.events.map(e=>e.location).join(' ')].join(' ').toLowerCase().includes(q)); if(roomId) rows=rows.filter(x=>x.roomId===roomId); return rows.sort((a,b)=>Date.parse(b.latestAt)-Date.parse(a.latestAt));},
      item(itemId) {const item=state.items.find(x=>x.id===itemId); return item ? itemView(item) : null;},
      recognitionHistory(itemId){const item=state.items.find(x=>x.id===itemId);if(!item)throw new Error('物品不存在');return RecognitionHistory.view(item);},
      removeAttachment(itemId,index){return commit(s=>{const item=s.items.find(x=>x.id===itemId);if(!item||!Number.isInteger(index)||index<0||index>=item.attachments.length)throw new Error('附件已变化，请刷新后重试');item.attachments.splice(index,1);});},
      removedItems(){return state.items.filter(x=>x.removed).map(item=>itemView(item,false)).sort((a,b)=>Date.parse(b.removed.at)-Date.parse(a.removed.at));},
      removeItem(itemId,reason){return commit(s=>{if(!['mistake','disposed'].includes(reason))throw new Error('请选择移除原因');const item=s.items.find(x=>x.id===itemId);if(!item)throw new Error('物品不存在');if(item.removed)return;const now=new Date().toISOString();SceneStorage.markCarrierRemoved(s,itemId);item.removed={reason,at:now};s.events.push({id:id('event'),itemId,type:'removed',placeId:null,happenedAt:now,recordedAt:now,source:'你已确认',note:reason==='disposed'?'已扔掉 / 不再持有':'记错了，从当前清单移除'});});},
      restoreItem(itemId){return commit(s=>{const item=s.items.find(x=>x.id===itemId);if(!item||!item.removed)throw new Error('这条记录不在已移除列表');if(item.removed.mergeId)return Duplicates.undoMerge(s,item.removed.mergeId,duplicateContext(s,''));const disposed=item.removed.reason==='disposed';delete item.removed;if(disposed)item.locationNeedsReview=true;const now=new Date().toISOString();s.events.push({id:id('event'),itemId,type:'restored',placeId:null,happenedAt:now,recordedAt:now,source:'你已确认',note:disposed?'恢复持有，当前位置需重新确认':'恢复记错时移除的档案，不刷新原位置确认时间'});});},
      updateRoom(roomId,input){return commit(s=>{const room=s.rooms.find(r=>r.id===roomId),name=String(input.name||'').trim();if(!room||!name||name.length>50)throw new Error('请输入有效的空间名称');if(s.rooms.some(r=>r.id!==roomId&&r.name===name))throw new Error('已有同名空间');if(!['room','vehicle','garage','storage','other'].includes(input.type))throw new Error('空间类型无效');s.events.forEach(e=>{if(e.placeId&&!e.pathSnapshot)e.pathSnapshot=Locations.parts(s,e.placeId);});room.name=name;room.type=input.type;});},
      addRoom(name,type='room') {return commit(s=>{if(!['room','vehicle','garage','storage','other'].includes(type))throw new Error('空间类型无效');name=String(name||'').trim(); if(!name) throw new Error('请填写房间名称'); if(s.rooms.some(x=>x.name===name)) throw new Error('这个房间已经存在'); const room={id:id('room'),name,type}; s.rooms.push(room); return room.id;});},
      sceneNode(roomId,snapshotId,ref){const snapshot=(state.spaceSnapshots||[]).find(x=>x.id===snapshotId&&x.roomId===roomId);if(!snapshot)throw new Error('空间观察不存在');const room=snapshot.report.rooms[0],node=room.places.find(x=>x.ref===ref);if(!node)throw new Error('观察位置不存在');return {name:node.name,position:Space.placePath(room,node.parentRef),snapshotId,ref,linkedId:Locations.sourcePlace(state,snapshotId,ref)?.id||''};},
      addContainer(input){return commit(s=>{const name=String(input.name||'').trim();if(!name||name.length>60)throw new Error('容器名称请输入 1～60 个字');if(!s.rooms.some(r=>r.id===input.roomId))throw new Error('请选择房间');let source=null;if(input.snapshotId){const node=api.sceneNode(input.roomId,input.snapshotId,input.ref);if(node.linkedId){s.places.find(p=>p.id===node.linkedId).kind='container';return node.linkedId;}source={snapshotId:input.snapshotId,ref:input.ref};}let parentId=input.parentId||null;if(parentId&&!s.places.some(p=>p.id===parentId&&p.kind==='container'&&p.roomId===input.roomId))throw new Error('请选择同一房间内的上级容器');if(!parentId&&String(input.position||'').trim())parentId=resolvePlace(s,input.roomId,String(input.position).trim());let place=s.places.find(p=>p.roomId===input.roomId&&p.name===name&&(p.parentId||null)===parentId);if(place&&place.kind==='container')throw new Error('该位置已有同名容器，请打开已有容器或使用可区分的名称');if(!place){place={id:id('container'),roomId:input.roomId,name};if(parentId)place.parentId=parentId;s.places.push(place);}place.kind='container';if(source)place.containerSource=source;return place.id;});},
      containers(roomId){return state.places.filter(p=>p.kind==='container'&&(!roomId||p.roomId===roomId)).map(p=>api.container(p.id));},
      container(containerId){const p=state.places.find(x=>x.id===containerId&&x.kind==='container');if(!p)return null;const supplyLots=api.suppliesAt(p.roomId,p.id),items=api.items().filter(x=>x.known&&within(x.placeId,p.id)),uncertainItems=api.items().filter(x=>!x.known&&x.events.find(e=>!['removed','restored','split','merged','merge_undone'].includes(e.type))?.type!=='unpacked'&&x.events.some(e=>['placed','found','received'].includes(e.type)&&e.placeId&&within(e.placeId,p.id)));return Object.assign({},clone(p),{roomName:state.rooms.find(x=>x.id===p.roomId).name,location:path(p.id),items,supplyLots,uncertainItems,records:items.length,supplyRecords:supplyLots.length,totalRecords:items.length+supplyLots.length,quantity:items.reduce((n,x)=>n+x.quantity,0),contentsLabel:p.lastContentsAt?'已补充 · 完整性待核实':items.length+supplyLots.length?'有位置记录 · 内部待核实':'内部尚未补充'});},
      containerDuplicates(containerId){const c=api.container(containerId);if(!c)throw new Error('箱子不存在');return Duplicates.candidates(state,c.items);},
      itemRevision:itemId=>Duplicates.revision(state,itemId),
      markDifferent:(input)=>commit(s=>Duplicates.different(s,input,duplicateContext(s,input.containerId))),
      undoDifferent:checkId=>commit(s=>Duplicates.undoDifferent(s,checkId)),
      mergeContainerItems:input=>commit(s=>Duplicates.merge(s,input,duplicateContext(s,input.containerId))),
      undoItemMerge:mergeId=>commit(s=>Duplicates.undoMerge(s,mergeId,duplicateContext(s,''))),
      savePackingBatch(input){return commit(s=>packBatch(s,input));},
      moveContainer(input){return commit(s=>changeContainer(s,input,false));},
      updateContainerItem(input){return commit(s=>{if(!s.places.some(x=>x.id===input.containerId&&x.kind==='container'))throw new Error('箱子不存在');const item=s.items.find(x=>x.id===input.itemId);if(!item||item.removed||!stateWithin(s,activePosition(s,item),input.containerId))throw new Error('物品已不在这个箱子，请刷新后重试');if(input.expectedVersion!==Duplicates.revision(s,item.id))throw new Error('物品资料有变化，请重新打开核对');const category=input.category===undefined?item.category:String(input.category).trim();if(!category||category.length>30)throw new Error('类别请输入1～30个字');return writeRecord(s,{itemId:item.id,name:item.name,type:'registered',metadataOnly:true,category,quantity:input.quantity===undefined?item.quantity||1:input.quantity});});},
      unpackItem(containerId,itemId,quantity,expectedVersion){return commit(s=>{const c=s.places.find(x=>x.id===containerId&&x.kind==='container'),item=s.items.find(x=>x.id===itemId);if(!c||!item||item.removed||!stateWithin(s,activePosition(s,item),containerId))throw new Error('这件物品不在该箱子内');if(expectedVersion!==undefined&&expectedVersion!==Duplicates.revision(s,item.id))throw new Error('物品资料有变化，请重新打开核对');const fromPlaceId=activePosition(s,item),count=quantity===undefined?item.quantity||1:Number(quantity);if(!Number.isInteger(count)||count<1||count>(item.quantity||1))throw new Error('请核对拿出数量');let target=item.id;if(count<(item.quantity||1)){item.quantity=(item.quantity||1)-count;packingEvent(s,item.id,'split',null,'从箱子取出'+count+'件，箱内保留'+item.quantity+'件');const copy=clone(item);delete copy.id;target=writeRecord(s,{...copy,itemId:null,type:'registered',quantity:count,source:'从箱子拿出 · 你已确认'});s.items.find(x=>x.id===target).splitFrom=item.id;}delete s.items.find(x=>x.id===target).locationNeedsReview;packingEvent(s,target,'unpacked',fromPlaceId,'已从「'+c.name+'」拿出，实际存放位置待补','从箱子拿出 · 你已确认');return target;});},
      saveContainerContents(containerId,inputs,statement){if(!Array.isArray(inputs)||!inputs.length||inputs.length>50)throw new Error('请选择 1～50 条物品');const seen=new Set();inputs.forEach(x=>{if(x.type!=='placed')throw new Error('容器内只能记录已持有物品，待收货项请取消勾选');if(x.itemId){if(seen.has(x.itemId))throw new Error('同一个已有物品被选择了多次，请合并或调整草稿');seen.add(x.itemId);}});return commit(s=>{const c=s.places.find(x=>x.id===containerId&&x.kind==='container');if(!c)throw new Error('容器不存在');const ids=inputs.map(x=>writeRecord(s,Object.assign({},x,{roomId:c.roomId,containerId:c.id,source:'容器补充 · 你已确认',eventNote:String(statement||'').slice(0,4000)})));c.lastContentsAt=new Date().toISOString();c.lastContentsText=String(statement||'').slice(0,4000);return ids;});},
      importSpace(report,origin,photos=[]) {const normalized=Space.normalize(report);return commit(s=>{if(!s.spaceSnapshots)s.spaceSnapshots=[];return normalized.rooms.map(room=>{let r=s.rooms.find(x=>x.name===room.name);if(!r){r={id:id('room'),name:room.name};s.rooms.push(r);}s.spaceSnapshots.push({id:id('space'),roomId:r.id,importedAt:new Date().toISOString(),origin:origin==='photos'?'photos':'external',photos:clone(photos),report:Object.assign({},normalized,{rooms:[room]})});return r.id;});});},
      roomOverview(roomId) {const room=state.rooms.find(x=>x.id===roomId);if(!room)throw new Error('房间不存在');const history=(state.spaceSnapshots||[]).filter(x=>x.roomId===roomId).slice().reverse();const latest=history[0];return {room:clone(room),history:history.map(x=>({id:x.id,importedAt:x.importedAt,capturedAt:x.report.rooms[0].capturedAt})),latest:latest?Object.assign({},clone(latest),{view:Space.view(latest.report.rooms[0])}):null,items:api.items('',roomId),supplyLots:api.suppliesAt(roomId),totalRecords:api.items('',roomId).length+api.suppliesAt(roomId).length,places:clone(state.places.filter(x=>x.roomId===roomId))};},
      spaceClues(query,roomId) {const q=searchTerm(query);if(!q)return [];return state.rooms.filter(r=>!roomId||r.id===roomId).flatMap(r=>{const latest=api.roomOverview(r.id).latest;return latest?latest.view.clues.filter(x=>(x.name+' '+x.description+' '+x.category).toLowerCase().includes(q)).map(x=>Object.assign({},x,{roomId:r.id,roomName:r.name,capturedAt:latest.view.capturedAt,importedAt:latest.importedAt})):[];});},
      record(input) {return commit(s=>writeRecord(s,input));},
      batchRecord(inputs,backgrounds=[]) {if(!Array.isArray(inputs)||!inputs.length||inputs.length>50)throw new Error('请选择 1～50 条物品');return commit(s=>{const ids=inputs.map(input=>writeRecord(s,input));Storage.linkRecorded(s,inputs,ids);Storage.rememberBackgrounds(s,inputs,ids,backgrounds);return ids;});},
      categories:()=>Array.from(new Set(categories.concat(state.collections))),
      addCollection(name) {return commit(s=>{name=String(name||'').trim();if(!name||name.length>30)throw new Error('专栏名称请输入 1～30 个字');if(s.collections.includes(name))throw new Error('这个专栏已经存在');s.collections.push(name);});},
      collections() {return state.collections.filter(name=>!['食物','药品'].includes(name)||api.items().some(x=>x.category===name)).map(name=>{const rows=api.items().filter(x=>x.category===name);const owned=rows.filter(x=>x.owned);return {name,legacy:['食物','药品'].includes(name),icon:icons[name]||'◇',quantity:owned.reduce((n,x)=>n+x.quantity,0),pending:rows.filter(x=>!x.owned).reduce((n,x)=>n+x.quantity,0),records:rows.length};});},
      collection(name,filters) {
        filters=filters||{};const all=api.items().filter(x=>x.category===name),owned=all.filter(x=>x.owned);
        function group(key){const counts=Object.create(null);owned.forEach(x=>{const value=x[key]||'待确认';counts[value]=(counts[value]||0)+x.quantity;});return Object.keys(counts).map(label=>({label,count:counts[label]})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));}
        let rows=all;if(filters.ownership==='owned')rows=rows.filter(x=>x.owned);if(filters.ownership==='pending')rows=rows.filter(x=>!x.owned);
        ['clothingType','color','material'].forEach(k=>{if(filters[k])rows=rows.filter(x=>(x[k]||'待确认')===filters[k]);});
        return {name,items:rows,quantity:owned.reduce((n,x)=>n+x.quantity,0),pending:all.filter(x=>!x.owned).reduce((n,x)=>n+x.quantity,0),unknownMaterial:owned.filter(x=>!x.material).reduce((n,x)=>n+x.quantity,0),types:group('clothingType'),colors:group('color'),materials:group('material')};
      },
      event(itemId,type,roomId,placeName,note) {return commit(s=>{
        const targetItem=s.items.find(x=>x.id===itemId);if(!targetItem)throw new Error('物品不存在');if(targetItem.removed)throw new Error('请先恢复物品再记录位置');if(type!=='missing'){delete targetItem.locationNeedsReview;delete targetItem.storageCarrierId;delete targetItem.storageDetail;delete targetItem.storageRelationType;delete targetItem.storageSceneId;delete targetItem.storageNodeId;}
        if(!['missing','found','placed'].includes(type)) throw new Error('动作无效');
        const current=api.item(itemId);
        const placeId=type==='missing' ? (roomId && placeName ? resolvePlace(s,roomId,placeName) : current.placeId||null) : resolvePlace(s,roomId,placeName);
        const now=new Date().toISOString(); s.events.push({id:id('event'),itemId,type,placeId,pathSnapshot:placeId?Locations.parts(s,placeId):[],happenedAt:now,recordedAt:now,source:'手动',note:String(note||'')});
      });},
      suggestions(itemId) {
        const item=api.item(itemId); if(!item || item.removed || item.status==='待收货') return [];
        const excluded=new Set(); const seen=new Set(); const out=[];
        item.events.forEach(e=>{if(!e.placeId || seen.has(e.placeId)) return; seen.add(e.placeId); if(['missing','unpacked'].includes(e.type)) excluded.add(e.placeId);});
        item.events.forEach(e=>{if(out.length>=3 || !e.placeId || excluded.has(e.placeId) || e.placeId===item.placeId || out.some(x=>x.placeId===e.placeId) || !['found','placed'].includes(e.type)) return; out.push({placeId:e.placeId,roomId:state.places.find(p=>p.id===e.placeId).roomId,placeName:path(e.placeId).split(' › ').slice(1).join(' › '),location:path(e.placeId),reason:e.type==='found'?'你曾在这里找回这件物品':'你曾记录放在这里'});});
        return out;
      },
      suppliesAt:(roomId,placeId)=>Supplies.list(state).filter(x=>x.status==='available'&&(!roomId||x.roomId===roomId)&&(!placeId||x.placeId&&within(x.placeId,placeId))),
      supplyLots:(kind,query,date)=>Supplies.list(state,kind,query,date),
      supplyLot:lotId=>Supplies.list(state).find(x=>x.id===lotId)||null,
      saveSupplyLots:(batchId,rows)=>commit(s=>Supplies.add(s,rows,batchId,id('supply'))),
      saveSceneSupplyLots:(batchId,rows,source)=>commit(s=>{const scene=s.storageScenes?.find(sc=>sc.id===source.sceneId),entity=scene?.entities.find(e=>e.id===source.entityId);if(!scene||!entity||rows.length!==1)throw new Error('分层来源已变化，请从原线索重新核对这一条');const existing=(s.supplyLots||[]).filter(x=>x.batchId===batchId);if(existing.length&&entity.supplyId===existing[0].id)return existing.map(x=>x.id);if(entity.supplyId||scene.revision!==source.expectedRevision)throw new Error('这条线索已处理或发生变化，请打开原记录');const ids=Supplies.add(s,rows,batchId,id('supply')),lot=s.supplyLots.find(x=>x.id===ids[0]);lot.storageSceneId=scene.id;lot.storageNodeId=entity.parentId||'';entity.supplyId=lot.id;entity.name=lot.name;entity.quantity=lot.quantity;entity.category=lot.kind==='food'?'食物':'药品';scene.revision++;return ids;}),
      updateSupplyLot:(lotId,input,expectedRevision)=>commit(s=>Supplies.update(s,lotId,input,id('supply_edit'),expectedRevision)),
      supplyAction:(ids,type,amount)=>commit(s=>Supplies.action(s,ids,type,amount,id('supply_event'))),
      undoSupplyAction:eventId=>commit(s=>Supplies.undo(s,eventId,id('supply_undo'))),
      searchMedicine:(query,includeHistory)=>Supplies.searchMedicine(state,query,undefined,includeHistory),
      care(){return clone(Care.list(state));},
      updateCare:(careId,input)=>commit(s=>Care.update(s,careId,input)),
      addCare:input=>commit(s=>Care.add(s,input,id('care'))),
      recordCare:(careId,input)=>commit(s=>Care.record(s,careId,input||{},id('care_event'))),
      clean(careId){return commit(s=>Care.record(s,careId,{},id('clean')));},
      exportData:()=>JSON.stringify(state,null,2),
      importData(raw) {const parsed=validate(JSON.parse(raw)); return commit(s=>{Object.keys(s).forEach(k=>delete s[k]); Object.assign(s,clone(parsed));if(!s.collections)s.collections=categories.slice();if(!s.media)s.media=[];});},
      clear() {return commit(s=>{Object.assign(s,{version:1,collections:categories.slice(),media:[],rooms:[],places:[],items:[],events:[],care:[],spaceSnapshots:[],placeEvents:[],packingBatches:[],supplyLots:[],duplicateChecks:[],itemMerges:[],storageVisits:[],storageAnchors:[],storageScenes:[]});});}
    }; Storage.install(api,{state:()=>state,commit,id,write:writeRecord,resolve:resolvePlace});SceneStorage.install(api,{state:()=>state,commit,id,write:writeRecord});return api;
  }
  function parseText(text) {
    text=String(text||'').trim().replace(/[。！!]+$/,'');
    const match=text.match(/^(?:我)?(?:把)?(.+?)(?:放在|放到|放进)(.+)$/);
    return match?{name:match[1].trim(),location:match[2].trim()}:null;
  }
  const voiceActions=[{value:'placed',label:'已持有，同时记录位置'},{value:'registered',label:'已持有，稍后补位置'},{value:'purchased',label:'已下单，尚未收到'}];
  function fillVoiceMatch(store,row,index){
    const option=row.matchOptions[index];if(!option)throw new Error('请选择已有物品或新建档案');
    const old=option.id?store.item(option.id):null,raw=row.raw;
    const values={name:old?old.name:raw.name,category:old&&raw.category==='其他'?old.category:raw.category,quantity:raw.quantity==null?(old?old.quantity:1):raw.quantity,note:raw.note||old&&old.note||'',aliases:old?old.aliases:''};
    attributes.forEach(k=>{values[k]=raw[k]||old&&old[k]||'';});
    return Object.assign({},row,values,{matchIndex:index,categoryIndex:Math.max(0,store.categories().indexOf(values.category))});
  }
  function prepareVoiceDrafts(store,result){
    const rooms=store.rooms();return result.items.map((raw,index)=>{
      const matches=store.items(raw.name),matchOptions=[{id:'',name:'新建物品档案'}].concat(matches.map(x=>({id:x.id,name:'更新：'+x.name})));const matchIndex=raw.action==='placed'&&matches.length===1?1:0;
      const row={draftId:'voice_'+index,raw:clone(raw),matchOptions,matchIndex,selected:true,action:raw.action,actionIndex:Math.max(0,voiceActions.findIndex(x=>x.value===raw.action)),roomName:raw.roomName||'',roomIndex:rooms.findIndex(x=>x.name===raw.roomName),placeName:raw.placeName||''};
      return fillVoiceMatch(store,row,matchIndex);
    });
  }
  function voiceInputs(store,rows,transcript){
    const selected=rows.filter(x=>x.selected);if(!selected.length)throw new Error('请至少勾选一条记录');
    const rooms=store.rooms();return selected.map(row=>{
      const room=rooms[row.roomIndex];if(row.action==='placed'&&(!room||!String(row.placeName||'').trim()))throw new Error('请为「'+row.name+'」选择房间并补充具体位置');
      const option=row.matchOptions[row.matchIndex];if(!option)throw new Error('请选择新建或更新的物品');
      if(row.needsLocationChoice)throw new Error('请先为「'+row.name+'」确认位置');
      const input={itemId:option.id||null,name:row.name,category:row.category,quantity:row.quantity,aliases:row.aliases||'',note:row.note||'',type:row.action,roomId:room&&room.id,placeName:row.placeName,source:'语音理解 · 你已确认',eventNote:String(transcript||'').slice(0,4000)};
      ['placeId','anchorPlaceId','newAnchorName','subPlaceName'].forEach(k=>{if(row[k])input[k]=row[k];});attributes.forEach(k=>{input[k]=row[k]||'';});return input;
    });
  }
  function locationWarnings(result,rows){const warnings=result&&Array.isArray(result.warnings)?result.warnings:[],placed=rows.filter(r=>r.selected&&r.action==='placed');if(!placed.length||placed.some(r=>r.roomIndex<0||r.needsLocationChoice||r.needsRoom))return warnings;return warnings.filter(w=>!( /房间/.test(w)&&/缺少|缺失|不明确|未明确|没有|请确认|需确认|需要确认/.test(w)&&! /数量|材质|颜色|型号|尺码|同一/.test(w)));}
  function clearDraftLocation(row){return Object.assign({},row,{placeId:'',anchorPlaceId:'',subPlaceName:'',newAnchorName:'',locationLabel:'',locationReason:'',locationOptions:[],needsLocationChoice:false,needsRoom:false});}
  function chooseDraftLocation(store,row,index){const choice=row.locationOptions[index];if(!choice)throw new Error('请选择有效的位置');const rooms=store.rooms();return Object.assign({},clearDraftLocation(row),{locationOptions:row.locationOptions,locationLabel:choice.label,locationReason:'匹配已确认位置',placeId:choice.placeId,anchorPlaceId:choice.anchorPlaceId,subPlaceName:choice.subPlaceName,roomName:choice.roomName,roomIndex:rooms.findIndex(r=>r.id===choice.roomId),placeName:choice.placeName,expanded:false});}
  function chooseDraftRoom(store,row,index){const room=store.rooms()[index];if(!room)throw new Error('请选择房间');const next=Object.assign({},clearDraftLocation(row),{roomIndex:index,roomName:room.name,needsRoom:false,placeName:row.locationMention||row.placeName});const candidates=store.resolveLocation(next.placeName,room.name);if(candidates.length){next.locationOptions=candidates;if(candidates.length===1)return chooseDraftLocation(store,next,0);next.needsLocationChoice=true;return next;}next.locationReason='新位置，确认保存后建立';const parsed=Locations.splitMention(next.placeName);if(parsed.detail){next.newAnchorName=parsed.base;next.subPlaceName=parsed.detail;next.locationLabel=room.name+' › '+parsed.base+' › '+parsed.detail;}else next.locationLabel=room.name+' › '+next.placeName;return next;}
  function prepareLocatedDrafts(store,result,transcript){return prepareVoiceDrafts(store,result).map(row=>{if(row.action!=='placed')return row;row=Object.assign(clearDraftLocation(row),{locationMention:row.placeName});if(row.roomName&&!String(transcript||'').includes(row.roomName)){row.roomName='';row.roomIndex=-1;}const options=store.resolveLocation(row.placeName,row.roomName);row.locationOptions=options;if(options.length===1)return chooseDraftLocation(store,row,0);if(options.length>1){row.needsLocationChoice=true;row.expanded=false;return row;}if(row.roomIndex>=0)return chooseDraftRoom(store,row,row.roomIndex);row.needsRoom=true;row.expanded=false;return row;});}
  function fillContainerMatch(store,row,index){const value=fillVoiceMatch(store,row,index);if(index===0&&row.raw.quantity==null)value.quantity='';return value;}
  function prepareContainerDrafts(store,containerId,result){if(!store.container(containerId))throw new Error('容器不存在');return prepareVoiceDrafts(store,result).map(row=>{row=fillVoiceMatch(store,row,0);row.quantity=row.raw.quantity==null?'':row.raw.quantity;row.action=row.raw.action==='purchased'?'purchased':'placed';row.selected=row.action!=='purchased';row.insideLocation='';return row;});}
  function containerInputs(rows){const selected=rows.filter(x=>x.selected);if(!selected.length)throw new Error('请至少勾选一条物品');return selected.map(row=>{if(row.action==='purchased')throw new Error('待收货项不能放入容器，请取消勾选或修改原话重新整理');const option=row.matchOptions[row.matchIndex];if(!option)throw new Error('请选择新建或更新已有物品');const input={type:'placed',itemId:option.id||null,name:row.name,category:row.category,quantity:row.quantity,aliases:row.aliases||'',note:row.note||'',insideLocation:row.insideLocation||''};attributes.forEach(k=>{input[k]=row[k]||'';});return input;});}
  function containerPrompt(container,statement){const value=String(statement||'').trim();if(!value||value.length>3000)throw new Error('补充原话请输入 1～3000 字；内容过长时请精简后重新整理');return '我正在补充家中一个容器内已持有物品的清单。当前容器位置是：'+container.location.slice(-240)+'。下文“里面”“这个盒子”等指这个容器。只按补充原话拆分具体物品，款式或颜色不同要分行，同款多件合并数量；未明确的数量留空，不猜测未提到的物品。清单不代表完整库存。\n补充原话：\n'+value;}
  function formatDate(raw) {if(!raw) return '暂无记录'; const d=new Date(raw); return (d.getMonth()+1)+'月'+d.getDate()+'日 '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  return {createStore,seed,validate,parseText,findQuery:searchTerm,formatDate,categories,clothingTypes,normalizeClothingType,voiceActions,prepareVoiceDrafts,prepareLocatedDrafts,locationWarnings,chooseDraftLocation,chooseDraftRoom,clearDraftLocation,fillVoiceMatch,voiceInputs,prepareContainerDrafts,fillContainerMatch,containerInputs,containerPrompt};
});
