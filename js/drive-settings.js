import {openModal} from './ui.js';
import {subscribeDrive,prepareDrive,signInDrive,disconnectDrive,syncDrive,recoverDriveBackup,hasDriveBackup} from './drive-sync.js';
function formatBytes(bytes){if(bytes<1024)return `${bytes} B`;if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/(1024*1024)).toFixed(1)} MB`;}
export function mountDriveSettings(root){
 const status=root.querySelector('#driveStatus'),info=root.querySelector('#driveSyncInfo'),connect=root.querySelector('#driveConnect'),sync=root.querySelector('#driveSync'),disconnect=root.querySelector('#driveDisconnect'),recover=root.querySelector('#driveRecover');
 if(!status)return ()=>{};
 const unsubscribe=subscribeDrive(({message,connected,busy,syncInfo})=>{
  status.textContent=message;connect.hidden=connected;connect.disabled=false;sync.hidden=!connected;sync.disabled=busy;disconnect.hidden=!connected;
  info.textContent=syncInfo ? `本机上次同步：${new Date(syncInfo.time).toLocaleString('zh-CN', {hour12:false})} · 单份记录：${formatBytes(syncInfo.bytes)}` : '本机尚无同步记录';
 });
 connect.addEventListener('click',()=>{connect.disabled=true;signInDrive().finally(()=>{connect.disabled=false;});});
 sync.addEventListener('click',()=>syncDrive(true));
 disconnect.addEventListener('click',disconnectDrive);
 recover.hidden=!hasDriveBackup();
 recover.addEventListener('click',()=>openModal({title:'找回恢复前的记录？',body:'<p>将恢复上一次从云端同步前保存的本机学习记录。当前记录会作为新的本地恢复副本保存。</p>',actions:[{label:'取消'},{label:'确认恢复',primary:true,onClick:()=>{try{recoverDriveBackup();}catch{status.textContent='无法恢复本地记录。';}}}]}));
 prepareDrive();return unsubscribe;
}
