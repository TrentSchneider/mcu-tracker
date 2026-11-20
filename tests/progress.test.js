const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createApp() {
  const elements = new Map();
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
          addEventListener(type, handler) {
            this[type] = handler;
          },
          querySelectorAll: () => []
        });
      }
      return elements.get(id);
    },
    addEventListener() {}
  };
  const context = vm.createContext({ document, console });
  context.MCU_ITEMS = [
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
