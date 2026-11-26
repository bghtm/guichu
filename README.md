# 冰棍鬼畜作品集

**线上：<https://bghtm.github.io/guichu/>** · **仓库：<https://github.com/bghtm/guichu>**（公开）

冰棍好烫啊（[@bghtnya](https://space.bilibili.com/)）的药圈 / 唐毓文向鬼畜作品存档站。
形制仿照「跨圈人物志」那套蓝粉白鱼板底：一页列表 + 一页一作品，每部作品都有**封面、简介、制作信息与完整歌词**，正片以 HLS 切片在线播放。

- 首页：两个系列（药圈金曲 / 唐毓文系列）、8 部作品按发布顺序排列，可点系列筛选
- 单部作品页：播放器 + 简介 + 本家/填词/调教/演唱 + 逐段歌词 + 上一部/下一部
- 歌词全集页：8 首歌词铺在一起，支持中文关键词检索（搜「切糕」能跳到出现这句的段落）

线上站点就是仓库里的 `site/` 目录，纯静态，没有任何后端。

---

## 本地预览

```bash
node server.mjs            # → http://127.0.0.1:4477/
```

Windows 上双击 `start.cmd` 等价。**不要直接双击 `index.html`**：页面用 `fetch` 读 `data/works.json`，`file://` 下会被浏览器拦掉。

> 端口 4477 可以改：`node server.mjs --port 8080`。别用 4310 —— 腾讯 QQ 的本地服务常占着它。

---

## 目录结构

```
content/
  works.json            文案与歌词（唯一需要手写的内容源）
  sources.local.json    本机原始素材路径（含绝对路径，已 gitignore）
data/
  media.json            切片产物的登记表（时长/画幅/字节数/段数），脚本生成
site/                    ← 这个目录就是发布产物
  index.html
  assets/app.js         路由：#/  #/work/<id>  #/lyrics
  assets/style.css
  assets/vendor/hls.min.js
  data/works.json       content + media 合并后的前端数据，脚本生成
  media/hls/<id>/       每部作品一个目录：index.m3u8 + seg_0000.ts …
  media/covers/<id>.webp 封面海报（1600×900）+ <id>-sm.webp（720×405）
tools/
  prepare-media.mjs     视频 → HLS 切片、封面 → webp 海报
  build-data.mjs        合并数据
  verify.mjs            上线前自检（切片齐不齐、有没有超 100 MB 的单文件、总体积）
  cdp-shot.mjs          无依赖截图/验收（走 Edge DevTools 协议）
server.mjs              本地静态服务器
```

---

## 加一部新作品

**1. 把文案写进 `content/works.json`**

按顺序追加一条，`num` 用两位数连着编；`series` 填 `jin`（药圈金曲）或 `tang`（唐毓文系列）。
歌词是一段一段的，`label` 用来分段（`副歌` 会自动标粉、`念白` 显示成斜体）：

```json
{
  "id": "gc09",
  "num": "09",
  "title": "标题",
  "kicker": "药圈金曲",
  "series": "jin",
  "subtitle": "一句话副标题",
  "chips": ["洛天依", "本家：某某", "药圈金曲"],
  "credits": [
    { "k": "本家", "v": "《某某》· 某某" },
    { "k": "填词", "v": "冰棍好烫啊 @bghtnya" },
    { "k": "演唱", "v": "洛天依" }
  ],
  "summary": "两三句简介。",
  "lyrics": [
    { "label": "主歌一", "lines": ["第一句", "第二句"] },
    { "label": "副歌", "lines": ["……"] }
  ]
}
```

没有歌词的作品（纯画面短片）写 `"lyrics": []` 加一句 `"lyricsNote": "……"`，页面会自动出「无歌词」空状态。

**2. 把素材路径写进 `content/sources.local.json`**

```json
"gc09": { "src": "D:\\media\\作品.mp4", "cover": "D:\\media\\封面.png" }
```

**3. 跑两个脚本，然后 push**

```bash
node tools/prepare-media.mjs --only gc09   # 只处理这一部
node tools/build-data.mjs                  # 重新生成 site/data/works.json
node tools/verify.mjs                      # 自检：切片是否齐、体积是否超限
git add -A && git commit -m "第 9 部" && git push
```

`--force` 重做已有产物，`--crf 22` / `--preset slower` 可以换画质档位（默认按片长自动 24–26，`veryfast`）。

---

## 为什么视频要切片

- GitHub **单文件上限 100 MB**：原片最大一部 324 MB，直接推会被拒。
- Pages 站点约 **1 GB**：8 部原片合计 826 MB，几乎占满，而且首屏要拖整段 MP4。

`tools/prepare-media.mjs` 用 ffmpeg 转成 **HLS**：每 6 秒一个 `.ts`（通常 0.3–2 MB），外加一个 `index.m3u8`。
播放时 `hls.js` 逐段拉取塞进 MSE，所以拖进度条照常工作，**不是「拼接视频」**。

- 长边压到 1600（竖版 900×1600、横版 1600×900），CRF 24–26；
- 826 MB 原片 → **约 96 MB** 切片 + 0.5 MB 封面；
- 单文件永远小于 100 MB，整站远低于 1 GB。

`hls.min.js` 放在 `site/assets/vendor/` 里，不依赖外网 CDN；Safari 走原生 HLS。

---

## 部署到 GitHub Pages

已经接好了：仓库 `bghtm/guichu`（公开），Pages 的 **Source = GitHub Actions**，`site/` 就是发布产物。
**以后只需要 `git push`**，Action 会自动重新上传并发布，1–2 分钟后线上生效。

```bash
git add -A && git commit -m "第 9 部" && git push
```

新仓库要从零接一遍时：

```bash
git init && git add . && git commit -m "冰棍鬼畜作品集"
git branch -M main
git remote add origin https://github.com/<账号>/guichu.git
git push -u origin main
```

然后 仓库 → **Settings → Pages → Build and deployment → Source 选 `GitHub Actions`**。
细节与常见坑见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

---

## 版权与说明

本站为个人二创作品的**非商业存档**，只用于展示与检索。歌词、影像与配乐的著作权归各自原作者（本家 / 原作 / 演唱 / 参演者）；
片中对人物的叙述属于作品内容本身，不代表站点立场。若相关权利人希望下架某一部，请开 issue。
