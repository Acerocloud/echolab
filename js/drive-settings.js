import {openModal} from './ui.js';
import {subscribeDrive,prepareDrive,signInDrive,disconnectDrive,syncDrive,recoverDriveBackup,hasDriveBackup} from './drive-sync.js';
export function mountDriveSettings(root){
 const status=root.querySelector('#driveStatus'),connect=root.querySelector('#driveConnect'),sync=root.querySelector('#driveSync'),disconnect=root.querySelector('#driveDisconnect'),recover=root.querySelector('#driveRecover');
 if(!status)return ()=>{};
 const unsubscribe=subscribeDrive(({message,folder,connected,ready,busy})=>{
  status.textContent=message;connect.hidden=connected;connect.disabled=false;sync.hidden=!connected;sync.disabled=busy;disconnect.hidden=!connected;
 });
 connect.addEventListener('click',()=>{connect.disabled=true;signInDrive().finally(()=>{connect.disabled=false;});});
 sync.addEventListener('click',()=>syncDrive(true));
 disconnect.addEventListener('click',disconnectDrive);
 recover.hidden=!hasDriveBackup();
 recover.addEventListener('click',()=>openModal({title:'找回恢复前的记录？',body:'<p>将恢复上一次从云端同步前保存的本机学习记录。当前记录会作为新的本地恢复副本保存。</p>',actions:[{label:'取消'},{label:'确认恢复',primary:true,onClick:()=>{try{recoverDriveBackup();}catch{status.textContent='无法恢复本地记录。';}}}]}));
 prepareDrive();return unsubscribe;
}
