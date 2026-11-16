/* Google Identity Services token flow for the local Windows web UI. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_URL = 'https://accounts.google.com/gsi/client';
let libraryPromise;

export function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve(globalThis.google.accounts.oauth2);
  if (!libraryPromise) {
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_URL;
      script.async = true;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true; clearTimeout(timeout);
        if (error) { script.remove(); reject(error); }
        else if (globalThis.google?.accounts?.oauth2) resolve(globalThis.google.accounts.oauth2);
        else { script.remove(); reject(new Error('Google 登录组件加载失败。')); }
      };
      const timeout = setTimeout(() => finish(new Error('Google 登录组件加载超时，请检查网络。')), 15000);
      script.onload = () => finish();
      script.onerror = () => finish(new Error('无法加载 Google 登录组件，请检查网络。'));
      document.head.appendChild(script);
    }).catch(error => { libraryPromise = null; throw error; });
  }
  return libraryPromise;
}

// Access tokens intentionally live only in memory and are never written to localStorage.
export function createGoogleWebAuth({clientId, load = loadGoogleIdentity, now = Date.now, onChange = () => {}}) {
  let client, token = '', expires = 0, pending;
  function currentToken() {
    if (token && now() >= expires) { token = ''; expires = 0; onChange(false); }
    return token;
  }
  async function prepare() {
    if (client) return;
    if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId || '')) throw new Error('Google 网页客户端尚未配置。');
    const oauth = await load();
    client = oauth.initTokenClient({
      client_id: clientId, scope: `${DRIVE_SCOPE} ${DRIVE_FILE_SCOPE}`,
      callback: result => {
        const active = pending; pending = null;
        if (!active) return;
        if (result.error || !result.access_token || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in) <= 0) {
          active.reject(new Error('Google 授权未完成，请重试。')); return;
        }
        const scopes = String(result.scope || '').split(/\s+/);
        if (!scopes.includes(DRIVE_SCOPE) || !scopes.includes(DRIVE_FILE_SCOPE)) { active.reject(new Error('请允许 EchoLab 访问应用数据和创建的文件，才能同步。')); return; }
        token = result.access_token;
        expires = now() + Math.max(1, Number(result.expires_in) - 60) * 1000;
        onChange(true); active.resolve();
      },
      error_callback: error => {
        const active = pending; pending = null;
        if (!active) return;
        active.reject(new Error(error?.type === 'popup_failed_to_open' ? '浏览器阻止了登录窗口，请允许弹窗后重试。' : '登录窗口已关闭或授权未完成。'));
      },
    });
  }
  function signIn() {
    if (!client) return Promise.reject(new Error('Google 登录尚未准备好，请稍后重试。'));
    if (pending) return Promise.reject(new Error('Google 登录正在进行中。'));
    return new Promise((resolve,reject) => {
      pending = { resolve, reject };
      try { client.requestAccessToken({prompt:'select_account'}); }
      catch { pending = null; reject(new Error('无法打开 Google 登录窗口，请检查浏览器弹窗设置。')); }
    });
  }
  function disconnect() {
    token=''; expires=0;
    if (pending) { const active=pending; pending=null; active.reject(new Error('登录已取消。')); }
    onChange(false);
  }
  return {prepare, signIn, currentToken, disconnect};
}
