// ==UserScript==
// @name         Booth Item Searcher
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Auto-search Booth.pm items on an external forum and display results in a floating panel
// @author       ripper007
// @license      MIT
// @updateURL    https://github.com/ripple007/Booth-Item-Searcher/raw/refs/heads/main/booth-item-searcher.user.js
// @downloadURL  https://github.com/ripple007/Booth-Item-Searcher/raw/refs/heads/main/booth-item-searcher.user.js
// @match        *://booth.pm/*
// @match        *://*.booth.pm/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      forum.ripper.store
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const API_URL = "https://forum.ripper.store/api/search?term={query}&in=posts&matchWords=any&by=&categories=&searchChildren=false&hasTags=&replies=&repliesFilter=atleast&timeFilter=newer&timeRange=&sortBy=relevance&sortDirection=desc&showAs=topics";
  const SITE_URL = "https://forum.ripper.store";

  const STRINGS = {
    ja: {
      title: "Booth Searcher",
      minimize: "最小化",
      unknown: "不明",
      search: "検索",
      placeholder: "検索ワード...",
      searching: "検索中...",
      noResult: "結果なし（0件）",
      hits: "件ヒット",
      solved: "✓ 解決",
      unsolved: "未解決",
      untitled: "無題",
      errParse: "レスポンスの解析に失敗しました",
      errNetwork: "通信エラーが発生しました",
      errTimeout: "タイムアウトしました",
    },
    en: {
      title: "Booth Searcher",
      minimize: "Minimize",
      unknown: "Unknown",
      search: "Search",
      placeholder: "Search query...",
      searching: "Searching...",
      noResult: "No results (0)",
      hits: " hits",
      solved: "✓ Solved",
      unsolved: "Open",
      untitled: "Untitled",
      errParse: "Failed to parse response",
      errNetwork: "Network error",
      errTimeout: "Request timed out",
    },
    ko: {
      title: "Booth Searcher",
      minimize: "최소화",
      unknown: "알 수 없음",
      search: "검색",
      placeholder: "검색어...",
      searching: "검색 중...",
      noResult: "결과 없음 (0건)",
      hits: "건 발견",
      solved: "✓ 해결",
      unsolved: "미해결",
      untitled: "제목 없음",
      errParse: "응답 분석에 실패했습니다",
      errNetwork: "통신 오류가 발생했습니다",
      errTimeout: "시간 초과되었습니다",
    },
  };

  function detectLang() {
    const saved = getCookie("bs-lang");
    if (saved && STRINGS[saved]) return saved;
    const nav = (navigator.language || "en").toLowerCase();
    if (nav.startsWith("ja")) return "ja";
    if (nav.startsWith("ko")) return "ko";
    return "en";
  }

  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function setCookie(name, value) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; domain=.booth.pm; path=/; max-age=31536000; SameSite=Lax";
  }

  let currentLang = detectLang();
  function t(key) { return (STRINGS[currentLang] || STRINGS.en)[key] || key; }

  GM_registerMenuCommand("🌐 言語 / Language / 언어", () => {
    const input = prompt("ja = 日本語\nen = English\nko = 한국어", currentLang);
    if (input !== null && STRINGS[input.trim()]) {
      setCookie("bs-lang", input.trim());
      alert("OK! Please reload.");
    }
  });

  function getItemId() {
    const m = window.location.pathname.match(/items\/(\d+)/);
    return m ? m[1] : "";
  }

  function getItemName() {
    let name = document.title.replace(/\s*[-–|].*?BOOTH.*$/i, "").trim();
    if (!name) {
      const el = document.querySelector("h1.u-tpg-title1") || document.querySelector("h1");
      name = el ? el.textContent.trim() : "";
    }
    return name;
  }

  function doSearch(query, callback) {
    const url = API_URL.replace("{query}", encodeURIComponent(query));
    GM_xmlhttpRequest({
      method: "GET",
      url: url,
      responseType: "json",
      onload: (res) => {
        try {
          const data = typeof res.response === "string" ? JSON.parse(res.response) : res.response;
          callback(null, data);
        } catch (e) {
          callback(t("errParse"));
        }
      },
      onerror: () => callback(t("errNetwork")),
      ontimeout: () => callback(t("errTimeout")),
    });
  }

  function renderResults(data) {
    const posts = data.posts || [];
    const count = data.matchCount || 0;

    if (count === 0 || posts.length === 0) {
      return `<div class="bs-no-result">${t("noResult")}</div>`;
    }

    const dateLang = currentLang === "ko" ? "ko-KR" : currentLang === "en" ? "en-US" : "ja-JP";
    let html = `<div class="bs-result-count">${count} ${t("hits")}</div><div class="bs-results">`;

    for (const post of posts) {
      const topic = post.topic || {};
      const category = post.category || {};
      const user = post.user || {};
      const title = decodeHtml(topic.titleRaw || topic.title || t("untitled"));
      const topicUrl = `${SITE_URL}/topic/${topic.slug || topic.tid}`;
      const catName = decodeHtml(category.name || "");
      const isSolved = topic.isSolved === 1;
      const postCount = topic.postcount || 0;
      const date = post.timestampISO ? new Date(post.timestampISO).toLocaleDateString(dateLang) : "";
      const tags = (topic.tags || []).map((tag) => decodeHtml(tag.value));

      html += `
        <a class="bs-result-item" href="${topicUrl}" target="_blank" rel="noopener">
          <div class="bs-result-header">
            ${isSolved ? `<span class="bs-badge bs-solved">${t("solved")}</span>` : `<span class="bs-badge bs-open">${t("unsolved")}</span>`}
            <span class="bs-cat" style="background:${category.bgColor || '#555'};color:${category.color || '#fff'}">${escapeHtml(catName)}</span>
          </div>
          <div class="bs-result-title">${escapeHtml(title)}</div>
          <div class="bs-result-meta">
            <span>${escapeHtml(decodeHtml(user.displayname || user.username || "?"))}</span>
            <span>${date}</span>
            <span>💬 ${postCount}</span>
          </div>
          ${tags.length ? `<div class="bs-tags">${tags.map((tag) => `<span class="bs-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        </a>`;
    }

    html += `</div>`;
    return html;
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function decodeHtml(str) {
    const d = document.createElement("textarea");
    d.innerHTML = str;
    return d.value;
  }

  function injectUI() {
    if (document.getElementById("bs-panel")) return;
    const itemId = getItemId();
    const itemName = getItemName();
    if (!itemId) return;

    const panel = document.createElement("div");
    panel.id = "bs-panel";
    panel.innerHTML = `
      <div id="bs-header">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span>${t("title")}</span>
        <button id="bs-minimize" title="${t("minimize")}">─</button>
      </div>
      <div id="bs-body">
        <div id="bs-item-name" title="${escapeHtml(itemName)}">${escapeHtml(itemName) || t("unknown")}</div>
        <div id="bs-item-id">ID: ${itemId}</div>
        <div id="bs-search-bar">
          <input id="bs-custom-query" type="text" value="${itemId}" placeholder="${t("placeholder")}" />
          <button id="bs-search-go">${t("search")}</button>
        </div>
        <div id="bs-output"></div>
      </div>
    `;
    document.body.appendChild(panel);
    addStyles();

    const output = panel.querySelector("#bs-output");
    const input = panel.querySelector("#bs-custom-query");

    function search(query) {
      if (!query) return;
      input.value = query;
      output.innerHTML = `<div class="bs-loading"><div class="bs-spinner"></div>${t("searching")}</div>`;
      doSearch(query, (err, data) => {
        if (err) {
          output.innerHTML = `<div class="bs-error">⚠ ${err}</div>`;
        } else {
          output.innerHTML = renderResults(data);
        }
      });
    }

    panel.querySelector("#bs-search-go").addEventListener("click", () => search(input.value.trim()));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") search(input.value.trim()); });

    const body = panel.querySelector("#bs-body");
    panel.querySelector("#bs-minimize").addEventListener("click", (e) => {
      e.stopPropagation();
      const hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
      e.target.textContent = hidden ? "─" : "＋";
    });

    makeDraggable(panel, panel.querySelector("#bs-header"));

    search(itemId);
  }

  function makeDraggable(el, handle) {
    let ox, oy, dragging = false;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.id === "bs-minimize") return;
      dragging = true;
      ox = e.clientX - el.getBoundingClientRect().left;
      oy = e.clientY - el.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.left = (e.clientX - ox) + "px";
      el.style.top = (e.clientY - oy) + "px";
    });
    document.addEventListener("mouseup", () => { dragging = false; });
  }

  function addStyles() {
    if (document.getElementById("bs-styles")) return;
    const s = document.createElement("style");
    s.id = "bs-styles";
    s.textContent = `
      #bs-panel {
        position: fixed; bottom: 20px; right: 20px; z-index: 999999;
        width: 320px; max-height: 80vh;
        background: #1a1a2e; border: 1px solid #333; border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,.5);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #e0e0e0; display: flex; flex-direction: column; overflow: hidden;
      }
      #bs-header {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 14px; background: #16213e;
        cursor: grab; user-select: none;
        border-bottom: 1px solid #333;
        font-size: 13px; font-weight: 600; color: #fff;
        flex-shrink: 0;
      }
      #bs-minimize {
        margin-left: auto; background: none; border: none;
        color: #888; font-size: 14px; cursor: pointer; padding: 0 4px;
      }
      #bs-minimize:hover { color: #fff; }
      #bs-body { padding: 12px 14px; overflow-y: auto; flex: 1; }
      #bs-item-name {
        font-size: 13px; font-weight: 500; color: #fff;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        margin-bottom: 2px;
      }
      #bs-item-id { font-size: 11px; color: #888; margin-bottom: 10px; }
      #bs-search-bar { display: flex; gap: 6px; margin-bottom: 10px; }
      #bs-custom-query {
        flex: 1; padding: 7px 10px; border-radius: 6px;
        border: 1px solid #444; background: #2a2a4a; color: #fff;
        font-size: 12px; outline: none;
      }
      #bs-custom-query:focus { border-color: #7c83ff; }
      #bs-search-go {
        padding: 7px 12px; border: none; border-radius: 6px;
        background: #7c83ff; color: #fff; font-size: 12px;
        cursor: pointer; font-weight: 600; white-space: nowrap;
      }
      #bs-search-go:hover { background: #6a71e6; }
      #bs-output { min-height: 40px; }
      .bs-loading {
        display: flex; align-items: center; gap: 8px;
        color: #888; font-size: 12px; padding: 12px 0; justify-content: center;
      }
      .bs-spinner {
        width: 16px; height: 16px; border: 2px solid #444;
        border-top-color: #7c83ff; border-radius: 50%;
        animation: bs-spin .6s linear infinite;
      }
      @keyframes bs-spin { to { transform: rotate(360deg); } }
      .bs-error { color: #ff6b6b; font-size: 12px; padding: 8px 0; text-align: center; }
      .bs-no-result { color: #888; font-size: 12px; padding: 12px 0; text-align: center; }
      .bs-result-count {
        font-size: 11px; color: #7c83ff; font-weight: 600;
        margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #262640;
      }
      .bs-results { display: flex; flex-direction: column; gap: 8px; }
      .bs-result-item {
        display: block; padding: 10px 12px; background: #222244;
        border-radius: 8px; text-decoration: none; color: inherit;
        border: 1px solid transparent; transition: all .15s;
      }
      .bs-result-item:hover { border-color: #7c83ff; background: #2a2a55; }
      .bs-result-header { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
      .bs-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
      .bs-solved { background: #2e7d32; color: #c8e6c9; }
      .bs-open { background: #555; color: #ccc; }
      .bs-cat { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 500; }
      .bs-result-title {
        font-size: 13px; font-weight: 500; color: #fff;
        margin-bottom: 4px; line-height: 1.4;
      }
      .bs-result-meta { display: flex; gap: 10px; font-size: 11px; color: #888; }
      .bs-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .bs-tag {
        font-size: 10px; padding: 1px 6px; border-radius: 4px;
        background: #333355; color: #aab;
      }
    `;
    document.head.appendChild(s);
  }

  setTimeout(injectUI, 1200);
})();
