# 来源与授权说明 / NOTICE

EchoLab 是一个用于个人英语影子跟读练习的本地网页工具。本仓库**不包含任何视频文件**，
视频全部通过 YouTube 官方 IFrame 播放器逐流加载。

## 代码

本仓库的源代码（`js/`、`styles/`、`index.html`、`tools/`）以 **MIT License** 发布，见 `LICENSE`。

## 课程内容（`content/`）

`content/` 下的文件是为了让应用开箱可用而附带的学习材料，**不属于 MIT 授权范围**，其权利归原始作者与平台所有。

| 内容 | 来源 | 授权 / 归属 |
| --- | --- | --- |
| 字幕文本（`lesson.json` 里的 `en`） | YouTube 人工字幕；`economist-musk` 使用用户提供的 YouTube 自动字幕导出稿 | 归原权利人所有 |
| 字幕译文（`lesson.json` 里的 `zh`） | 有人工中文字幕的课程取自 YouTube；`muse-launch` 一课为本项目用 AI 翻译，已标注 | 归原字幕译者；AI 译文由本项目生成 |
| 封面图（`poster.jpg`） | `i.ytimg.com` YouTube 官方缩略图 | 归视频作者所有 |
| 词汇释义（`dict.json`） | [ECDICT](https://github.com/skywind3000/ECDICT) | MIT |
| 重点词注解（`glosses.json`） | 本项目撰写 | MIT |

### 具体课程

| 课程 | 原始视频 | 平台 | 授权 |
| --- | --- | --- | --- |
| Grit: The Power of Passion and Perseverance | `H14bBuluwB8` | TED | CC BY-NC-ND 4.0 |
| 10 Ways to Have a Better Conversation | `R1vskiVDwl4` | TED | CC BY-NC-ND 4.0 |
| The Benefits of a Bilingual Brain | `MMmOLN5zBLY` | TED-Ed | CC BY-NC-ND 4.0 |
| How Does the Stock Market Work? | `p7HKvqRI_Bo` | TED-Ed | CC BY-NC-ND 4.0 |
| Your Body Language May Shape Who You Are | `Ks-_Mh1QhMc` | TED | CC BY-NC-ND 4.0 |
| The Biggest Launch Since ChatGPT | `1LRvMRC_pfY` | Cleo Abram（YouTube） | YouTube 标准许可 |
| The full-length interview with Elon Musk | `XuoqKYxDHVc` | The Economist（YouTube） | 视频通过官方播放器嵌入，封面归原权利人 |

TED / TED-Ed 内容依 [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) 使用：
**署名、非商业性、禁止演绎**。本仓库仅作学习与教学演示，未作任何修改性演绎（节选属于引用）。

## 使用限制

- 本项目仅供**个人学习**与教学演示，不得用于商业用途。
- 请勿将本仓库内容用于再分发、售卖或训练商业模型。
- 播放始终指向 YouTube 官方源，作者下架视频后对应课程即失效。

## 权利人移除请求

如果你是上述内容的权利人，认为本仓库的使用超出了合理引用范围，请通过 GitHub Issue 联系，
我会在确认后移除相应内容。

## 第三方组件

| 组件 | 用途 | 授权 |
| --- | --- | --- |
| [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) | 视频播放 | YouTube 服务条款 |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 抓取字幕（未随仓库分发） | Unlicense |
| [ECDICT](https://github.com/skywind3000/ECDICT) | 离线词典 | MIT |
| [Princeton WordNet 3.0](https://wordnet.princeton.edu/) | 离线同词族关系（`content/word-families.json`） | [WordNet 3.0 许可](licenses/WORDNET-3.0.txt)，Copyright 2006 Princeton University |
