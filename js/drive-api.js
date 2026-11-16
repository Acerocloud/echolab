/* Google Drive application-data transport. Access tokens remain in memory. */
import { validateSnapshot } from './cloud-records.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2Cname%2CmodifiedTime';
const FILE = 'echolab-learning-records.json';

export class DriveError extends Error {
  constructor(message, status) { super(message); this.name = 'DriveError'; this.status = status; }
}

export function createDriveClient(accessToken, fetcher = fetch) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) throw new Error('尚未连接 Google 账号');
  async function request(url, options = {}) {
    const response = await fetcher(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    if (!response.ok) {
      let details = '';
      try { const data = await response.json(); details = data?.error?.message || ''; } catch { /* empty error body */ }
      throw new DriveError(details || `Google Drive 请求失败（${response.status}）`, response.status);
    }
    return response;
  }
  return {
    async list() {
      const params = new URLSearchParams({ spaces: 'appDataFolder', q: `name = '${FILE}' and trashed = false`, fields: 'nextPageToken,files(id,name,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '100' });
      const result = []; let page;
      do {
        if (page) params.set('pageToken', page);
        const data = await (await request(`${API}/files?${params}`)).json();
        if (!Array.isArray(data.files)) throw new DriveError('Google Drive 返回的文件列表格式不正确');
        result.push(...data.files); page = data.nextPageToken;
        if (result.length > 10000) throw new DriveError('云端备份数量过多');
      } while (page);
      return result;
    },
    async read(id) {
      if (!/^[\w-]+$/.test(id)) throw new Error('云端备份编号无效');
      const response = await request(`${API}/files/${encodeURIComponent(id)}?alt=media`);
      return validateSnapshot(await response.json());
    },
    async create(snapshot) {
      const safe = validateSnapshot(snapshot);
      const metadata = JSON.stringify({ name: FILE, parents: ['appDataFolder'] });
      const boundary = 'echolab-' + crypto.randomUUID();
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(safe)}\r\n--${boundary}--\r\n`;
      return (await request(UPLOAD, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json();
    }
  };
}
