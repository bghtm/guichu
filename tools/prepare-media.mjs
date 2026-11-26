#!/usr/bin/env node
/**
 * 把原始视频编成 HLS 切片、把封面编成 webp 海报，并登记到 data/media.json
 *
 *   node tools/prepare-media.mjs                 # 处理所有缺产物的作品
 *   node tools/prepare-media.mjs --only gc04     # 只处理一部
 *   node tools/prepare-media.mjs --force --only gc07
 *   node tools/prepare-media.mjs --crf 26 --preset faster
 *
 * 为什么切片：GitHub 单文件上限 100 MB、Pages 站点约 1 GB，原片最大 324 MB。
 * 切成 6 秒一个 .ts（每段 1–3 MB）+ 一个 index.m3u8，播放时 hls.js 逐段拉取。
 * 顺带把长边压到 1280、CRF 24–26 —— 800 MB 的原片降到约 200 MB。
 *
 * 原始素材路径放在 content/sources.local.json（不进仓库）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const FORCE = flag('force');
const ONLY = opt('only', '').split(',').map((s) => s.trim()).filter(Boolean);
const CRF_OVERRIDE = opt('crf', '');
const PRESET = opt('preset', 'veryfast');
const MAX_EDGE = Number(opt('edge', '1280'));
const HLS_TIME = Number(opt('hls-time', '6'));

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const content = readJSON(path.join(ROOT, 'content/works.json'));
const sourcesPath = path.join(ROOT, 'content/sources.local.json');
if (!fs.existsSync(sourcesPath)) {
  console.error('× 缺少 content/sources.local.json（原始素材路径清单）');
  process.exit(1);
}
const sources = readJSON(sourcesPath);

const MEDIA_DIR = path.join(ROOT, 'site/media');
const HLS_DIR = path.join(MEDIA_DIR, 'hls');
const COVER_DIR = path.join(MEDIA_DIR, 'covers');
const DATA_DIR = path.join(ROOT, 'data');
const TMP = path.join(ROOT, '.build/tmp');
for (const d of [HLS_DIR, COVER_DIR, DATA_DIR, TMP]) fs.mkdirSync(d, { recursive: true });

/* ---------------------------------------------------------------- helpers */
function run(bin, args, label) {
  const started = Date.now();
  const r = spawnSync(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error) throw new Error(`${label} 启动失败：${r.error.message}`);
  if (r.status !== 0) throw new Error(`${label} 失败（exit ${r.status}）`);
  return Math.round((Date.now() - started) / 1000);
}

/** ffprobe 结果写文件再读回来 —— 不走管道，避免沙箱把 stdio 管道拦掉 */
function probe(file) {
  const out = path.join(TMP, 'probe.json');
  const fd = fs.openSync(out, 'w');
  try {
    const r = spawnSync(
      FFPROBE,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      { stdio: ['ignore', fd, 'inherit'] }
    );
    if (r.error) throw new Error(`ffprobe 启动失败：${r.error.message}`);
    if (r.status !== 0) throw new Error(`ffprobe 失败（exit ${r.status}）：${file}`);
  } finally {
    fs.closeSync(fd);
  }
  const j = readJSON(out);
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
  const rate = String(v.r_frame_rate || '25/1').split('/');
  return {
    duration: Number(j.format?.duration || 0),
    width: Number(v.width || 0),
    height: Number(v.height || 0),
    fps: Number(rate[1]) ? Number(rate[0]) / Number(rate[1]) : 25
  };
}

function clock(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

function sumBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).reduce((acc, f) => acc + fs.statSync(path.join(dir, f)).size, 0);
}

/* ------------------------------------------------------------------- main */
const works = content.works.filter((w) => !ONLY.length || ONLY.includes(w.id));
const media = fs.existsSync(path.join(DATA_DIR, 'media.json'))
  ? readJSON(path.join(DATA_DIR, 'media.json'))
  : {};

let done = 0;
let failed = [];

for (const work of works) {
  const src = sources[work.id];
  if (!src || !src.src) {
    console.log(`· ${work.id} ${work.title} —— 没有原始路径，跳过`);
    continue;
  }
  for (const key of ['src', 'cover']) {
    if (src[key] && !fs.existsSync(src[key])) throw new Error(`${work.id} 的 ${key} 不存在：${src[key]}`);
  }

  const outDir = path.join(HLS_DIR, work.id);
  const playlist = path.join(outDir, 'index.m3u8');
  const needVideo = FORCE || !fs.existsSync(playlist) || !fs.existsSync(path.join(COVER_DIR, work.id + '.webp'));

  if (!needVideo && media[work.id]) {
    console.log(`· ${work.id} ${work.title} —— 已有产物，跳过（--force 可重做）`);
    continue;
  }

  console.log(`\n▶ ${work.id} ${work.title}`);
  const meta = probe(src.src);
  if (src.cover) meta.cover = probe(src.cover);

  // 1) 视频 → HLS
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const longEdge = Math.max(meta.width, meta.height);
  const crf = String(CRF_OVERRIDE || src.crf || (meta.duration > 180 ? 26 : meta.duration > 60 ? 25 : 24));
  const scale =
    longEdge > MAX_EDGE
      ? `scale=w='min(iw,${MAX_EDGE})':h='min(ih,${MAX_EDGE})':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`
      : 'null';

  const audioArgs = meta.audioBytesMono ? ['-ac', '2'] : ['-ac', '2'];
  const secs = run(
    FFMPEG,
    [
      '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-i', src.src,
      '-vf', scale,
      '-c:v', 'libx264', '-preset', PRESET, '-crf', crf, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-force_key_frames', `expr:gte(t,n_forced*${HLS_TIME})`,
      '-sc_threshold', '0',
      ...audioArgs, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-f', 'hls', '-hls_time', String(HLS_TIME), '-hls_playlist_type', 'vod',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', path.join(outDir, 'seg_%04d.ts'),
      playlist
    ],
    'ffmpeg'
  );

  // 2) 封面 → webp 海报（模糊铺底 + 完整画面居中，竖版素材也不会被裁掉）
  if (src.cover) {
    const coverArgs = (w, h, q, out) => [
      '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-i', src.cover,
      '-filter_complex',
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=26,eq=brightness=-0.06:saturation=0.85[bg];` +
        `[0:v]scale=${Math.round(w * 0.9)}:${Math.round(h * 0.9)}:force_original_aspect_ratio=decrease:flags=lanczos[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p`,
      '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(q), '-compression_level', '6',
      out
    ];
    run(FFMPEG, coverArgs(1600, 900, 84, path.join(COVER_DIR, work.id + '.webp')), 'cover-1600');
    run(FFMPEG, coverArgs(720, 405, 78, path.join(COVER_DIR, work.id + '-sm.webp')), 'cover-720');
  }

  // 3) HLS 输出的实际画幅（scale=null 时就是原画幅）
  const outPlaylist = fs.readFileSync(playlist, 'utf8');
  const lastSeg = [...outPlaylist.matchAll(/seg_(\d+)\.ts/g)].pop();
  let realW = meta.width;
  let realH = meta.height;
  if (longEdge > MAX_EDGE) {
    const ar = meta.width / meta.height;
    if (ar >= 1) { realW = MAX_EDGE; realH = Math.round(MAX_EDGE / ar / 2) * 2; }
    else { realH = MAX_EDGE; realW = Math.round(MAX_EDGE * ar / 2) * 2; }
  }

  media[work.id] = {
    duration: Math.round(meta.duration * 10) / 10,
    durationText: clock(meta.duration),
    source: {
      width: meta.width, height: meta.height, fps: Math.round(meta.fps * 100) / 100,
      bytes: fs.statSync(src.src).size
    },
    width: realW,
    height: realH,
    crf: Number(crf),
    bytes: sumBytes(outDir),
    segments: lastSeg ? Number(lastSeg[1]) + 1 : 0,
    hls: `media/hls/${work.id}/index.m3u8`,
    cover: src.cover ? `media/covers/${work.id}.webp` : '',
    coverSm: src.cover ? `media/covers/${work.id}-sm.webp` : '',
    encoded: new Date().toISOString().slice(0, 10)
  };

  const m = media[work.id];
  console.log(
    `  ✓ ${m.durationText} · ${m.width}×${m.height} · CRF ${m.crf} · ${m.segments} 段 · ` +
      `${(m.bytes / 1024 / 1024).toFixed(1)} MB（原 ${(m.source.bytes / 1024 / 1024).toFixed(1)} MB）· ${secs}s`
  );
  fs.writeFileSync(path.join(DATA_DIR, 'media.json'), JSON.stringify(media, null, 2) + '\n');
  done++;
}

// 清理：产物已不存在的作品登记项
for (const id of Object.keys(media)) {
  if (!fs.existsSync(path.join(HLS_DIR, id, 'index.m3u8'))) delete media[id];
}
fs.writeFileSync(path.join(DATA_DIR, 'media.json'), JSON.stringify(media, null, 2) + '\n');

const total = Object.values(media).reduce((a, m) => a + m.bytes, 0);
const covers = sumBytes(COVER_DIR);
console.log(
  `\n共 ${Object.keys(media).length} 部 · 本次处理 ${done} 部 · 视频 ${(total / 1024 / 1024).toFixed(1)} MB` +
    ` + 封面 ${(covers / 1024 / 1024).toFixed(1)} MB = ${((total + covers) / 1024 / 1024).toFixed(1)} MB`
);
if (failed.length) process.exitCode = 1;
