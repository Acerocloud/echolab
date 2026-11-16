/* Drive sync remains active while navigating between pages. */
import {state} from './store.js';
import {openModal, esc} from './ui.js';
import {learningSnapshot, compareSnapshots, applyLearningSnapshot} from './cloud-records.js';
import {createDriveClient} from './drive-api.js';
import {createGoogleWebAuth} from './google-web-auth.js';
import {GOOGLE_WEB_CLIENT_ID} from './google-web-config.js';
const BASELINE='echolab.drive.baseline.v1', ROLLBACK='echolab.drive.restore-backup.v1';
let message='尚未连接。学习记录保存在本机。', folder='', account='', busy=false, conflict=false, queued=false, timer, ready=false;
const listeners=new Set();
const notify=()=>{for(const fn of listeners) fn({message,folder,connected:!!auth.currentToken(),ready,busy});};
const show=s=>{message=s;notify();};
const auth=createGoogleWebAuth({clientId:GOOGLE_WEB_CLIENT_ID,onChange:connected=>{if(!connected){folder='';message='登录已过期，请重新登录以继续自动同步。';} notify();}});
function baseline(){try{const saved=JSON.parse(localStorage.getItem(BASELINE));return saved?.account===account?saved.snapshot:null;}catch{return null;}}
function saveBaseline(snapshot){localStorage.setItem(BASELINE,JSON.stringify({account,snapshot}));}
function restore(snapshot){const next=JSON.parse(JSON.stringify(state));applyLearningSnapshot(next,snapshot);localStorage.setItem(ROLLBACK,JSON.stringify(learningSnapshot(state)));localStorage.setItem('echolab.v1',JSON.stringify(next));saveBaseline(snapshot);location.reload();}
export function recoverDriveBackup(){const s=localStorage.getItem(ROLLBACK);if(s)restore(JSON.parse(s));}
export function hasDriveBackup(){return !!localStorage.getItem(ROLLBACK);}
export function subscribeDrive(fn){listeners.add(fn);notify();return ()=>listeners.delete(fn);}
export async function prepareDrive(){try{await auth.prepare();ready=true;notify();}catch(e){ready=false;show(e.message || 'Google 登录组件加载失败。');}}
export function signInDrive(){
  if(!ready){prepareDrive();return Promise.resolve();}
  show('请在登录窗口中完成 Google 授权。');
  return auth.signIn().then(()=>{folder='';conflict=false;show('已连接，正在检查云端记录…');scheduleDriveSync(0);}).catch(e=>show(e.message || '登录未完成，请重试。'));
}
export function disconnectDrive(){clearTimeout(timer);auth.disconnect();folder='';conflict=false;show('已在本机断开连接，云端备份仍然保留。');}
export function scheduleDriveSync(delay=15000){if(!auth.currentToken() || conflict)return;clearTimeout(timer);timer=setTimeout(()=>syncDrive(),delay);}
export async function syncDrive(manual=false){
 if(busy){queued=true;return;} if(manual)conflict=false; if(conflict)return;
 const token=auth.currentToken(); if(!token){show('请先登录 Google，以启用自动同步。');return;}
 busy=true;show('正在检查云端记录…');
 try{
  const drive=createDriveClient(token);
  account=await drive.accountId(); folder='appDataFolder';
  const list=await drive.list();
  let remote=list.length?await drive.read(list[0].id):null, migrated=false;
  // The previous release may have written newer records to a visible folder.
  if(list[0]?.appProperties?.visibleMigration!=='done'){
    const visibleFolder=await drive.findFolder();
    const visibleList=visibleFolder?await drive.list(visibleFolder):[];
    const visible=visibleList.length?await drive.read(visibleList[0].id):null;
    const local=learningSnapshot(state);
    if(visible && ((remote && compareSnapshots(visible,remote,null).action!=='unchanged') || compareSnapshots(local,visible,null).action!=='unchanged')){
      conflict=true;show('发现旧版可见文件夹中的记录，请选择要保留的版本。');
      const choose=async snapshot=>{try{await drive.create(snapshot);if(compareSnapshots(learningSnapshot(state),snapshot,null).action==='unchanged'){saveBaseline(snapshot);conflict=false;show('记录已迁移到隐藏数据区，自动同步已开启。');}else restore(snapshot);}catch(e){show(e.message || '迁移失败，原记录未删除。');}};
      const actions=[{label:'稍后处理'},{label:'使用本机记录',onClick:()=>{choose(learningSnapshot(state));}},{label:'使用可见文件夹记录',onClick:()=>{choose(visible);}}];
      if(remote)actions.splice(2,0,{label:'使用隐藏区记录',onClick:()=>{choose(remote);}});
      openModal({title:'选择要迁移的学习记录',body:'<p>发现上个版本保存在可见文件夹的记录，与本机或隐藏区的记录不同。请选择要继续使用的版本；原有云端记录会保留，恢复前会备份本机记录。</p>',actions});
      return;
    }
    if(visible && !remote){await drive.create(visible);remote=visible;migrated=true;}
  }
  const local=learningSnapshot(state), decision=compareSnapshots(local,remote,baseline()).action;
  if(decision==='unchanged'){
    if(!migrated && list[0]?.appProperties?.visibleMigration!=='done')await drive.create(local);
    saveBaseline(local);show('自动同步已开启，学习记录已同步。');
  }else if(decision==='upload'){
    await drive.create(local,folder);saveBaseline(local);show('自动同步已开启，学习记录已备份。');
  }else if(decision==='download'){
    // Do not overwrite edits made while the network request was in flight.
    if(compareSnapshots(learningSnapshot(state),local,null).action!=='unchanged'){queued=true;show('本机记录发生变化，正在重新检查。');}
    else {restore(remote);}
  }else{
    conflict=true;show('本机和云端记录不同，请选择要保留的版本。');
    openModal({title:'选择要保留的学习记录',body:`<p>本机和 Google Drive 中有不同的学习记录。云端已有备份不会被删除；选择云端前会在本机保存恢复副本。</p>${list[0]?.modifiedTime?`<p>云端备份时间：${esc(new Date(list[0].modifiedTime).toLocaleString())}</p>`:''}`,actions:[
      {label:'稍后处理'},
      {label:'使用云端记录',onClick:()=>{try{restore(remote);}catch{show('无法保存本地恢复副本，未修改本机记录。');}}},
      {label:'使用本机记录',primary:true,onClick:()=>{(async()=>{try{const snapshot=learningSnapshot(state);await drive.create(snapshot,folder);saveBaseline(snapshot);conflict=false;show('本机记录已备份，自动同步已开启。');scheduleDriveSync();}catch(e){show(e.message || '同步失败。');}})();}}
    ]});
  }
 }catch(e){if(e.status===401){auth.disconnect();show('Google 登录已过期，请重新登录。');}else show(e.message || '同步失败，记录仍保存在本机。');}
 finally{busy=false;notify();if(queued){queued=false;scheduleDriveSync(1000);}}
}
window.addEventListener('echolab:learning-saved',()=>scheduleDriveSync());
window.addEventListener('online',()=>scheduleDriveSync(1000));
setInterval(()=>scheduleDriveSync(0),120000);
