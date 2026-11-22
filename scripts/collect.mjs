#!/usr/bin/env node
// Thu thập bài viết nổi bật từ Threads API và ghi ra data/news.json.
//
// Env:
//   THREADS_TOKEN        (bắt buộc) long-lived access token
//   THREADS_KEYWORDS     danh sách từ khóa, cách nhau bằng dấu phẩy (mặc định "AI,React,Cloud")
//   MAX_PER_KEYWORD      số bài tối đa mỗi từ khóa (mặc định 3)
//   THREADS_GRAPH_URL    override base URL (dùng để test local)
//
// Chạy: THREADS_TOKEN=... node scripts/collect.mjs

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const NEWS_PATH = path.join(DATA_DIR, "news.json");
const SEEN_PATH = path.join(DATA_DIR, "seen.json");

const GRAPH_URL = (process.env.THREADS_GRAPH_URL || "https://graph.threads.com").replace(/\/$/, "");
const TOKEN = process.env.THREADS_TOKEN;
const KEYWORDS = (process.env.THREADS_KEYWORDS || "AI,React,Cloud")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const MAX_PER_KEYWORD = Number(process.env.MAX_PER_KEYWORD || 3);
const SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FIELDS = "id,text,permalink,timestamp,username";

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function saveJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function searchKeyword(keyword) {
  const url = new URL(`${GRAPH_URL}/v1.0/keyword_search`);
  url.searchParams.set("q", keyword);
  url.searchParams.set("search_type", "TOP");
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("limit", String(MAX_PER_KEYWORD));
  url.searchParams.set("access_token", TOKEN);

  const response = await fetch(url, { headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.error?.message || body?.error_message || response.statusText;
    throw new Error(`keyword_search "${keyword}" lỗi ${response.status}: ${detail}`);
  }

  return Array.isArray(body?.data) ? body.data : [];
}

function toItem(post, topic) {
  return {
    id: String(post.id),
    topic,
    author: post.username || "threads",
    text: post.text || "",
    permalink: post.permalink || "",
    timestamp: post.timestamp || new Date().toISOString(),
  };
}

function buildDigest(items) {
  if (!items.length) return "";

  const byTopic = new Map();
  for (const item of items) byTopic.set(item.topic, (byTopic.get(item.topic) || 0) + 1);

  const spread = [...byTopic.entries()]
    .map(([topic, count]) => `${count} bài về ${topic}`)
    .join(", ");

  const lead = items[0];
  const excerpt = lead.text.length > 180 ? `${lead.text.slice(0, 177).trimEnd()}…` : lead.text;

  return `Hôm nay có ${items.length} bài nổi bật (${spread}). Đáng chú ý nhất: “${excerpt}” — @${lead.author}.`;
}

async function main() {
  if (!TOKEN) fail("Thiếu THREADS_TOKEN. Tạo token từ Meta for Developers rồi export lại.");
  if (!Number.isFinite(MAX_PER_KEYWORD) || MAX_PER_KEYWORD < 1) fail("MAX_PER_KEYWORD phải là số >= 1.");
  if (!KEYWORDS.length) fail("THREADS_KEYWORDS rỗng.");

  console.log(`→ Tìm ${KEYWORDS.length} từ khóa: ${KEYWORDS.join(", ")}`);

  const results = await Promise.allSettled(KEYWORDS.map((keyword) => searchKeyword(keyword)));

  const seenData = await readJson(SEEN_PATH, {});
  const now = Date.now();
  const seen = {};
  for (const [id, timestamp] of Object.entries(seenData)) {
    const at = Date.parse(timestamp);
    if (Number.isFinite(at) && now - at < SEEN_TTL_MS) seen[id] = timestamp;
  }

  const collected = [];
  let skipped = 0;

  results.forEach((result, index) => {
    const keyword = KEYWORDS[index];
    if (result.status === "rejected") {
      console.warn(`! ${result.reason.message}`);
      return;
    }
    for (const post of result.value.slice(0, MAX_PER_KEYWORD)) {
      const item = toItem(post, keyword);
      if (!item.id || seen[item.id] || collected.some((existing) => existing.id === item.id)) {
        skipped += 1;
        continue;
      }
      collected.push(item);
      seen[item.id] = new Date().toISOString();
    }
  });

  if (!collected.length) {
    console.log("• Không có bài mới nào, giữ nguyên data/news.json.");
    await saveJson(SEEN_PATH, seen);
    return;
  }

  const items = collected
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .map(({ id, topic, author, text, permalink, timestamp }) => ({
      id,
      topic,
      author,
      text,
      permalink,
      timestamp,
    }));

  await saveJson(NEWS_PATH, {
    generated_at: new Date().toISOString(),
    source: "threads",
    keywords: KEYWORDS,
    digest: buildDigest(items),
    items,
  });
  await saveJson(SEEN_PATH, seen);

  console.log(`✔ Ghi ${items.length} bài mới (bỏ qua ${skipped} bài trùng) vào data/news.json`);
}

main().catch((error) => fail(error.message));
