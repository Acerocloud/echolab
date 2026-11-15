async function request(action) {
  const response = await fetch(`/api/update/${action}`, {
    method: "POST",
    headers: { "X-EchoLab-Update": "1" },
  });
  if (response.status === 404 || response.status === 405 || response.status === 501) {
    throw new Error("一键更新需要通过 Windows 的 start.bat 启动。");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "更新服务暂不可用。");
  return result;
}

let check;

export function checkForUpdate({ refresh = false } = {}) {
  if (!check || refresh) check = request("check");
  return check;
}

export async function installUpdate() {
  const { version } = await request("install");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const response = await fetch("package.json", { cache: "no-store", signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.json()).version === version) {
        location.reload();
        return;
      }
    } catch {
      // The local server may still be restarting.
    }
  }
  throw new Error("更新已安装，本地服务尚未重启。请重新打开 start.bat。");
}
