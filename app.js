const DB_NAME = "mcu-tracker";
const DB_VERSION = 1;
const STORE = "progress";

const state = {
  type: "all",
  status: "all",
  search: "",
  sort: "release",
  progress: new Set()
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
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
      req = store.getAllKeys();
    req.onsuccess = () => resolve(new Set(req.result));
    req.onerror = () => reject(req.error);
  });
}
async function setProgress(id, checked) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"),
      store = tx.objectStore(STORE);
    checked ? store.put(true, id) : store.delete(id);
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

function filteredItems() {
  const filtered = MCU_ITEMS.filter(item => {
    const typeOK = state.type === "all" || item.type === state.type;
    const statusOK =
      state.status === "all" ||
      (state.status === "checked" && state.progress.has(item.id)) ||
      (state.status === "unchecked" && !state.progress.has(item.id));
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

function render() {
  const list = document.getElementById("list");
  const empty = document.getElementById("empty");
  const visible = filteredItems();
  list.innerHTML = "";
  visible.forEach((item, i) => {
    const row = document.createElement("article");
    row.className = "item" + (state.progress.has(item.id) ? " checked" : "");
    row.innerHTML = `
      <div class="num">${String(item.order).padStart(2, "0")}</div>
      <div class="item-main">
        <div class="title-line">
          <div class="title">${escapeHTML(item.title)}</div>
          <span class="badge ${item.type}">${item.type === "movie" ? "Movie" : "Show"}</span>
        </div>
        <div class="meta">
          <span>${item.year}</span>
          <span>${item.phaseLabel || `Phase ${item.phase}`}</span>
          <span class="${item.status === "Upcoming" ? "upcoming" : ""}">${item.status}</span>
        </div>
      </div>
      <label class="check-wrap" title="${state.progress.has(item.id) ? "Mark unchecked" : "Mark watched"}">
        <input class="check" type="checkbox" ${state.progress.has(item.id) ? "checked" : ""} aria-label="Mark ${escapeHTML(item.title)} watched">
      </label>`;
    row.querySelector(".check").addEventListener("change", async e => {
      const checked = e.target.checked;
      if (checked) state.progress.add(item.id);
      else state.progress.delete(item.id);
      row.classList.toggle("checked", checked);
      await setProgress(item.id, checked);
      updateStats();
      render();
    });
    list.appendChild(row);
  });
  empty.hidden = visible.length !== 0;
  document.getElementById("visibleCount").textContent = visible.length;
}

function updateStats() {
  const total = MCU_ITEMS.length,
    done = state.progress.size,
    pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("progressText").textContent = `${done} / ${total}`;
  document.getElementById("percentText").textContent = `${pct}%`;
  document.getElementById("remainingText").textContent =
    `${total - done} remaining`;
  document.getElementById("progressBar").style.width = pct + "%";
}
function escapeHTML(s) {
  return s.replace(
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

document.querySelectorAll(".filter").forEach(btn =>
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".filter")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.type = btn.dataset.type;
    render();
  })
);
document.querySelectorAll(".status-filter").forEach(btn =>
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".status-filter")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.status = btn.dataset.status;
    render();
  })
);
document.getElementById("search").addEventListener("input", e => {
  state.search = e.target.value;
  render();
});
document.getElementById("sort").addEventListener("change", e => {
  state.sort = e.target.value;
  render();
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

(async () => {
  state.progress = await getAllProgress();
  updateStats();
  render();
})();
