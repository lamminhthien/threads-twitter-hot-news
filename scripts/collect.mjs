#!/usr/bin/env node
// Thu thập bài viết nổi bật từ Threads API theo nhiều chủ đề và ghi ra data/news.json.
//
// Env:
//   THREADS_TOKEN        (bắt buộc) long-lived access token
//   THREADS_KEYWORDS     tuỳ chọn: danh sách từ khóa tự do, cách nhau bằng dấu phẩy.
//                        Nếu có, mỗi từ khóa trở thành một chủ đề riêng (bỏ qua danh sách mặc định).
//   MAX_PER_TOPIC        số bài tối đa mỗi chủ đề (mặc định 2)
//   MAX_ITEMS            tổng số bài tối đa trong bản tin (mặc định 30)
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
const MAX_PER_TOPIC = Number(process.env.MAX_PER_TOPIC || process.env.MAX_PER_KEYWORD || 2);
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 30);
const SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FIELDS = "id,text,permalink,timestamp,username";

// Bản tin phủ nhiều chủ đề, không chỉ công nghệ. Mỗi chủ đề có một vài từ khóa
// để kết quả phong phú hơn, nhưng khi hiển thị chỉ gom theo nhãn chủ đề.
const DEFAULT_TOPICS = [
  { topic: "Thời sự", keywords: ["tin nóng", "thời sự"] },
  { topic: "Kinh tế", keywords: ["kinh tế", "chứng khoán"] },
  { topic: "Thể thao", keywords: ["bóng đá", "thể thao"] },
  { topic: "Giải trí", keywords: ["showbiz", "phim ảnh"] },
  { topic: "Công nghệ", keywords: ["công nghệ", "AI"] },
  { topic: "Sức khỏe", keywords: ["sức khỏe", "dinh dưỡng"] },
  { topic: "Giáo dục", keywords: ["giáo dục", "tuyển sinh"] },
  { topic: "Đời sống", keywords: ["đời sống", "tâm sự"] },
  { topic: "Du lịch", keywords: ["du lịch", "check-in"] },
  { topic: "Ẩm thực", keywords: ["ẩm thực", "quán ngon"] },
  { topic: "Bất động sản", keywords: ["bất động sản", "nhà đất"] },
  { topic: "Xe", keywords: ["ô tô", "xe máy"] },
  { topic: "Game", keywords: ["game", "esports"] },
  { topic: "Âm nhạc", keywords: ["âm nhạc", "ca sĩ"] },
  { topic: "Việc làm", keywords: ["việc làm", "tuyển dụng"] },
  { topic: "Pháp luật", keywords: ["pháp luật", "giao thông"] },
];

const CUSTOM_KEYWORDS = (process.env.THREADS_KEYWORDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const TOPICS = CUSTOM_KEYWORDS.length
  ? CUSTOM_KEYWORDS.map((keyword) => ({ topic: keyword, keywords: [keyword] }))
  : DEFAULT_TOPICS;

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
  url.searchParams.set("limit", String(Math.max(MAX_PER_TOPIC, 5)));
  url.searchParams.set("access_token", TOKEN);

  const response = await fetch(url, { headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.error?.message || body?.error_message || response.statusText;
    throw new Error(`keyword_search "${keyword}" lỗi ${response.status}: ${detail}`);
  }

  return Array.isArray(body?.data) ? body.data : [];
}

function toItem(post, topic, keyword) {
  return {
    id: String(post.id),
    topic,
    keyword,
    author: post.username || "threads",
    text: post.text || "",
    permalink: post.permalink || "",
    timestamp: post.timestamp || new Date().toISOString(),
  };
}

// Chọn bài theo kiểu xoay vòng chủ đề để bản tin không bị một chủ đề chiếm hết.
function takeBalanced(byTopic, limit) {
  const queues = [...byTopic.values()].map((items) => items.slice());
  const picked = [];

  while (picked.length < limit && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const item = queue.shift();
      if (!item) continue;
      picked.push(item);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

function buildDigest(items) {
  if (!items.length) return "";

  const byTopic = new Map();
  for (const item of items) byTopic.set(item.topic, (byTopic.get(item.topic) || 0) + 1);

  const spread = [...byTopic.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, count]) => `${count} bài ${topic}`)
    .join(", ");

  const lead = items[0];
  const excerpt = lead.text.length > 180 ? `${lead.text.slice(0, 177).trimEnd()}…` : lead.text;

  return `Hôm nay có ${items.length} bài nổi bật trên ${byTopic.size} chủ đề (${spread}). Đáng chú ý nhất: “${excerpt}” — @${lead.author}.`;
}

async function main() {
  if (!TOKEN) fail("Thiếu THREADS_TOKEN. Tạo token từ Meta for Developers rồi export lại.");
  if (!Number.isFinite(MAX_PER_TOPIC) || MAX_PER_TOPIC < 1) fail("MAX_PER_TOPIC phải là số >= 1.");
  if (!Number.isFinite(MAX_ITEMS) || MAX_ITEMS < 1) fail("MAX_ITEMS phải là số >= 1.");
  if (!TOPICS.length) fail("Danh sách chủ đề rỗng.");

  const queries = [];
  for (const { topic, keywords } of TOPICS) {
    for (const keyword of keywords) queries.push({ topic, keyword });
  }

  console.log(`→ ${TOPICS.length} chủ đề, ${queries.length} từ khóa, tối đa ${MAX_ITEMS} bài`);

  const results = await Promise.allSettled(queries.map(({ keyword }) => searchKeyword(keyword)));

  const seenData = await readJson(SEEN_PATH, {});
  const now = Date.now();
  const seen = {};
  for (const [id, timestamp] of Object.entries(seenData)) {
    const at = Date.parse(timestamp);
    if (Number.isFinite(at) && now - at < SEEN_TTL_MS) seen[id] = timestamp;
  }

  const byTopic = new Map(TOPICS.map(({ topic }) => [topic, []]));
  const collectedIds = new Set();
  let skipped = 0;

  results.forEach((result, index) => {
    const { topic, keyword } = queries[index];
    if (result.status === "rejected") {
      console.warn(`! ${result.reason.message}`);
      return;
    }
    for (const post of result.value) {
      const item = toItem(post, topic, keyword);
      if (!item.id || seen[item.id] || collectedIds.has(item.id)) {
        skipped += 1;
        continue;
      }
      collectedIds.add(item.id);
      byTopic.get(topic).push(item);
    }
  });

  for (const [topic, items] of byTopic) {
    items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    byTopic.set(topic, items.slice(0, MAX_PER_TOPIC));
  }

  const items = takeBalanced(byTopic, MAX_ITEMS).sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );

  if (!items.length) {
    console.log("• Không có bài mới nào, giữ nguyên data/news.json.");
    await saveJson(SEEN_PATH, seen);
    return;
  }

  for (const item of items) seen[item.id] = new Date().toISOString();

  await saveJson(NEWS_PATH, {
    generated_at: new Date().toISOString(),
    source: "threads",
    topics: [...new Set(items.map((item) => item.topic))],
    keywords: [...new Set(items.map((item) => item.keyword).filter(Boolean))],
    digest: buildDigest(items),
    items,
  });
  await saveJson(SEEN_PATH, seen);

  console.log(
    `✔ Ghi ${items.length} bài thuộc ${new Set(items.map((item) => item.topic)).size} chủ đề (bỏ qua ${skipped} bài trùng) vào data/news.json`,
  );
}

main().catch((error) => fail(error.message));
