const DB_NAME = "mcu-tracker";
const DB_VERSION = 3;
const STORE = "progress";
const SETTINGS_STORE = "settings";
const SETTINGS_KEY = "ui";

const state = {
  type: ["movie", "show"],
  status: ["unwatched", "in-progress", "watched"],
  search: "",
  sort: "release",
  filtersOpen: false,
  progress: new Map(),
  expandedSeasons: new Set(),
  manualCompleted: new Set()
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(SETTINGS_STORE))
        db.createObjectStore(SETTINGS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllProgress() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly"),
      store = tx.objectStore(STORE),
      req = store.openCursor();
    const map = new Map();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(map);
        return;
      }
      const value = cursor.value;
      // v2 stored completed items as true. Preserve those as watched during migration.
      const status =
        value === true
          ? "watched"
          : typeof value === "object" && value
            ? value.status
            : value || "unwatched";
      if (status !== "unwatched") map.set(cursor.key, status);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

async function setProgress(key, status) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"),
      store = tx.objectStore(STORE);
    if (status === "unwatched") store.delete(key);
    else store.put(status, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function clearProgress() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getSettings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readonly");
    const req = tx.objectStore(SETTINGS_STORE).get(SETTINGS_KEY);
    req.onsuccess = () => resolve(req.result || {});
    req.onerror = () => reject(req.error);
  });
}
async function saveSettings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readwrite");
    tx.objectStore(SETTINGS_STORE).put(
      {
        type: state.type,
        status: state.status,
        sort: state.sort,
        filtersOpen: state.filtersOpen,
        manualCompleted: [...state.manualCompleted]
      },
      SETTINGS_KEY
    );
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function setFiltersToggle(open) {
  state.filtersOpen = open;
  const toggle = document.getElementById("filtersToggle");
  const panel = document.getElementById("filtersPanel");
  if (toggle) toggle.setAttribute("aria-expanded", String(open));
  if (panel) panel.classList.toggle("is-open", open);
  updateFilterUI();
}
function setupFiltersToggle() {
  const toggle = document.getElementById("filtersToggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    setFiltersToggle(!state.filtersOpen);
    saveSettings();
  });
}

function itemStatus(id) {
  return state.progress.get(id) || "unwatched";
}

function seasonEpisodeStates(item) {
  const count = Number(item.episodeCount || 0);
  const states = [];
  for (let i = 1; i <= count; i++)
    states.push(itemStatus(`${item.id}:ep:${i}`));
  return states;
}

function episodeSummary(item) {
  const states = seasonEpisodeStates(item);
  if (!states.length) return null;
  const watched = states.filter(s => s === "watched").length;
  const inProgress = states.filter(s => s === "in-progress").length;
  const tracked = states.filter(s => s !== "unwatched").length;
  return { count: states.length, watched, inProgress, tracked };
}

function derivedSeasonStatus(item) {
  const explicit = itemStatus(item.id);
  const summary = episodeSummary(item);
  if (!summary || summary.tracked === 0) return explicit;
  if (state.manualCompleted.has(item.id) && explicit === "watched")
    return "watched";
  if (summary.watched === summary.count) return "watched";
  return "in-progress";
}

function statusForDisplay(item) {
  return item.type === "show" ? derivedSeasonStatus(item) : itemStatus(item.id);
}

function filteredItems() {
  const filtered = MCU_ITEMS.filter(item => {
    const typeOK = state.type.includes(item.type);
    const itemState = statusForDisplay(item);
    const statusOK = state.status.includes(itemState);
    const q = state.search.trim().toLowerCase();
    const searchOK =
      !q ||
      `${item.title} ${item.year} ${item.phaseLabel || `phase ${item.phase}`} ${item.type}`
        .toLowerCase()
        .includes(q);
    return typeOK && statusOK && searchOK;
  });
  const key =
    state.sort === "story"
      ? "storyOrder"
      : state.sort === "phase"
        ? "phaseOrder"
        : "releaseDate";
  return filtered.sort((a, b) => {
    const av = a[key],
      bv = b[key];
    if (av < bv) return -1;
    if (av > bv) return 1;
    return a.order - b.order;
  });
}

function allSelected(group) {
  return group.length === 2
    ? state.type.length === 2
    : state.status.length === 3;
}
function updateFilterUI() {
  document
    .querySelectorAll(".filter")
    .forEach(b =>
      b.classList.toggle("active", state.type.includes(b.dataset.type))
    );
  document
    .querySelectorAll(".status-filter")
    .forEach(b =>
      b.classList.toggle("active", state.status.includes(b.dataset.status))
    );
  const typeAll = document.querySelector('.filter[data-type="all"]');
  const statusAll = document.querySelector('.status-filter[data-status="all"]');
  if (typeAll) typeAll.classList.toggle("active", state.type.length === 2);
  if (statusAll)
    statusAll.classList.toggle("active", state.status.length === 3);
  const typeEmpty = state.type.length === 0;
  const statusEmpty = state.status.length === 0;
  document
    .querySelector(".segmented.type-group")
    ?.classList.toggle("filter-empty", typeEmpty);
  document
    .querySelector(".segmented.status-group")
    ?.classList.toggle("filter-empty", statusEmpty);
  const toggle = document.getElementById("filtersToggle");
  const active = state.type.length !== 2 || state.status.length !== 3;
  const invalid = typeEmpty || statusEmpty;
  if (toggle) {
    toggle.classList.toggle("filters-active", active && !invalid);
    toggle.classList.toggle("filters-invalid", invalid && !state.filtersOpen);
  }
}

function statusIcon(status) {
  if (status === "watched") return "✓";
  if (status === "in-progress") return "◐";
  return "";
}
function statusLabel(status) {
  return status === "watched"
    ? "Watched"
    : status === "in-progress"
      ? "In progress"
      : "Unwatched";
}
function episodeTitle(item, index) {
  const titles = window.MCU_EPISODE_TITLES?.[item.id];
  return titles?.[index - 1] || `Episode ${index}`;
}
function nextEpisodeNumber(item) {
  const summary = episodeSummary(item);
  if (!summary) return null;
  for (let i = 1; i <= summary.count; i++) {
    if (itemStatus(`${item.id}:ep:${i}`) !== "watched") return i;
  }
  return null;
}

function escapeHTML(s) {
  return String(s).replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[c]
  );
}

function buildEpisodeRows(item) {
  const count = item.episodeCount || 0;
  let html = "";
  for (let i = 1; i <= count; i++) {
    const key = `${item.id}:ep:${i}`;
    const status = itemStatus(key);
    html += `<div class="episode-row ${status}">
      <button class="episode-status" type="button" data-episode-key="${key}" data-status="${status}" aria-label="${statusLabel(status)} ${episodeTitle(item, i)}" title="${statusLabel(status)} — click to change">
        <span>${statusIcon(status)}</span>
      </button>
      <span class="episode-number">${String(i).padStart(2, "0")}</span>
      <span class="episode-title">${escapeHTML(episodeTitle(item, i))}</span>
    </div>`;
  }
  return html;
}

function cycleStatus(current) {
  return current === "unwatched"
    ? "in-progress"
    : current === "in-progress"
      ? "watched"
      : "unwatched";
}

async function handleSeasonStatus(item, row) {
  const current = statusForDisplay(item);
  const next = cycleStatus(current);
  if (next === "watched") state.manualCompleted.add(item.id);
  else state.manualCompleted.delete(item.id);
  state.progress.set(item.id, next);
  await setProgress(item.id, next);
  await saveSettings();
  updateStats();
  render();
}

async function handleEpisodeStatus(item, episodeKey) {
  const current = itemStatus(episodeKey);
  const next = cycleStatus(current);
  // Once an episode is explicitly touched, episode-level tracking takes precedence over a prior manual season completion.
  state.manualCompleted.delete(item.id);
  if (itemStatus(item.id) === "watched") {
    state.progress.set(item.id, "in-progress");
    await setProgress(item.id, "in-progress");
  }
  if (next === "unwatched") state.progress.delete(episodeKey);
  else state.progress.set(episodeKey, next);

  await setProgress(episodeKey, next);

  // Episode activity automatically starts the season unless it has been manually completed.
  const explicit = state.progress.get(item.id);
  const episodeStates = seasonEpisodeStates(item);
  const allWatched =
    episodeStates.length > 0 && episodeStates.every(s => s === "watched");
  if (allWatched) {
    state.progress.set(item.id, "watched");
    await setProgress(item.id, "watched");
  } else if (
    explicit !== "watched" &&
    episodeStates.some(s => s !== "unwatched")
  ) {
    state.progress.set(item.id, "in-progress");
    await setProgress(item.id, "in-progress");
  }
  await saveSettings();
  updateStats();
  render();
}

function render() {
  const list = document.getElementById("list");
  const empty = document.getElementById("empty");
  const visible = filteredItems();
  list.innerHTML = "";
  visible.forEach(item => {
    const row = document.createElement("article");
    const status = statusForDisplay(item);
    row.dataset.itemId = item.id;
    row.className = `item status-${status}`;
    const summary = item.type === "show" ? episodeSummary(item) : null;
    const expanded = state.expandedSeasons.has(item.id);
    const hasEpisodes = item.type === "show" && item.episodeCount > 0;
    const episodeMeta =
      summary && summary.tracked > 0
        ? `${summary.watched} / ${summary.count} episodes tracked`
        : summary
          ? `${summary.count} episodes`
          : "";
    const continueMeta =
      summary && summary.tracked > 0 && status !== "watched"
        ? ` · Episode ${nextEpisodeNumber(item)} next`
        : "";

    row.innerHTML = `
      <div class="item-main">
        <div class="title-line">
          <div class="status-mark" aria-hidden="true">${statusIcon(status)}</div>
          <div class="title">${escapeHTML(item.title)}</div>
          <span class="badge ${item.type}">${item.type === "movie" ? "Movie" : "Show"}</span>
        </div>
        <div class="meta">
          <span>${item.year}</span>
          <span>${escapeHTML(item.phaseLabel || `Phase ${item.phase}`)}</span>
          <span class="${item.status === "Upcoming" ? "upcoming" : ""}">${item.status}</span>
          ${hasEpisodes && summary ? `<span class="episode-meta">${episodeMeta}${continueMeta}</span>` : ""}
        </div>
        ${
          hasEpisodes
            ? `<button class="episodes-toggle" type="button" aria-expanded="${expanded}" aria-controls="episodes-${item.id}"><span>Episodes</span><span class="episodes-chevron" aria-hidden="true">⌄</span></button>
        <div id="episodes-${item.id}" class="episodes-drawer ${expanded ? "is-open" : ""}">${buildEpisodeRows(item)}</div>`
            : ""
        }
      </div>
      <div class="item-action">
        <button class="status-button ${status}" type="button" aria-label="${statusLabel(status)} — click to change" title="${statusLabel(status)} — click to change"><span>${statusIcon(status)}</span></button>
      </div>`;

    row
      .querySelector(".status-button")
      .addEventListener("click", () => handleSeasonStatus(item, row));
    if (hasEpisodes) {
      row.querySelector(".episodes-toggle").addEventListener("click", () => {
        if (state.expandedSeasons.has(item.id))
          state.expandedSeasons.delete(item.id);
        else state.expandedSeasons.add(item.id);
        render();
      });
      row
        .querySelectorAll(".episode-status")
        .forEach(btn =>
          btn.addEventListener("click", () =>
            handleEpisodeStatus(item, btn.dataset.episodeKey)
          )
        );
    }
    list.appendChild(row);
  });
  empty.hidden = visible.length !== 0;
  const visibleCount = document.getElementById("visibleCount");
  if (visibleCount) visibleCount.textContent = String(visible.length);
}

function updateStats() {
  const total = MCU_ITEMS.length;
  const done = MCU_ITEMS.filter(
    item => statusForDisplay(item) === "watched"
  ).length;
  const inProgress = MCU_ITEMS.filter(
    item => statusForDisplay(item) === "in-progress"
  ).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("progressText").textContent = `${done} / ${total}`;
  document.getElementById("percentText").textContent = `${pct}%`;
  document.getElementById("remainingText").textContent =
    `${total - done} remaining`;
  document.getElementById("progressBar").style.width = pct + "%";
  const inProgressEl = document.getElementById("inProgressCount");
  if (inProgressEl)
    inProgressEl.textContent = inProgress
      ? `${inProgress} in progress`
      : "None in progress";
  renderContinueWatching();
}

function renderContinueWatching() {
  const items = MCU_ITEMS.filter(
    item => statusForDisplay(item) === "in-progress"
  );
  const countEl = document.getElementById("continueCount");
  const popover = document.getElementById("continuePopover");
  const button = document.getElementById("continueWatchingBtn");
  if (countEl) countEl.textContent = String(items.length);
  if (button) button.disabled = items.length === 0;
  if (!popover) return;
  popover.innerHTML = items.length
    ? items
        .map(item => {
          const summary = item.type === "show" ? episodeSummary(item) : null;
          const detail =
            summary && summary.tracked > 0
              ? `Episode ${nextEpisodeNumber(item)} of ${summary.count} next`
              : item.type === "show"
                ? "Season in progress"
                : "Movie in progress";
          return `<button class="continue-item" type="button" data-item-id="${item.id}"><span class="continue-status">◐</span><span><strong>${escapeHTML(item.title)}</strong><small>${detail}</small></span></button>`;
        })
        .join("")
    : `<div class="continue-empty">Nothing in progress yet.</div>`;
  popover
    .querySelectorAll(".continue-item")
    .forEach(btn =>
      btn.addEventListener("click", () => jumpToItem(btn.dataset.itemId))
    );
}

function jumpToItem(id) {
  const item = MCU_ITEMS.find(x => x.id === id);
  if (!item) return;
  state.type = ["movie", "show"];
  state.status = ["unwatched", "in-progress", "watched"];
  state.search = "";
  const s = document.getElementById("search"),
    d = document.getElementById("searchDesktop");
  if (s) s.value = "";
  if (d) d.value = "";
  updateFilterUI();
  render();
  const row = document.querySelector(`.item[data-item-id="${CSS.escape(id)}"]`);
  if (row) {
    if (
      item.type === "show" &&
      statusForDisplay(item) === "in-progress" &&
      episodeSummary(item)?.tracked
    )
      state.expandedSeasons.add(item.id);
    render();
    const target = document.querySelector(
      `.item[data-item-id="${CSS.escape(id)}"]`
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.classList.add("jump-highlight");
    setTimeout(() => target?.classList.remove("jump-highlight"), 1100);
  }
  document.getElementById("continuePopover")?.classList.remove("is-open");
}

function setupContinueWatching() {
  const btn = document.getElementById("continueWatchingBtn");
  const pop = document.getElementById("continuePopover");
  if (!btn || !pop) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    pop.classList.toggle("is-open");
  });
  document.addEventListener("click", e => {
    if (!btn.parentElement.contains(e.target)) pop.classList.remove("is-open");
  });
}

function bindSearch(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", e => {
    state.search = e.target.value;
    const other =
      id === "search"
        ? document.getElementById("searchDesktop")
        : document.getElementById("search");
    if (other && other.value !== state.search) other.value = state.search;
    render();
  });
}

document.querySelectorAll(".filter").forEach(btn =>
  btn.addEventListener("click", () => {
    const value = btn.dataset.type;
    if (value === "all") {
      if (state.type.length !== 2) state.type = ["movie", "show"];
      else return;
    } else
      state.type = state.type.includes(value)
        ? state.type.filter(v => v !== value)
        : [...state.type, value];
    updateFilterUI();
    render();
    saveSettings();
  })
);
document.querySelectorAll(".status-filter").forEach(btn =>
  btn.addEventListener("click", () => {
    const value = btn.dataset.status;
    if (value === "all") {
      if (state.status.length !== 3)
        state.status = ["unwatched", "in-progress", "watched"];
      else return;
    } else
      state.status = state.status.includes(value)
        ? state.status.filter(v => v !== value)
        : [...state.status, value];
    updateFilterUI();
    render();
    saveSettings();
  })
);
bindSearch("search");
bindSearch("searchDesktop");
document.getElementById("sort").addEventListener("change", e => {
  state.sort = e.target.value;
  render();
  saveSettings();
});
document.getElementById("resetBtn").addEventListener("click", async () => {
  if (
    confirm("Reset all MCU progress in this browser? This cannot be undone.")
  ) {
    await clearProgress();
    state.progress.clear();
    updateStats();
    render();
  }
});

setupFiltersToggle();
setupContinueWatching();

(async () => {
  const [progress, settings] = await Promise.all([
    getAllProgress(),
    getSettings()
  ]);
  state.progress = progress;
  const savedType = settings.type;
  const savedStatus = settings.status;
  state.type = Array.isArray(savedType)
    ? savedType
    : savedType === "movie"
      ? ["movie"]
      : savedType === "show"
        ? ["show"]
        : ["movie", "show"];
  state.status = Array.isArray(savedStatus)
    ? savedStatus
    : savedStatus === "watched" || savedStatus === "checked"
      ? ["watched"]
      : savedStatus === "unwatched" || savedStatus === "unchecked"
        ? ["unwatched"]
        : savedStatus === "in-progress"
          ? ["in-progress"]
          : ["unwatched", "in-progress", "watched"];
  state.sort = settings.sort || "release";
  state.filtersOpen = Boolean(settings.filtersOpen);
  state.manualCompleted = new Set(
    Array.isArray(settings.manualCompleted) ? settings.manualCompleted : []
  );

  updateFilterUI();
  document.getElementById("sort").value = state.sort;
  setFiltersToggle(state.filtersOpen);
  updateStats();
  render();
})();
