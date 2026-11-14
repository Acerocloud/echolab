/* EchoLab — 关于 */

import { icon, esc } from "./ui.js";

export const meta = { title: "关于" };

export function render(root) {
  root.innerHTML = `
    <div class="prose fade-up">
      <span class="eyebrow">${icon("spark", 14)} ABOUT</span>
      <h1>关于 EchoLab</h1>
      <p class="lead">
        EchoLab 是一个「只做一件事」的网页工具：把一段真实英文语音，切成句子，
        让你一句一句地听、想、说、比。它模仿 VoiceTube 的逐句播放与跟读体验，
        但把重心从「看很多视频」挪到「把一句话说像」。
      </p>

      <h2>为什么是影子跟读</h2>
      <p>
        Shadowing（影子跟读）是边听边说，训练的是「同步处理」能力；回音法（Echo Method，
        台大外文系史嘉琳教授提出）在听和说之间插入一段「停顿」——先让声音在脑中回响，
        再开口模仿。多出来的这几秒，正是校准语调、连读与节奏的地方。
      </p>
      <p>EchoLab 把这个过程变成了四个可点击的状态：</p>
      <div class="four">
        <div><b>01 听</b><span>只播这一句，抓重音与停顿</span></div>
        <div><b>02 回声</b><span>静默 3 秒，在心里重放</span></div>
        <div><b>03 说</b><span>录一遍，看到自己的波形</span></div>
        <div><b>04 对比</b><span>原声 / 我的 / 叠加</span></div>
      </div>

      <h2>素材与版权</h2>
      <p>所有课程只收录<strong>带人工字幕</strong>（YouTube 上由人工上传的 subtitles，而非自动生成的 captions）的素材，这样跟读时不会跟着错误字幕练错；视频全部走 <strong>YouTube 嵌入</strong>，不落地到本地。</p>
      <ul>
        <li><b>TED / TED-Ed</b>：CC BY-NC-ND 4.0，署名—非商业性使用—禁止演绎。</li>
        <li><b>播放方式</b>：全部通过 YouTube 官方 IFrame 播放器逐流加载，本项目不存储、不分发任何视频文件。</li>
      </ul>
      <p class="muted small">
        本项目仅用于个人学习与教学演示，不存储、不分发原始视频，也不提供下载。若需公开部署，请替换为已授权内容或改为官方外链播放。
      </p>

      <h2>隐私</h2>
      <p>
        没有账号，没有服务器。录音通过浏览器 <code>MediaRecorder</code> 生成，
        只存在于当前页面的内存里，关闭页面即销毁；学习进度写在 <code>localStorage</code>。
        你可以随时在设置页导出或清空。
      </p>

      <h2>技术</h2>
      <ul>
        <li>纯静态：HTML + CSS + 原生 ES Modules，无框架、无构建、无依赖。</li>
        <li>波形对比：<code>Web Audio API</code> 的 <code>AnalyserNode</code> 分别采样原声与麦克风，取 RMS 包络归一化后叠画。</li>
        <li>课程管线：<code>tools/build_lessons.py</code> 下载人工字幕 → 剪辑转码 → 句子合并 → 中英对齐 → 生成 <code>lesson.json</code>。</li>
      </ul>

      <p class="muted small" style="margin-top:34px">
        EchoLab v0.8.0 · 产品需求文档见 <code>docs/PRD.md</code>
      </p>
    </div>
  `;
  return () => {};
}
