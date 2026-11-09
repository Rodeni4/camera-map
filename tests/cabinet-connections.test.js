const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
const { test } = require("node:test");

// Exercise the local app's data and UI handlers without a browser dependency.
class Element {
  constructor() {
    this.children = [];
    this.cells = this.children;
    this.value = "";
    this.dataset = {};
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.handlers = {};
    this.scrollLeft = 0; this.scrollTop = 0;
    this.clientWidth = 900; this.clientHeight = 600;
  }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  removeEventListener(name) { delete this.handlers[name]; }
  setPointerCapture() {}
  hasPointerCapture() { return false; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 600 }; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.cells = children; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
}

function setup({ fileIO = false } = {}) {
  const nodes = new Map();
  const document = {
    querySelector(id) {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { return new Element(); },
    createElementNS() { return new Element(); },
    addEventListener() {},
  };
  const context = {
    document,
    window: { addEventListener() {}, setTimeout(handler) { handler(); }, confirm() { return true; } },
    Blob,
    HTMLInputElement: Element,
    HTMLTextAreaElement: Element,
  };
  let source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  source = source.slice(0, source.indexOf("  const resizeObserver =")) + (fileIO ? `
    // Keep actual save/open handlers and file data; stub browser-only image decoding and painting.
    decodeImage = async () => ({ naturalWidth: 100, naturalHeight: 100 });
    refreshEditor = () => {}; fitMap = () => {}; showLoadedMap = () => {};
  ` : "") + `
    globalThis.api = { state, assignCablePort, cablePortConnection, projectContent,
      normalizeProject, resetHistory, recordHistory, renderCabinetScheme,
      assignInternalConnection, validInternalConnections, equipmentUplinks, normalizeSchemeLayout, routeSchemeWire,
      saveProject, openProject, resetProject, schemeScrollPositions, openCabinetScheme };
  })();`;
  vm.createContext(context);
  vm.runInContext(source, context);
  const api = context.api;
  Object.assign(api.state, {
    imageWidth: 100, imageHeight: 100, imageData: "data:image/png;base64,AA==",
    cameras: [{ id: "c1", name: "Camera 1", x: 10, y: 10 }, { id: "c2", name: "Camera 2", x: 20, y: 20 }],
    cabinets: [
      { id: "cabinet1", name: "Cabinet 1", x: 40, y: 40, equipment: [{ id: "equipment1", type: "poe-switch", name: "PoE", ports: "8" }] },
      { id: "cabinet2", name: "Cabinet 2", x: 80, y: 80, equipment: [{ id: "equipment2", type: "switch", ports: "4" }] },
    ],
    cables: [
      { id: "cable1", type: "copper", name: "Cable 1", sourceKind: "camera", sourceId: "c1", targetCabinetId: "cabinet1", viaMountIds: [] },
      { id: "cable2", type: "copper", name: "Cable 2", sourceKind: "camera", sourceId: "c2", targetCabinetId: "cabinet1", viaMountIds: [] },
      { id: "cable3", type: "fiber", name: "Uplink", sourceKind: "cabinet", sourceId: "cabinet1", targetCabinetId: "cabinet2", viaMountIds: [] },
    ],
  });
  return { api, nodes };
}

test("port assignment rejects conflicts and invalid ports without changing the connection", () => {
  const { api: a } = setup();
  const [cabinet] = a.state.cabinets;
  const [first, second] = a.state.cables;
  assert.equal(a.assignCablePort(first, cabinet, "equipment1", 1), "");
  assert.ok(a.assignCablePort(second, cabinet, "equipment1", 1));
  assert.equal(a.cablePortConnection(second, cabinet), null);
  for (const port of [0, -1, 9, 1.5, "bad"]) assert.ok(a.assignCablePort(first, cabinet, "equipment1", port));
  assert.equal(a.cablePortConnection(first, cabinet).port, 1);
  assert.ok(a.assignCablePort(first, a.state.cabinets[1], "equipment2", 1));
  assert.equal(a.assignCablePort(first, cabinet, "", ""), "");
  assert.equal(a.cablePortConnection(first, cabinet), null);
});

test("both cabinet endpoints survive saving and loading, alongside existing descriptions and photos", () => {
  const { api: a } = setup();
  const [cabinet, remote] = a.state.cabinets;
  const [cameraCable, , uplink] = a.state.cables;
  a.state.cameras[0].note = "Existing description";
  a.state.cameras[0].modelImage = "data:image/jpeg;base64,/9j/AA==";
  a.assignCablePort(cameraCable, cabinet, "equipment1", 1);
  a.assignCablePort(uplink, cabinet, "equipment1", 8);
  a.assignCablePort(uplink, remote, "equipment2", 4);
  const restored = a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() });
  assert.equal(restored.cables[0].targetConnection.port, 1);
  assert.equal(restored.cables[2].sourceConnection.port, 8);
  assert.equal(restored.cables[2].targetConnection.port, 4);
  assert.equal(restored.cameras[0].note, "Existing description");
  assert.equal(restored.cameras[0].modelImage, "data:image/jpeg;base64,/9j/AA==");
});

test("deleted equipment and reduced port counts make affected cables unconnected", () => {
  const { api: a } = setup();
  const cabinet = a.state.cabinets[0];
  a.assignCablePort(a.state.cables[0], cabinet, "equipment1", 8);
  cabinet.equipment[0].ports = "4";
  assert.equal(a.cablePortConnection(a.state.cables[0], cabinet), null);
  cabinet.equipment[0].ports = "8";
  cabinet.equipment = [];
  assert.equal(a.cablePortConnection(a.state.cables[0], cabinet), null);
  assert.equal(a.projectContent().cables[0].targetConnection, null);
});

test("old projects load and conflicting saved connections are cleared", () => {
  const { api: a } = setup();
  const project = a.projectContent();
  delete project.cables[0].targetConnection;
  project.cables[1].targetConnection = { equipmentId: "equipment1", port: 2 };
  project.cables[2].sourceConnection = { equipmentId: "equipment1", port: 2 };
  const restored = a.normalizeProject({ format: "camera-map-project", version: 1, project });
  assert.equal(restored.cables[0].targetConnection, null);
  assert.equal(restored.cables[1].targetConnection.port, 2);
  assert.equal(restored.cables[2].sourceConnection, null);
});

test("history captures assignments and the cabinet scheme renders", () => {
  const { api: a, nodes } = setup();
  a.resetHistory();
  a.assignCablePort(a.state.cables[0], a.state.cabinets[0], "equipment1", 1);
  a.recordHistory();
  assert.equal(a.state.undoStack.length, 1);
  assert.equal(a.state.undoStack[0].cables[0].targetConnection, null);
  assert.equal(a.state.historySnapshot.cables[0].targetConnection.port, 1);
  a.state.activeWorkspace = "cabinet:cabinet1";
  a.renderCabinetScheme();
  assert.ok(nodes.get("#cabinet-scheme-panel").children.length > 0);
});

test("PoE uplinks connect to another device and share occupancy checks with external cables", () => {
  const { api: a } = setup();
  const cabinet = a.state.cabinets[0];
  cabinet.equipment.push({ id: "equipment3", name: "Router", type: "wifi-router", ports: "4" });
  const from = { equipmentId: "equipment1", port: 513 };
  const to = { equipmentId: "equipment3", port: 1 };
  assert.equal(a.equipmentUplinks(cabinet.equipment[0]), 2);
  assert.equal(a.assignInternalConnection(cabinet, from, to), "");
  assert.equal(a.validInternalConnections(cabinet).length, 1);
  assert.ok(a.assignInternalConnection(cabinet, from, { equipmentId: "equipment3", port: 2 }));
  assert.ok(a.assignCablePort(a.state.cables[0], cabinet, "equipment1", 513));
  assert.ok(a.assignInternalConnection(cabinet, { equipmentId: "equipment1", port: 514 }, { equipmentId: "equipment1", port: 1 }));
  const restored = a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() });
  assert.equal(restored.cabinets[0].internalConnections[0].from.port, 513);
  assert.equal(restored.cabinets[0].internalConnections[0].to.equipmentId, "equipment3");
  assert.equal(restored.cabinets[0].equipment[0].uplinkPorts, "2");
  cabinet.equipment[0].uplinkPorts = "0";
  assert.equal(a.validInternalConnections(cabinet).length, 0);
});

test("external cable assignments prevent internal links using the same port", () => {
  const { api: a } = setup();
  const cabinet = a.state.cabinets[0];
  cabinet.equipment.push({ id: "equipment3", type: "wifi-router", ports: "4" });
  a.assignCablePort(a.state.cables[0], cabinet, "equipment1", 1);
  assert.ok(a.assignInternalConnection(cabinet, { equipmentId: "equipment1", port: 1 }, { equipmentId: "equipment3", port: 1 }));
  assert.equal(a.assignCablePort(a.state.cables[1], cabinet, "equipment1", 514), "");
  const restored = a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() });
  assert.equal(restored.cables[1].targetConnection.port, 514);
});

test("visual editor connects camera and device ports with clicks, then removes the selected wire", () => {
  const { api: a, nodes } = setup();
  const cabinet = a.state.cabinets[0];
  cabinet.equipment.push({ id: "equipment3", name: "Router", type: "wifi-router", ports: "4" });
  a.state.activeWorkspace = "cabinet:cabinet1";
  a.resetHistory();
  const elements = () => {
    const flatten = (element) => [element, ...element.children.flatMap(flatten)];
    return flatten(nodes.get("#cabinet-scheme-panel"));
  };
  a.renderCabinetScheme();
  elements().find((element) => element.className === "scheme-node scheme-node--external").handlers.click();
  elements().find((element) => element["aria-label"] === "PoE: PoE 1, свободен").handlers.click();
  assert.equal(a.state.cables[0].targetConnection.port, 1);
  elements().find((element) => element["aria-label"] === "PoE: Uplink 1, свободен").handlers.click();
  elements().find((element) => element["aria-label"] === "Router: Порт 1, свободен").handlers.click();
  assert.equal(a.validInternalConnections(cabinet).length, 1);
  assert.equal(elements().filter((element) => element.class === "scheme-wire").length, 2);
  const internalWire = elements().find((element) => element.class === "scheme-wire" && element["aria-label"].includes("Router"));
  internalWire.handlers.click();
  elements().find((element) => element.textContent === "Удалить выбранную связь").handlers.click();
  assert.equal(a.validInternalConnections(cabinet).length, 0);
  assert.equal(a.state.cables[0].targetConnection.port, 1);
  assert.equal(a.state.cables.length, 3);
  assert.ok(a.state.undoStack.length >= 3);
});

test("dragging at reduced zoom moves blocks, ports and wires together and saves positions", () => {
  const { api: a, nodes } = setup();
  const cabinet = a.state.cabinets[0];
  cabinet.schemeLayout = { scale: 0.5, positions: {} };
  a.assignCablePort(a.state.cables[0], cabinet, "equipment1", 1);
  a.state.activeWorkspace = "cabinet:cabinet1";
  a.resetHistory(); a.renderCabinetScheme();
  const flatten = (element) => [element, ...element.children.flatMap(flatten)];
  const elements = () => flatten(nodes.get("#cabinet-scheme-panel"));
  const external = elements().find((element) => element.className === "scheme-node scheme-node--external");
  const pathBefore = elements().find((element) => element.class === "scheme-wire").d;
  const pointer = { pointerId: 1, button: 0, clientX: 100, clientY: 100, target: { closest() { return true; } }, preventDefault() {}, stopPropagation() {} };
  external.handlers.pointerdown(pointer);
  external.handlers.pointermove({ ...pointer, clientX: 160, clientY: 140 });
  assert.equal(external.style.left, "140px");
  assert.equal(external.style.top, "104px");
  assert.notEqual(elements().find((element) => element.class === "scheme-wire").d, pathBefore);
  external.handlers.pointerup(pointer);
  assert.equal(cabinet.schemeLayout.positions["cable:cable1"].x, 140);
  assert.equal(cabinet.schemeLayout.positions["cable:cable1"].y, 104);
  assert.equal(a.state.undoStack.length, 1);
  const restored = a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() });
  assert.equal(restored.cabinets[0].schemeLayout.scale, 0.5);
  assert.equal(restored.cabinets[0].schemeLayout.positions["cable:cable1"].x, 140);
  a.renderCabinetScheme();
  assert.equal(elements().find((element) => element.className === "scheme-node scheme-node--external").style.left, "140px");
  elements().find((element) => element.textContent === "+").handlers.click();
  assert.equal(cabinet.schemeLayout.scale, 0.6);
});

test("layout validation bounds imported coordinates and keeps old project defaults", () => {
  const { api: a } = setup();
  const layout = a.normalizeSchemeLayout({ scale: 50, positions: {
    "device:equipment1": { x: -50, y: 999999 },
    "cable:cable1": { x: NaN, y: 2 },
    "unknown": { x: 1, y: 1 },
  } });
  assert.equal(layout.scale, 2.5);
  assert.equal(layout.positions["device:equipment1"].x, 0);
  assert.equal(layout.positions["device:equipment1"].y, 20000);
  assert.equal(Object.keys(layout.positions).length, 1);
  assert.equal(a.normalizeSchemeLayout().scale, 1);
});

test("front panel ports share one row, uplinks sit to the right and wire hover traces endpoints", () => {
  const { api: a, nodes } = setup();
  const cabinet = a.state.cabinets[0];
  a.assignCablePort(a.state.cables[0], cabinet, "equipment1", 1);
  a.assignCablePort(a.state.cables[1], cabinet, "equipment1", 8);
  a.state.activeWorkspace = "cabinet:cabinet1";
  a.renderCabinetScheme();
  const flatten = (element) => [element, ...element.children.flatMap(flatten)];
  const elements = flatten(nodes.get("#cabinet-scheme-panel"));
  const ports = elements.filter((element) => element.className?.includes("scheme-pin--socket"));
  assert.equal(ports.length, 10);
  assert.equal(new Set(ports.map((element) => element.style.top)).size, 1);
  assert.ok(parseFloat(ports[8].style.left) > parseFloat(ports[7].style.left) + 58);
  const paths = elements.filter((element) => element.class === "scheme-wire");
  paths[0].handlers.pointerenter();
  assert.equal(paths[1].style.opacity, "0.12");
  paths[0].handlers.pointerleave();
  assert.equal(paths[1].style.opacity, "1");
});

test("orthogonal routing avoids an intervening equipment block", () => {
  const { api: a } = setup();
  const route = a.routeSchemeWire({ x: 20, y: 60, direction: "right" }, { x: 320, y: 60, direction: "bottom" }, [{ x: 120, y: 10, width: 80, height: 130 }]);
  const points = [...route.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  assert.equal(points[0].x, 20);
  assert.equal(points.at(-1).x, 320);
  for (let index = 1; index < points.length; index += 1) {
    const p = points[index - 1], q = points[index];
    assert.ok(p.x === q.x || p.y === q.y);
    const crosses = p.x === q.x
      ? p.x > 120 && p.x < 200 && Math.max(p.y, q.y) > 10 && Math.min(p.y, q.y) < 140
      : p.y > 10 && p.y < 140 && Math.max(p.x, q.x) > 120 && Math.min(p.x, q.x) < 200;
    assert.equal(crosses, false);
  }
});

test("actual save/open handlers restore cabinet schemes from disk in a fresh session", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "camera-map-persistence-"));
  try {
    const filePath = path.join(directory, "review.cmap");
    const fileHandle = {
      name: "review.cmap",
      async createWritable() {
        return { async write(blob) { fs.writeFileSync(filePath, await blob.text()); }, async close() {} };
      },
    };
    const { api: first, nodes: firstNodes } = setup({ fileIO: true });
    first.state.projectFileHandle = fileHandle;
    const [cabinet, remote] = first.state.cabinets;
    cabinet.equipment.push({ id: "equipment3", name: "Router", type: "wifi-router", ports: "4", uplinkPorts: "0" });
    cabinet.schemeLayout = { scale: 0.65, positions: { "device:equipment1": { x: 322, y: 40 }, "device:equipment3": { x: 680, y: 460 }, "cable:cable1": { x: 44, y: 240 } } };
    remote.schemeLayout = { scale: 1.25, positions: { "device:equipment2": { x: 480, y: 300 } } };
    first.assignCablePort(first.state.cables[0], cabinet, "equipment1", 1);
    first.assignCablePort(first.state.cables[1], cabinet, "equipment1", 2);
    first.assignCablePort(first.state.cables[2], cabinet, "equipment1", 514);
    first.assignCablePort(first.state.cables[2], remote, "equipment2", 4);
    first.assignInternalConnection(cabinet, { equipmentId: "equipment1", port: 513 }, { equipmentId: "equipment3", port: 1 });
    cabinet.note = "Cabinet notes";
    cabinet.equipment[0].modelImage = "data:image/jpeg;base64,/9j/AA==";
    const canonical = first.normalizeProject({ format: "camera-map-project", version: 1, project: first.projectContent() });
    first.state.cabinets = canonical.cabinets;
    first.state.cables = canonical.cables;
    await first.saveProject();
    assert.equal(firstNodes.get("#error-message").hidden, true);
    assert.equal(first.state.isDirty, false);
    assert.ok(fs.existsSync(filePath));
    const snapshot = JSON.parse(fs.readFileSync(filePath, "utf8")).project;
    const { api: reopened, nodes: reopenedNodes } = setup({ fileIO: true });
    await reopened.openProject({ name: "review.cmap", async text() { return fs.readFileSync(filePath, "utf8"); } }, fileHandle);
    assert.equal(reopenedNodes.get("#error-message").hidden, true);
    assert.equal(reopened.state.isDirty, false);
    const restored = reopened.projectContent();
    assert.deepEqual(JSON.parse(JSON.stringify(restored.cabinets)), snapshot.cabinets);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.cables)), snapshot.cables);
    reopened.state.activeWorkspace = "cabinet:cabinet1";
    reopened.renderCabinetScheme();
    const flatten = (element) => [element, ...element.children.flatMap(flatten)];
    const elements = flatten(reopenedNodes.get("#cabinet-scheme-panel"));
    assert.equal(elements.filter((element) => element.class === "scheme-wire").length, 4);
    const device = elements.find((element) => element.className === "scheme-node scheme-node--device");
    assert.equal(device.style.left, "322px");
    assert.equal(device.style.top, "40px");
    assert.equal(elements.find((element) => element.className === "scheme-canvas").style.transform, "scale(0.65)");
    // Open another project, then reopen the saved one in the same session.
    reopened.resetProject();
    assert.equal(reopened.state.cabinets.length, 0);
    assert.equal(reopened.state.activeWorkspace, "map");
    assert.equal(reopened.state.openCabinetTabs.length, 0);
    assert.equal(reopened.schemeScrollPositions.size, 0);
    reopened.state.openCabinetTabs = ["cabinet1"];
    reopened.state.activeWorkspace = "cabinet:cabinet1";
    reopened.schemeScrollPositions.set("cabinet1", { x: 900, y: 800 });
    await reopened.openProject({ name: "review.cmap", async text() { return fs.readFileSync(filePath, "utf8"); } }, fileHandle);
    assert.equal(reopened.state.activeWorkspace, "map");
    assert.equal(reopened.state.openCabinetTabs.length, 0);
    assert.equal(reopened.schemeScrollPositions.size, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(reopened.projectContent().cabinets)), snapshot.cabinets);
    await reopened.saveProject();
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")).project.cabinets, snapshot.cabinets);
  } finally {
    const savedFile = path.join(directory, "review.cmap");
    if (fs.existsSync(savedFile)) fs.unlinkSync(savedFile);
    fs.rmdirSync(directory);
  }
});

test("cabinet scheme adds equipment to the active cabinet and keeps it in the project", () => {
  const { api: a, nodes } = setup();
  a.state.nextEquipmentId = 3;
  a.state.activeWorkspace = "cabinet:cabinet1";
  a.resetHistory(); a.renderCabinetScheme();
  const flatten = (element) => [element, ...element.children.flatMap(flatten)];
  const choices = flatten(nodes.get("#cabinet-scheme-panel")).filter((element) => element.dataset.equipmentType);
  assert.equal(choices.length, 7);
  choices.find((element) => element.dataset.equipmentType === "poe-switch").handlers.click();
  const added = a.state.cabinets[0].equipment.at(-1);
  assert.equal(added.id, "equipment3");
  assert.equal(added.type, "poe-switch");
  assert.equal(a.state.cabinets[1].equipment.length, 1);
  assert.equal(a.state.activeWorkspace, "cabinet:cabinet1");
  assert.ok(a.state.cabinets[0].schemeLayout.positions["device:equipment3"]);
  assert.equal(a.state.undoStack.length, 1);
  const restored = a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() });
  assert.equal(restored.cabinets[0].equipment.at(-1).id, "equipment3");
  assert.ok(restored.cabinets[0].schemeLayout.positions["device:equipment3"]);
});
