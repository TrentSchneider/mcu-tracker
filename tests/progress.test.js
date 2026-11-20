const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createApp(items) {
  const elements = new Map();
  const documentHandlers = {};
  const infoWrapper = {
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    contains(target) {
      return target === this || target === elements.get("legacyInfo") ||
        target === elements.get("legacyInfoText");
    }
  };
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          textContent: "",
          innerHTML: "",
          style: {},
          checked: true,
          disabled: false,
          hidden: true,
          attributes: {},
          parentElement: id === "legacyInfo" ? infoWrapper : null,
          setAttribute(name, value) {
            this.attributes[name] = value;
          },
          contains(target) {
            return target === this || (id === "settingsMenu" &&
              (infoWrapper.contains(target) || target === elements.get("includeLegacy")));
          },
          focus() {
            document.activeElement = this;
          },
          addEventListener(type, handler) {
            this[type] = handler;
          },
          querySelectorAll: () => []
        });
      }
      return elements.get(id);
    },
    addEventListener(type, handler) {
      documentHandlers[type] = handler;
    }
  };
  const context = vm.createContext({ document, console });
  context.MCU_ITEMS = items || [
    ...Array.from({ length: 64 }, (_, i) => ({ id: `regular-${i}`, type: "movie" })),
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `legacy-${i}`,
      type: "movie",
      phaseLabel: "Legacy"
    }))
  ];
  const root = path.join(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const bindings = source.indexOf(
    'document.querySelectorAll(".filter").forEach(btn =>\n  btn.addEventListener'
  );
  assert.notEqual(bindings, -1);
  vm.runInContext(
    source.slice(0, bindings) +
      "\nrender = () => {}; saveSettings = async () => {}; setupSettingsMenu();",
    context
  );
  return {
    element: id => document.getElementById(id),
    infoWrapper,
    document,
    documentHandlers,
    run: code => vm.runInContext(code, context)
  };
}

test("Legacy toggle updates the bar even when rounded percentages match", async () => {
  const app = createApp();
  app.run(`
    const regular = MCU_ITEMS.filter(item => item.phaseLabel !== "Legacy");
    const legacy = MCU_ITEMS.filter(item => item.phaseLabel === "Legacy");
    state.progress.set(regular[0].id, "watched");
    state.progress.set(regular[1].id, "watched");
    state.progress.set(legacy[0].id, "watched");
    updateStats();
  `);
  assert.equal(app.element("progressText").textContent, "3 / 94");
  assert.equal(app.element("percentText").textContent, "3%");
  assert.equal(parseFloat(app.element("progressBar").style.width), (3 / 94) * 100);

  app.element("includeLegacy").checked = false;
  await app.element("includeLegacy").change();
  assert.equal(app.element("progressText").textContent, "2 / 64");
  assert.equal(app.element("percentText").textContent, "3%");
  assert.equal(parseFloat(app.element("progressBar").style.width), (2 / 64) * 100);

  app.element("includeLegacy").checked = true;
  await app.element("includeLegacy").change();
  assert.equal(parseFloat(app.element("progressBar").style.width), (3 / 94) * 100);
});

test("hiding the only watched Legacy title empties the bar", async () => {
  const app = createApp();
  app.run(`
    state.progress.set(MCU_ITEMS.find(item => item.phaseLabel === "Legacy").id, "watched");
    updateStats();
  `);
  assert.ok(parseFloat(app.element("progressBar").style.width) > 0);
  app.element("includeLegacy").checked = false;
  await app.element("includeLegacy").change();
  assert.equal(app.element("progressText").textContent, "0 / 64");
  assert.equal(app.element("progressBar").style.width, "0%");
});

test("Legacy info supports hover, activation, dismissal, and reopening", () => {
  const app = createApp();
  const info = app.element("legacyInfo");
  const text = app.element("legacyInfoText");
  app.element("settingsToggle").click();

  app.infoWrapper.handlers.pointerenter({ pointerType: "mouse" });
  assert.equal(text.hidden, false);
  app.infoWrapper.handlers.pointerleave({ pointerType: "mouse" });
  assert.equal(text.hidden, true);

  app.infoWrapper.handlers.pointerenter({ pointerType: "touch" });
  assert.equal(text.hidden, true);
  info.click();
  assert.equal(text.hidden, false);
  assert.equal(info.attributes["aria-expanded"], "true");
  app.infoWrapper.handlers.pointerleave({ pointerType: "mouse" });
  assert.equal(text.hidden, false);

  app.documentHandlers.keydown({ key: "Escape" });
  assert.equal(text.hidden, true);
  assert.equal(app.document.activeElement, info);
  assert.equal(app.element("settingsMenu").hidden, false);
  info.click();
  app.documentHandlers.click({ target: app.element("includeLegacy") });
  assert.equal(text.hidden, true);
  info.click();
  app.element("settingsToggle").click();
  assert.equal(text.hidden, true);
  app.element("settingsToggle").click();
  assert.equal(text.hidden, true);
});

test("Legacy setting excludes only older shows outside Marvel's published timeline", async () => {
  const root = path.join(__dirname, "..");
  const data = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), data);
  vm.runInNewContext(fs.readFileSync(path.join(root, "episodes.js"), "utf8"), data);
  const items = data.window.MCU_ITEMS;
  const legacyIds = [
    ...Array.from({ length: 9 }, (_, i) => `series-${22 + i}`),
    ...Array.from({ length: 6 }, (_, i) => `series-${44 + i}`)
  ];
  const timelineIds = [
    ...Array.from({ length: 13 }, (_, i) => `series-${31 + i}`),
    "series-50",
    "series-51"
  ];
  assert.deepEqual(
    Array.from(items.filter(item => item.phaseLabel === "Legacy"), item => item.id),
    legacyIds
  );
  for (const id of timelineIds) {
    const item = items.find(entry => entry.id === id);
    assert.ok(item, `missing ${id}`);
    assert.notEqual(item.phaseLabel, "Legacy", item.title);
    assert.equal(item.phaseOrder, item.phase * 1000 + item.order);
    assert.equal(data.window.MCU_EPISODE_TITLES[id].length, item.episodeCount);
  }

  const app = createApp(items);
  app.run(`
    state.progress.set("series-31", "watched");
    state.progress.set("series-24", "watched");
    updateStats();
  `);
  app.element("includeLegacy").checked = false;
  await app.element("includeLegacy").change();
  const visibleIds = Array.from(app.run("includedItems()"), item => item.id);
  for (const id of timelineIds) assert.ok(visibleIds.includes(id), id);
  for (const id of legacyIds) assert.ok(!visibleIds.includes(id), id);
  assert.equal(app.element("progressText").textContent, `1 / ${items.length - legacyIds.length}`);
  assert.equal(app.run('state.progress.get("series-24")'), "watched");

  app.element("includeLegacy").checked = true;
  await app.element("includeLegacy").change();
  assert.equal(app.element("progressText").textContent, `2 / ${items.length}`);
});
