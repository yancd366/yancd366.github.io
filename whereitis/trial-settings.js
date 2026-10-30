function webTrialSettings(){
 app.innerHTML='<section class="web-settings">'+intro('YOUR DATA, YOUR MEMORY','这份记忆，属于你。','本机保存，也能主动备份到云端。')+`
 <div class="card hero section"><div class="section-title">记录保存在当前浏览器</div><p class="muted">物品和照片保存在这台设备。清理网站数据或更换浏览器前，请先备份。${window.WhereitisCloudBase?'云备份需主动确认，不会自动与微信同步。':'云备份尚未接通。'}</p></div>
 <div class="card section"><label class="check-label"><input id="settings-ai-enabled" type="checkbox" ${aiPreferences.enabled()?'checked':''}>启用智能识别</label><p class="muted">${esc(window.WhereitisPreferences.notice)}</p></div>
 <div id="cloud-panel" class="card section">${cloudPanelHTML()}</div>
 <div class="card section backup-card"><div class="section-title">带照片的本机备份</div><p class="muted">下载一份包含已保存记录和照片的备份文件。</p><div class="backup-actions">${btn('下载记录与照片','export','','primary')}<label class="btn">从备份恢复<input type="file" id="backup-file" accept=".json,application/json" hidden></label></div><p class="backup-warning">恢复会替换当前浏览器记录，请先保留备份。</p><details class="backup-details"><summary>备份包含哪些内容？</summary><p class="muted">包含已保存的物品、位置、日期、分层关系和照片，不包含未入库草稿。微信旧JSON中的本机照片路径不能在网页恢复为照片；从微信迁移请使用上方的个人云备份。</p></details></div>
 <details class="card section settings-details"><summary>安装到桌面、录音与试用说明</summary><p class="muted">iPhone：用Safari打开，通过分享菜单添加到主屏幕。安卓：可查看浏览器的安装 / 添加到桌面选项。智能识别需联网；相机与录音由浏览器授权。微信内打开异常时，可改用Safari或Chrome。尚未接入Siri、自动云同步或离线通知。</p></details>
 <details class="card section settings-details"><summary>退出或清空</summary><p class="muted">退出不删除本机记录，原邀请码重新进入可继续查看。分享网址和试用邀请码即可邀请体验，请保密自己的个人云登录码及备份。</p><div class="settings-account-actions">${btn('退出试用','web-logout','','small')}${btn('清空本机全部记录','clear','','danger small')}</div></details>
 <p class="muted web-version section">在哪儿网页 v0.3.1</p></section>`;
}
document.addEventListener('click',async e=>{if(e.target.closest('[data-action="web-logout"]')){try{await window.WhereitisWeb.adapter.flush();const r=await fetch('/trial/logout',{method:'POST'});if(!r.ok)throw new Error('退出未完成，请重试');location.replace(window.WhereitisPages?.loginUrl||'/');}catch(e){toast(e.message);}}});
