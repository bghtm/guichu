#!/usr/bin/env node
/**
 * 合并 content/works.json（文案、歌词）与 data/media.json（切片、封面、时长）
 * → site/data/works.json（前端唯一数据源）
 *
 *   node tools/build-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const content = readJSON(path.join(ROOT, 'content/works.json'));
const mediaPath = path.join(ROOT, 'data/media.json');
const media = fs.existsSync(mediaPath) ? readJSON(mediaPath) : {};

const errors = [];
const warnings = [];

const seriesIds = new Set(content.site.series.map((s) => s.id));
const seen = new Set();
let stanzas = 0;
let lines = 0;
let lyricsWorks = 0;
let seconds = 0;
let bytes = 0;

const works = content.works.map((w, i) => {
  if (seen.has(w.id)) errors.push(`作品 id 重复：${w.id}`);
  seen.add(w.id);
  if (!seriesIds.has(w.series)) errors.push(`${w.id} 的 series 不存在：${w.series}`);
  if (w.num !== String(i + 1).padStart(2, '0')) {
    warnings.push(`${w.id} 的编号是 ${w.num}，按顺序应为 ${String(i + 1).padStart(2, '0')}`);
  }

  const m = media[w.id];
  if (!m) warnings.push(`${w.id} 还没有切片产物（先跑 tools/prepare-media.mjs）`);

  const lyr = Array.isArray(w.lyrics) ? w.lyrics : [];
  const hasLyrics = lyr.length > 0;
  if (hasLyrics) lyricsWorks++;
  for (const st of lyr) {
    stanzas++;
    lines += st.lines.length;
  }

  const out = {
    ...w,
    // 媒体信息（缺失时给空值，前端会显示"待补"）
    durationText: m?.durationText || '',
    duration: m?.duration || 0,
    width: m?.width || 0,
    height: m?.height || 0,
    bytes: m?.bytes || 0,
    segments: m?.segments || 0,
    hls: m?.hls || '',
    cover: m?.cover || '',
    coverSm: m?.coverSm || '',
    stanzaCount: lyr.length,
    lineCount: lyr.reduce((a, s) => a + s.lines.length, 0)
  };
  if (m) {
    seconds += m.duration;
    bytes += m.bytes;
  }
  return out;
});

const clock = (s) => {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const r = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};

const data = {
  ...content,
  series: content.site.series,
  works,
  stats: {
    works: works.length,
    series: content.site.series.length,
    lyricsWorks,
    stanzas,
    lines,
    duration: Math.round(seconds * 10) / 10,
    durationText: clock(seconds),
    bytes,
    sizeText: (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }
};

const outPath = path.join(ROOT, 'site/data/works.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');

console.log(
  `✓ site/data/works.json · ${works.length} 部作品 · ${data.stats.lyricsWorks} 部有词` +
    `（${stanzas} 段 / ${lines} 行）· 总时长 ${data.stats.durationText} · ${data.stats.sizeText}`
);
for (const w of warnings) console.log('  警告：' + w);
if (errors.length) {
  for (const e of errors) console.error('  × ' + e);
  process.exit(1);
}
