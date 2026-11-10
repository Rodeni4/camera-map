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
    this.style = { setProperty(name, value) { this[name] = value; } };
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
  remove() {}
  close() { this.open = false; }
  showModal() { this.open = true; }
  scrollIntoView(options) { this.scrolledIntoView = options; }
  focus() { this.focused = true; }
  cloneNode(deep) {
    const clone = new Element();
    clone.className = this.className;
    clone.textContent = this.textContent;
    clone.style = { ...this.style };
    if (deep) clone.append(...this.children.map(child => child.cloneNode(true)));
    return clone;
  }
  append(...children) { this.children.push(...children); }
  createTHead() { const head = new Element(); this.append(head); return head; }
  createTBody() { const body = new Element(); this.append(body); return body; }
  insertRow() { const row = new Element(); this.append(row); return row; }
  insertCell() { const cell = new Element(); this.append(cell); return cell; }
  replaceChildren(...children) { this.children = children; this.cells = children; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
}

function setup({ fileIO = false } = {}) {
  const nodes = new Map();
  const document = {
    handlers: {},
    body: new Element(),
    querySelector(id) {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { return new Element(); },
    createElementNS() { return new Element(); },
    addEventListener(name, handler) { this.handlers[name] = handler; },
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
      saveProject, openProject, resetProject, schemeScrollPositions, openCabinetScheme,
      cableRouteNodes, finishCable, setActiveTool, undo, renderEquipment, preparePrintSheet, renderView, renderObjects,
      removeEquipment, revealEquipmentDescription, bindCableEndpoint, inventoryColumns };
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
  return { api, nodes, document, window: context.window };
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
    const { api: first, nodes: firstNodes, window: firstWindow } = setup({ fileIO: true });
    firstWindow.showSaveFilePicker = async () => fileHandle;
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
    const { api: reopened, nodes: reopenedNodes, window: reopenedWindow } = setup({ fileIO: true });
    reopenedWindow.showSaveFilePicker = async () => fileHandle;
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

test("free cable clicks create bends, preview follows cursor and double click finishes", () => {
  const { api: a, nodes } = setup();
  a.state.nextCableId = 4;
  const workspace = nodes.get("#workspace");
  a.setActiveTool("cable");
  const click = (x, y) => workspace.handlers.pointerdown({ button: 0, clientX: x, clientY: y, preventDefault() {} });
  click(10, 10);
  workspace.handlers.pointermove({ clientX: 30, clientY: 20 });
  assert.equal(a.state.cableDraft.cursor.x, 30);
  assert.equal(a.state.cableDraft.routePoints.length, 0);
  click(30, 20); click(50, 60);
  const count = a.state.cables.length;
  workspace.handlers.dblclick({ target: { closest() { return null; } }, preventDefault() {} });
  assert.equal(a.state.cables.length, count + 1);
  assert.equal(a.state.cableDraft, null);
  const cable = a.state.cables.at(-1);
  assert.equal(cable.targetCabinetId, null);
  assert.deepEqual(Array.from(a.cableRouteNodes(cable), p => [p.x, p.y]), [[10, 10], [30, 20], [50, 60]]);
  const restored = a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() });
  assert.deepEqual(Array.from(a.cableRouteNodes(restored.cables.at(-1)), p => [p.x, p.y]), [[10, 10], [30, 20], [50, 60]]);
});

test("moving cable vertices can be undone without mutating the saved history", () => {
  const { api: a } = setup();
  const cable = a.state.cables[0];
  cable.routePoints = [{ x: 25, y: 35 }];
  a.resetHistory();
  cable.routePoints[0].x = 65;
  a.recordHistory(); a.undo();
  assert.equal(a.state.cables[0].routePoints[0].x, 25);
});

test("inventory shows specific columns and cable fields persist after reload", () => {
  const { api: a, nodes } = setup();
  a.renderEquipment();
  const groups = nodes.get("#equipment-groups").children;
  const tableFor = (label) => groups.find(group => group.children[0].textContent.startsWith(label)).children[1].children[0];
  const titles = table => table.children[0].children[0].children.map(cell => cell.textContent);
  assert.deepEqual(titles(tableFor("Камеры")), ["Название", "Модель", "IP-адрес", "MAC / Порты", "Описание", "Фотографии", ""]);
  assert.deepEqual(titles(tableFor("Узлы")), ["Название", "Описание", "Фотографии", ""]);
  const copper = tableFor("Кабели · Витая");
  const fiber = tableFor("Кабели · Оптоволокно");
  assert.deepEqual(titles(copper), ["Название", "Расположение", "Тип", "Прокладка", "Длина, м", "Описание", "Фотографии", ""]);
  assert.deepEqual(titles(fiber), ["Название", "Расположение", "Тип", "Длина, м", "Описание", "Фотографии", ""]);
  const edit = (table, index, value, event = "input") => {
    const input = table.children[1].children[0].children[index].children[0];
    input.value = value; input.handlers[event]();
  };
  edit(copper, 2, "UTP Cat.6"); edit(copper, 3, "outdoor", "change"); edit(copper, 4, "25.5");
  edit(fiber, 2, "ОК-8"); edit(fiber, 3, "120");
  a.recordHistory();
  const loaded = a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() });
  assert.equal(loaded.cables[0].cableSpecification, "UTP Cat.6");
  assert.equal(loaded.cables[0].installation, "outdoor");
  assert.equal(loaded.cables[0].lengthMeters, 25.5);
  assert.equal(loaded.cables[2].cableSpecification, "ОК-8");
  assert.equal(loaded.cables[2].installation, "");
  assert.equal(loaded.cables[2].lengthMeters, 120);
  assert.equal(loaded.cables[1].lengthMeters, null);
  nodes.get("#equipment-search").value = "UTP Cat.6";
  a.renderEquipment();
  assert.equal(nodes.get("#equipment-groups").children.length, 1);
});

test("PDF includes the viewport, the complete inventory and every cabinet without changing the view", () => {
  const { api: a, nodes } = setup();
  a.state.view = { x: -150, y: -75, scale: 3 };
  a.state.cameras.forEach(camera => { camera.range = 20; });
  a.renderView();
  a.state.activeWorkspace = "equipment";
  nodes.get("#equipment-search").value = "No matches";
  const before = JSON.stringify(a.projectContent());
  assert.equal(a.preparePrintSheet(), true);
  assert.equal(a.state.activeWorkspace, "equipment");
  assert.equal(a.state.view.scale, 3);
  assert.equal(a.state.view.x, -150);
  assert.equal(JSON.stringify(a.projectContent()), before);
  const frame = nodes.get("#print-diagram").children[0];
  assert.equal(frame.className, "print-viewport");
  assert.equal(frame.style.width, "900px");
  assert.equal(frame.style.height, "600px");
  assert.equal(frame.children[0].style.transform, "translate(-150px, -75px) scale(3)");
  const pages = nodes.get("#print-sheet").children;
  assert.equal(pages[0].children[0].textContent, "Перечень оборудования");
  assert.ok(pages[0].children.some(child => child.textContent === "Камеры"));
  for (const cabinet of a.state.cabinets) {
    assert.ok(pages.some(page => page.children[0].textContent.startsWith(`Схема узла · ${cabinet.name}`)));
  }
});

test("camera states set map colors, persist and migrate old active flags", () => {
  const { api: a, nodes } = setup();
  const camera = a.state.cameras[0];
  a.state.selectedCameraId = camera.id;
  for (const [status, color] of [["active", "#16a34a"], ["alarm", "#dc2626"], ["problem", "#eab308"], ["off", "#111111"], ["removed", "#9ca3af"]]) {
    nodes.get("#camera-status").handlers.change({ target: { value: status } });
    assert.equal(camera.status, status);
    const object = nodes.get("#objects-layer").children.find(el => el.className === "camera-object");
    assert.equal(object.dataset.status, status);
    assert.equal(object.children[1].children[0].style["--camera-color"], color);
    const loaded = a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() });
    assert.equal(loaded.cameras[0].status, status);
  }
  const project = a.projectContent();
  delete project.cameras[0].status; project.cameras[0].active = false;
  delete project.cameras[1].status; project.cameras[1].active = true;
  project.cabinets[0].card = { open: true, x: 1, y: 2 };
  const loaded = a.normalizeProject({ format: "camera-map-project", version: 1, project });
  assert.equal(loaded.cameras[0].status, "off");
  assert.equal(loaded.cameras[1].status, "active");
  assert.equal("card" in loaded.cabinets[0], false);
  assert.equal(loaded.cabinets[0].equipment.length, 1);
  assert.equal("card" in a.projectContent().cabinets[0], false);
});

test("large cabinet schemes shrink onto exactly one page per cabinet", () => {
  const { api: a, nodes } = setup();
  a.state.cabinets[0].schemeLayout = { scale: 1, positions: { "device:equipment1": { x: 6000, y: 5000 } } };
  a.preparePrintSheet();
  const pages = nodes.get("#print-sheet").children.filter(page => page.children[0].textContent.startsWith("Схема узла"));
  assert.equal(pages.length, a.state.cabinets.length);
  const transform = pages[0].children[1].children[0].style.transform;
  const scale = Number(transform.match(/scale\(([^)]+)\)/)[1]);
  assert.ok(scale > 0 && scale < 0.7);
  for (const page of pages) assert.doesNotMatch(page.children[0].textContent, /часть/);
});

test("free cable endpoints bind to objects, follow them and survive reopening", () => {
  const { api: a } = setup();
  const cable = { id: "cable4", type: "copper", sourceKind: "point", sourceId: "point", sourcePoint: { x: 12, y: 10 }, routePoints: [{ x: 50, y: 50 }, { x: 80, y: 80 }], viaMountIds: [], targetCabinetId: null };
  a.state.cables.push(cable);
  assert.equal(a.bindCableEndpoint(cable, "source", cable.sourcePoint), true);
  assert.equal(cable.sourceKind, "camera");
  assert.equal(cable.sourceId, "c1");
  assert.equal(a.bindCableEndpoint(cable, "target", cable.routePoints.at(-1)), true);
  assert.equal(cable.targetCabinetId, "cabinet2");
  assert.equal(cable.routePoints.length, 1);
  a.state.cameras[0].x = 17;
  assert.equal(a.cableRouteNodes(cable)[0].x, 17);
  const loaded = a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() });
  assert.equal(loaded.cables.at(-1).targetCabinetId, "cabinet2");
  const reverse = { ...cable, sourceKind: "cabinet", sourceId: "cabinet2", targetCabinetId: null, routePoints: [{ x: 20, y: 20 }] };
  assert.equal(a.bindCableEndpoint(reverse, "target", reverse.routePoints[0]), true);
  assert.equal(reverse.targetCameraId, "c2");
  a.state.cables[3] = reverse;
  assert.equal(a.normalizeProject({ format: "camera-map-project", version: 1, project: a.projectContent() }).cables[3].targetCameraId, "c2");
});

test("keyboard leaves text, selects and modal forms to native editing", () => {
  const { api: a, document } = setup();
  a.state.selectedCameraId = "c1";
  let prevented = false;
  for (const key of ["Delete", "z", "y", "Enter"]) {
    document.handlers.keydown({ key, ctrlKey: true, target: { closest() { return {}; } }, preventDefault() { prevented = true; } });
  }
  assert.equal(prevented, false);
  assert.equal(a.state.cameras.length, 2);
});

test("saved viewport is restored instead of fitting the whole map", async () => {
  const { api: a } = setup({ fileIO: true });
  a.state.view = { x: -150, y: -75, scale: 3 };
  a.state.workspaceSize = { width: 900, height: 600 };
  const payload = { format: "camera-map-project", version: 1, project: a.projectContent() };
  a.state.view = { x: 0, y: 0, scale: 1 };
  await a.openProject({ name: "viewport.cmap", text: async () => JSON.stringify(payload) });
  assert.equal(a.state.view.x, -150);
  assert.equal(a.state.view.y, -75);
  assert.equal(a.state.view.scale, 3);
  assert.equal(a.state.fitted, false);
  delete payload.project.settings.viewport;
  assert.equal(a.normalizeProject(payload).settings.viewport, null);
});

test("every save asks for a destination and cancellation or failure preserves project identity", async () => {
  const { api: a, window, nodes } = setup({ fileIO: true });
  const saved = [];
  const handle = name => ({ name, async createWritable() { return { async write(blob) { saved.push(JSON.parse(await blob.text())); }, async close() {} }; } });
  const original = handle("original.cmap"), copy = handle("copy.cmap");
  a.state.projectFileHandle = original;
  a.state.projectFileName = original.name;
  const requests = [];
  window.showSaveFilePicker = async options => { requests.push(options); return requests.length === 1 ? original : copy; };
  await a.saveProject();
  await a.saveProject();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].suggestedName, "original.cmap");
  assert.equal(requests[1].startIn, original);
  assert.equal(a.state.projectFileHandle, copy);
  assert.equal(a.state.projectName, "copy");
  assert.equal(saved[1].project.name, "copy");
  a.state.cameras[0].name = "Unsaved change";
  window.showSaveFilePicker = async () => { throw Object.assign(new Error("Canceled"), { name: "AbortError" }); };
  await a.saveProject();
  assert.equal(saved.length, 2);
  assert.equal(a.state.projectFileHandle, copy);
  assert.equal(a.state.projectName, "copy");
  window.showSaveFilePicker = async () => ({ name: "failed.cmap", async createWritable() { throw new Error("Write failed"); } });
  await a.saveProject();
  assert.equal(a.state.projectName, "copy");
  assert.equal(a.state.projectFileName, "copy.cmap");
  assert.equal(nodes.get("#error-message").hidden, false);
});

test("device selection exposes toolbar deletion and double click reveals its inventory description", () => {
  const { api: a, nodes } = setup();
  a.state.activeWorkspace = "cabinet:cabinet1";
  a.assignCablePort(a.state.cables[0], a.state.cabinets[0], "equipment1", 1);
  a.resetHistory();
  a.renderCabinetScheme();
  const flatten = el => [el, ...el.children.flatMap(flatten)];
  const panel = nodes.get("#cabinet-scheme-panel");
  let elements = flatten(panel);
  const device = elements.find(el => el.className === "scheme-node scheme-node--device");
  const remove = elements.find(el => el.textContent === "Удалить устройство");
  assert.equal(remove.hidden, true);
  assert.equal(elements.some(el => el.className === "scheme-device-edit"), false);
  device.handlers.click({ target: { closest() { return null; } } });
  assert.equal(remove.hidden, false);
  nodes.get("#equipment-search").value = "Hidden by search";
  device.handlers.dblclick({ target: { closest() { return null; } }, preventDefault() {} });
  assert.equal(a.state.activeWorkspace, "equipment");
  assert.equal(nodes.get("#equipment-search").value, "");
  const description = nodes.get("#inventory-equipment-equipment1-note");
  assert.equal(description.focused, true);
  assert.equal(description.scrolledIntoView.block, "center");
  a.state.activeWorkspace = "cabinet:cabinet1";
  a.renderCabinetScheme();
  elements = flatten(panel);
  elements.find(el => el.textContent === "Удалить устройство").handlers.click();
  assert.equal(a.state.cabinets[0].equipment.length, 0);
  assert.equal(a.state.cables[0].targetConnection, null);
  assert.equal(a.state.cabinets[1].equipment.length, 1);
  a.undo();
  assert.equal(a.state.cabinets[0].equipment.length, 1);
  assert.equal(a.state.cables[0].targetConnection.port, 1);
});

test("camera and cabinet blocks reveal their inventory rows and offer confirmed object deletion", () => {
  for (const [kind, id, title, removeLabel] of [["camera", "c1", "Камера · Camera 1", "Удалить камеру"], ["cabinet", "cabinet2", "Узел · Cabinet 2", "Удалить узел"]]) {
    const { api: a, nodes, window } = setup();
    a.state.activeWorkspace = "cabinet:cabinet1";
    a.resetHistory(); a.renderCabinetScheme();
    const flatten = el => [el, ...el.children.flatMap(flatten)];
    const elements = () => flatten(nodes.get("#cabinet-scheme-panel"));
    const getCard = () => elements().find(el => el.className === "scheme-node scheme-node--external" && el.children[0].textContent === title);
    const card = getCard();
    card.handlers.click();
    const remove = elements().find(el => el.textContent === removeLabel);
    assert.equal(remove.hidden, false);
    assert.equal(getCard(), card, "first click retains the element for a native double click");
    card.handlers.dblclick({ preventDefault() {} });
    assert.equal(a.state.activeWorkspace, "equipment");
    assert.equal(nodes.get(`#inventory-${kind}-${id}-note`).focused, true);
    a.state.activeWorkspace = "cabinet:cabinet1";
    a.renderCabinetScheme(); getCard().handlers.click();
    window.confirm = () => false;
    elements().find(el => el.textContent === removeLabel).handlers.click();
    assert.ok((kind === "camera" ? a.state.cameras : a.state.cabinets).some(item => item.id === id));
    window.confirm = () => true;
    elements().find(el => el.textContent === removeLabel).handlers.click();
    assert.equal((kind === "camera" ? a.state.cameras : a.state.cabinets).some(item => item.id === id), false);
    assert.ok(a.state.cabinets.some(item => item.id === "cabinet1"));
    assert.equal(a.state.cables.some(cable => kind === "camera" ? cable.sourceId === id || cable.targetCameraId === id : cable.sourceId === id || cable.targetCabinetId === id), false);
    a.undo();
    assert.ok((kind === "camera" ? a.state.cameras : a.state.cabinets).some(item => item.id === id));
  }
});
