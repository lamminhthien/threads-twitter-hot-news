const DATA_URL = "./data/news.json";

const el = {
  updated: document.querySelector("#updated"),
  digest: document.querySelector("#digest"),
  digestText: document.querySelector("#digest-text"),
  filters: document.querySelector("#filters"),
  grid: document.querySelector("#grid"),
  count: document.querySelector("#count"),
  template: document.querySelector("#card-template"),
};

let items = [];
let activeTopic = "all";

const formatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return formatter.format(new Date(then));
}

const compact = new Intl.NumberFormat("vi-VN", { notation: "compact" });

const THREADS_HOSTS = new Set([
  "threads.net",
  "www.threads.net",
  "threads.com",
  "www.threads.com",
]);

// Trả về { href, label } cho nút mở bài. Link mẫu/không hợp lệ (vd. .../post/sample-1)
// sẽ được thay bằng trang tìm kiếm Threads theo từ khóa của bài để không dẫn tới 404.
function postLink(item) {
  const raw = typeof item.permalink === "string" ? item.permalink.trim() : "";

  try {
    const url = new URL(raw);
    const isPost =
      /^https?:$/.test(url.protocol) &&
      THREADS_HOSTS.has(url.hostname) &&
      /^\/@[^/]+\/post\/[^/]+/.test(url.pathname) &&
      !/\/post\/sample-/i.test(url.pathname);
    if (isPost) return { href: url.href, label: "Xem trên Threads →" };
  } catch {
    // permalink rỗng hoặc không phải URL
  }

  if (item.keyword) {
    return {
      href: `https://www.threads.net/search?q=${encodeURIComponent(item.keyword)}`,
      label: "Tìm bài tương tự trên Threads →",
    };
  }

  return null;
}

function statsLine(item) {
  const parts = [];
  if (item.keyword) parts.push(`#${item.keyword}`);
  if (Number.isFinite(item.likes)) parts.push(`${compact.format(item.likes)} thích`);
  if (Number.isFinite(item.replies)) parts.push(`${compact.format(item.replies)} trả lời`);
  return parts.join(" · ");
}

function renderFilters(topics) {
  if (!topics.length) {
    el.filters.hidden = true;
    return;
  }

  const make = (label, value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = label;
    button.dataset.topic = value;
    button.setAttribute("aria-pressed", String(value === activeTopic));
    button.addEventListener("click", () => {
      activeTopic = value;
      for (const chip of el.filters.querySelectorAll(".chip")) {
        chip.setAttribute("aria-pressed", String(chip.dataset.topic === value));
      }
      renderCards();
    });
    return button;
  };

  el.filters.replaceChildren(make("Tất cả", "all"), ...topics.map((t) => make(t, t)));
  el.filters.hidden = false;
}

function renderCards() {
  const visible =
    activeTopic === "all" ? items : items.filter((item) => item.topic === activeTopic);

  el.count.textContent = `(${visible.length})`;

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Chưa có bài nào cho chủ đề này.";
    el.grid.replaceChildren(empty);
    return;
  }

  const cards = visible.map((item) => {
    const node = el.template.content.firstElementChild.cloneNode(true);
    const author = String(item.author || "threads").replace(/^@/, "");

    node.querySelector(".avatar").textContent = author.charAt(0).toUpperCase();
    node.querySelector(".author").textContent = `@${author}`;
    node.querySelector(".text").textContent = item.text || "";
    node.querySelector(".stats").textContent = statsLine(item);

    const time = node.querySelector(".time");
    time.dateTime = item.timestamp || "";
    time.title = item.timestamp ? formatter.format(new Date(item.timestamp)) : "";
    time.textContent = timeAgo(item.timestamp);

    const topic = node.querySelector(".topic");
    if (item.topic) topic.textContent = item.topic;
    else topic.remove();

    const link = node.querySelector(".link");
    const post = postLink(item);
    if (post) {
      link.href = post.href;
      link.textContent = post.label;
    } else {
      link.remove();
    }

    return node;
  });

  el.grid.replaceChildren(...cards);
}

async function init() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    items = Array.isArray(data.items) ? data.items : [];

    const generated = data.generated_at ? new Date(data.generated_at) : null;
    el.updated.textContent =
      generated && !Number.isNaN(generated.getTime())
        ? `Cập nhật ${timeAgo(data.generated_at)}`
        : "";

    if (data.digest) {
      el.digestText.textContent = data.digest;
      el.digest.hidden = false;
    }

    const topics = [...new Set(items.map((item) => item.topic).filter(Boolean))];
    renderFilters(topics);
    renderCards();
  } catch (error) {
    el.updated.textContent = "Không tải được dữ liệu";
    const box = document.createElement("p");
    box.className = "empty";
    box.textContent = `Không đọc được data/news.json (${error.message}).`;
    el.grid.replaceChildren(box);
  }
}

init();
