# 部署到 GitHub Pages

这个仓库只有一种部署方式：**`site/` 目录原样上传**，视频切片、封面、数据全在包内，不依赖任何外部存储。

## 步骤

### 1. 本机先把产物跑齐

```bash
node tools/prepare-media.mjs     # 视频 → site/media/hls/、封面 → site/media/covers/
node tools/build-data.mjs        # → site/data/works.json
```

两条都成功时会打印类似：

```
共 8 部 · 本次处理 0 部 · 视频 95.8 MB + 封面 0.5 MB = 96.4 MB
✓ site/data/works.json · 8 部作品 · 7 部有词（31 段 / 135 行）· 总时长 13:01 · 95.8 MB
```

### 2. 推到 GitHub

```bash
git init
git add .
git commit -m "冰棍鬼畜作品集"
git branch -M main
git remote add origin git@github.com:<账号>/<仓库名>.git
git push -u origin main
```

首次 push 约 100 MB，慢是正常的；之后每次只增量推送新增的切片。

> `content/sources.local.json` 与 `.build/`、`shots/` 已在 `.gitignore` 里 —— 本机绝对路径不该进仓库。push 前 `git status` 确认一下。

### 3. 打开 Pages

仓库 → **Settings → Pages → Build and deployment**

- Source 选 **`GitHub Actions`**（不要选 Deploy from a branch）
- 第一次 push 后 Action 会自动跑一次；也可以在 **Actions → Deploy to GitHub Pages → Run workflow** 手动触发

### 4. 验收

打开 `https://<账号>.github.io/<仓库名>/`，逐项点一遍：

1. 首页 8 张卡都在、封面都出图（不是灰块）
2. 点任意一张 → 进单部页，播放器能起播、能拖进度条
3. 点系列筛选（药圈金曲 / 唐毓文系列）→ 卡片数变成 4
4. 进「歌词全集」，搜一个词（比如 `切糕`）→ 只剩命中的段落，且命中字高亮
5. 手机宽度下（380px 左右）没有横向滚动条

---

## 常见坑

- **首屏空白、控制台报 404 `/data/works.json`**：Action 上传的目录不是 `site/`。检查 `pages.yml` 里的 `path: site`。
- **视频转圈不播**：`.m3u8` 或 `.ts` 没进仓库。`git status` 看 `site/media/hls/` 是否被忽略；Pages 的 artifact 上限是 1 GB。
- **`m3u8` 缓存**：播放列表很小，Pages 会正常返回；如果改过切片，`.ts` 可能被浏览器缓存，强刷一次即可。
- **相对路径**：数据里写的是 `media/hls/gc05/index.m3u8` 这种相对路径，换账号名、换仓库名都不用改。
- **仓库体积**：切片约 96 MB + 封面 0.5 MB + 站点 < 0.5 MB，远低于 GitHub 建议的 1 GB；如果只想先上线一部分，`node tools/prepare-media.mjs --only gc01,gc02` 分批加。
- **超过 100 MB 的单文件**：`prepare-media.mjs` 默认 6 秒一段，单段 0.3–2 MB，不会碰到单文件上限；除非自己加 `--hls-time 60`。
- **GitHub Actions 的额度**：静态 Pages 不需要构建步骤，Action 只是打包上传，几十秒跑完。

## 想保留原片画质？

切片是按「网页能秒开」压的（长边 1600、CRF 24–26，肉眼与原片差别很小）。
真要原片，就把它放到 **GitHub Releases**（单文件 ≤ 2 GB）或对象存储，在 `content/works.json` 里给作品加一个 `download` 字段，再在前端加一个下载按钮即可 —— 目前站点没有做这条路径。
