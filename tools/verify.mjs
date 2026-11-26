#!/usr/bin/env node
/**
 * 上线前自检：数据完整性、切片是否都在、体积与单文件是否超 GitHub 限制。
 *
 *   node tools/verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const data = JSON.parse(fs.readFileSync(path.join(SITE, 'data/works.json'), 'utf8'));

const problems = [];
const warns = [];
const LIMIT_FILE = 100 * 1024 * 1024; // GitHub 单文件 100 MB
const LIMIT_SITE = 1024 * 1024 * 1024; // Pages 约 1 GB

const exists = (rel) => fs.existsSync(path.join(SITE, rel));
const size = (rel) => fs.statSync(path.join(SITE, rel)).size;

let mediaBytes = 0;
let segCount = 0;

for (const w of data.works) {
  const tag = `${w.num} ${w.title}`;
  if (!w.hls) { problems.push(`${tag}：没有 hls 播放列表`); continue; }
  if (!exists(w.hls)) { problems.push(`${tag}：${w.hls} 不存在`); continue; }
  if (!w.cover || !exists(w.cover)) problems.push(`${tag}：封面缺失`);
  if (!w.coverSm || !exists(w.coverSm)) problems.push(`${tag}：小封面缺失`);
  if (!w.durationText) problems.push(`${tag}：没有时长`);

  const playlist = fs.readFileSync(path.join(SITE, w.hls), 'utf8');
  if (!/#EXT-X-ENDLIST/.test(playlist)) problems.push(`${tag}：播放列表不是 VOD（缺 #EXT-X-ENDLIST）`);
  const segs = [...playlist.matchAll(/^(seg_\d+\.ts)$/gm)].map((m) => m[1]);
  if (!segs.length) { problems.push(`${tag}：播放列表里没有切片`); continue; }

  const dir = path.dirname(path.join(SITE, w.hls));
  let bytes = 0;
  for (const s of segs) {
    const p = path.join(dir, s);
    if (!fs.existsSync(p)) { problems.push(`${tag}：切片缺失 ${s}`); continue; }
    const st = fs.statSync(p);
    bytes += st.size;
    if (st.size > LIMIT_FILE) problems.push(`${tag}：单片 ${s} 超过 100 MB`);
  }
  mediaBytes += bytes;
  segCount += segs.length;

  if (w.segments && w.segments !== segs.length) {
    warns.push(`${tag}：登记 ${w.segments} 段，播放列表实际 ${segs.length} 段`);
  }
  // 播放列表里的总时长 ≈ 登记时长
  const total = [...playlist.matchAll(/#EXTINF:([\d.]+)/g)]
    .reduce((a, m) => a + Number(m[1]), 0);
  if (Math.abs(total - w.duration) > 2) {
    warns.push(`${tag}：切片总时长 ${total.toFixed(1)}s，登记 ${w.duration}s`);
  }
  if (!w.summary || w.summary.length < 10) problems.push(`${tag}：简介过短`);
  if (w.stanzaCount && !w.lyrics.length) problems.push(`${tag}：歌词结构异常`);
  if (!w.stanzaCount && !w.lyricsNote) problems.push(`${tag}：无词作品缺 lyricsNote`);
  for (const c of w.credits || []) {
    if (!c.k || !c.v) problems.push(`${tag}：制作信息有空项`);
  }
}

if (!exists('index.html')) problems.push('site/index.html 不存在');
if (!exists('assets/app.js')) problems.push('site/assets/app.js 不存在');
if (!exists('assets/style.css')) problems.push('site/assets/style.css 不存在');
if (!exists('assets/vendor/hls.min.js')) problems.push('hls.min.js 缺失（HLS 就放不了了）');
if (!exists('media/favicon.svg')) warns.push('favicon 缺失');

const covers = fs.existsSync(path.join(SITE, 'media/covers'))
  ? fs.readdirSync(path.join(SITE, 'media/covers')).reduce((a, f) => a + fs.statSync(path.join(SITE, 'media/covers', f)).size, 0)
  : 0;
const totalBytes = mediaBytes + covers;
if (totalBytes > LIMIT_SITE) problems.push(`站点体积 ${(totalBytes / 1024 / 1024).toFixed(0)} MB 超过 Pages 约 1 GB`);

const biggest = data.works
  .map((w) => ({ id: w.id, mb: (w.bytes || 0) / 1024 / 1024 }))
  .sort((a, b) => b.mb - a.mb)[0];

console.log(`作品        ${data.works.length} 部（${data.stats.lyricsWorks} 部有词 / ${data.stats.stanzas} 段 / ${data.stats.lines} 行）`);
console.log(`切片        ${segCount} 段 · ${(mediaBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`封面        ${covers ? (covers / 1024 / 1024).toFixed(1) + ' MB' : '缺失'}`);
console.log(`站点合计    ${(totalBytes / 1024 / 1024).toFixed(1)} MB（Pages 上限约 1 GB）`);
console.log(`最大一部    ${biggest ? biggest.id + ' · ' + biggest.mb.toFixed(1) + ' MB' : '—'}`);
console.log(`总时长      ${data.stats.durationText}`);

for (const w of warns) console.log('  警告：' + w);
if (problems.length) {
  console.log('');
  for (const p of problems) console.error('  × ' + p);
  process.exit(1);
}
console.log('\n✓ 全部通过');
