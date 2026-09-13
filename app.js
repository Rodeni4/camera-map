(function () {
  "use strict";

  const AppMath = {
    fit(viewWidth, viewHeight, imageWidth, imageHeight, padding = 24) {
      const availableWidth = Math.max(1, viewWidth - padding * 2);
      const availableHeight = Math.max(1, viewHeight - padding * 2);
      const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
      return {
        scale,
        x: (viewWidth - imageWidth * scale) / 2,
        y: (viewHeight - imageHeight * scale) / 2,
      };
    },

    zoomAt(view, cursorX, cursorY, nextScale) {
      const sceneX = (cursorX - view.x) / view.scale;
      const sceneY = (cursorY - view.y) / view.scale;
      return {
        scale: nextScale,
        x: cursorX - sceneX * nextScale,
        y: cursorY - sceneY * nextScale,
      };
    },

    toScene(view, viewportX, viewportY) {
      return {
        x: (viewportX - view.x) / view.scale,
        y: (viewportY - view.y) / view.scale,
      };
    },

    sectorPath(angle, radius) {
      const half = angle / 2 * Math.PI / 180;
      const startX = radius * Math.cos(-half);
      const startY = radius * Math.sin(-half);
      const endX = radius * Math.cos(half);
      const endY = radius * Math.sin(half);
      return `M 0 0 L ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY} Z`;
    },

    rangeFromPoint(origin, point, direction, min, max) {
      const radians = direction * Math.PI / 180;
      const projected = (point.x - origin.x) * Math.cos(radians) +
        (point.y - origin.y) * Math.sin(radians);
      return Math.min(max, Math.max(min, projected));
    },

    closestPointOnRect(point, rect) {
      const right = rect.x + rect.width;
      const bottom = rect.y + rect.height;
      const insideX = point.x >= rect.x && point.x <= right;
      const insideY = point.y >= rect.y && point.y <= bottom;
      if (!insideX || !insideY) {
        return {
          x: Math.min(right, Math.max(rect.x, point.x)),
          y: Math.min(bottom, Math.max(rect.y, point.y)),
        };
      }
      const edges = [
        { distance: point.x - rect.x, x: rect.x, y: point.y },
        { distance: right - point.x, x: right, y: point.y },
        { distance: point.y - rect.y, x: point.x, y: rect.y },
        { distance: bottom - point.y, x: point.x, y: bottom },
      ];
      edges.sort((a, b) => a.distance - b.distance);
      return { x: edges[0].x, y: edges[0].y };
    },

    clampGroupDelta(points, dx, dy, width, height) {
      const minDx = Math.max(...points.map((point) => -point.x));
      const maxDx = Math.min(...points.map((point) => width - point.x));
      const minDy = Math.max(...points.map((point) => -point.y));
      const maxDy = Math.min(...points.map((point) => height - point.y));
      return {
        x: Math.min(maxDx, Math.max(minDx, dx)),
        y: Math.min(maxDy, Math.max(minDy, dy)),
      };
    },

    cableLaneOffset(index, count, viewScale, gap = 5) {
      return (index - (count - 1) / 2) * gap / viewScale;
    },

    cableStrokeWidth(count, thin = 1.25, thick = 3) {
      return count > 1 ? thick : thin;
    },

    cableHitWidth(typeCount, single = 12, adjacent = 6) {
      return typeCount > 1 ? adjacent : single;
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AppMath;
  if (typeof document === "undefined") return;

  const elements = {
    fileInput: document.querySelector("#map-file"),
    projectFileInput: document.querySelector("#project-file"),
    newProjectButton: document.querySelector("#new-project"),
    openProjectButton: document.querySelector("#open-project"),
    saveProjectButton: document.querySelector("#save-project"),
    undoButton: document.querySelector("#undo-action"),
    redoButton: document.querySelector("#redo-action"),
    projectStatus: document.querySelector("#project-status"),
    fitButton: document.querySelector("#fit-button"),
    workspace: document.querySelector("#workspace"),
    emptyState: document.querySelector("#empty-state"),
    placementHint: document.querySelector("#placement-hint"),
    cableTypePicker: document.querySelector("#cable-type-picker"),
    chooseFiberCable: document.querySelector("#choose-fiber-cable"),
    chooseCopperCable: document.querySelector("#choose-copper-cable"),
    cancelCableType: document.querySelector("#cancel-cable-type"),
    scene: document.querySelector("#scene"),
    mapImage: document.querySelector("#map-image"),
    objectsLayer: document.querySelector("#objects-layer"),
    status: document.querySelector("#status"),
    zoomStatus: document.querySelector("#zoom-status"),
    elementScaleInput: document.querySelector("#element-scale"),
    elementScaleValue: document.querySelector("#element-scale-value"),
    error: document.querySelector("#error-message"),
    cameraTool: document.querySelector("#camera-tool"),
    poleTool: document.querySelector("#pole-tool"),
    mountTool: document.querySelector("#mount-tool"),
    cabinetTool: document.querySelector("#cabinet-tool"),
    cableTool: document.querySelector("#cable-tool"),
    objectList: document.querySelector("#object-list"),
    cameraProperties: document.querySelector("#camera-properties"),
    nameInput: document.querySelector("#camera-name"),
    modelInput: document.querySelector("#camera-model"),
    ipInput: document.querySelector("#camera-ip"),
    macInput: document.querySelector("#camera-mac"),
    fovInput: document.querySelector("#camera-fov"),
    fovNumber: document.querySelector("#camera-fov-number"),
    rangeInput: document.querySelector("#camera-range"),
    rangeNumber: document.querySelector("#camera-range-number"),
    cameraMountRow: document.querySelector("#camera-mount-row"),
    cameraMountName: document.querySelector("#camera-mount-name"),
    detachCamera: document.querySelector("#detach-camera"),
    deleteCamera: document.querySelector("#delete-camera"),
    closeProperties: document.querySelector("#close-properties"),
    mountProperties: document.querySelector("#mount-properties"),
    mountPropertiesTitle: document.querySelector("#mount-properties-title"),
    mountPropertiesType: document.querySelector("#mount-properties-type"),
    mountNameInput: document.querySelector("#mount-name"),
    mountConnections: document.querySelector("#mount-connections"),
    mountedCableGroup: document.querySelector("#mounted-cable-group"),
    mountedCableCount: document.querySelector("#mounted-cable-count"),
    mountedCableList: document.querySelector("#mounted-cable-list"),
    mountedCameraGroup: document.querySelector("#mounted-camera-group"),
    mountedCameraCount: document.querySelector("#mounted-camera-count"),
    mountedCameraList: document.querySelector("#mounted-camera-list"),
    addMountedCamera: document.querySelector("#add-mounted-camera"),
    mountCameraMenu: document.querySelector("#mount-camera-menu"),
    addNewMountedCamera: document.querySelector("#add-new-mounted-camera"),
    freeCameraList: document.querySelector("#free-camera-list"),
    deleteMount: document.querySelector("#delete-mount"),
    closeMountProperties: document.querySelector("#close-mount-properties"),
    cabinetProperties: document.querySelector("#cabinet-properties"),
    cabinetNameInput: document.querySelector("#cabinet-name"),
    openCabinetCard: document.querySelector("#open-cabinet-card"),
    deleteCabinet: document.querySelector("#delete-cabinet"),
    closeCabinetProperties: document.querySelector("#close-cabinet-properties"),
    cableProperties: document.querySelector("#cable-properties"),
    cableNameInput: document.querySelector("#cable-name"),
    cableType: document.querySelector("#cable-type"),
    cableSource: document.querySelector("#cable-source"),
    cableTarget: document.querySelector("#cable-target"),
    deleteCable: document.querySelector("#delete-cable"),
    closeCableProperties: document.querySelector("#close-cable-properties"),
    propertiesPopover: document.querySelector("#properties-popover"),
  };

  elements.propertiesPopover.append(
    elements.cameraProperties,
    elements.mountProperties,
    elements.cabinetProperties,
    elements.cableProperties,
  );

  const state = {
    imageUrl: null,
    imageData: null,
    imageToken: 0,
    mapFileName: null,
    mapMimeType: null,
    imageWidth: 0,
    imageHeight: 0,
    view: { x: 0, y: 0, scale: 1 },
    fitScale: 1,
    elementScale: 1,
    fitted: false,
    workspaceSize: { width: 0, height: 0 },
    dragging: false,
    pointerId: null,
    lastPointer: { x: 0, y: 0 },
    cameras: [],
    mounts: [],
    cabinets: [],
    cables: [],
    nextCameraId: 1,
    nextMountId: 1,
    nextPoleNumber: 1,
    nextPointNumber: 1,
    nextCabinetId: 1,
    nextEquipmentId: 1,
    nextCableId: 1,
    nextCopperNumber: 1,
    nextFiberNumber: 1,
    selectedCameraId: null,
    selectedMountId: null,
    selectedCabinetId: null,
    selectedCableId: null,
    activeTool: null,
    cameraMountId: null,
    objectInteraction: null,
    snapTargetId: null,
    cableDraft: null,
    pendingCableSourceId: null,
    lastCabinetPointerDown: null,
    lastCardResizePointerDown: null,
    projectName: "Новый проект",
    projectFileName: null,
    projectFileHandle: null,
    cleanFingerprint: "",
    isDirty: false,
    undoStack: [],
    redoStack: [],
    historySnapshot: null,
    historyCoalesceKey: null,
    applyingHistory: false,
  };

  const SVG_NS = "http://www.w3.org/2000/svg";
  const PROJECT_FORMAT = "camera-map-project";
  const PROJECT_VERSION = 1;
  const HISTORY_LIMIT = 100;
  const PROJECT_FILE_PICKER_OPTIONS = {
    types: [{
      description: "Проект Camera Map",
      accept: { "application/json": [".cmap"] },
    }],
    excludeAcceptAllOption: true,
  };
  const MIN_CAMERA_RANGE_PERCENT = 5;
  const DEFAULT_CAMERA_RANGE_PERCENT = 20;
  const ROTATION_HANDLE_GAP = 32;
  const CABINET_CARD_WIDTH = 340;
  const MIN_CABINET_CARD_WIDTH = 260;
  const MAX_CABINET_CARD_WIDTH = 620;
  const CABINET_CARD_HEADER_HEIGHT = 34;
  const CABINET_CARD_HEIGHT = 98;
  const EQUIPMENT_TYPES = [
    { id: "wifi-router", name: "Wi-Fi-роутер", icon: "≋" },
    { id: "switch", name: "Коммутатор", icon: "▦" },
    { id: "poe-switch", name: "PoE-коммутатор", icon: "P" },
    { id: "nvr", name: "Видеорегистратор", icon: "●" },
    { id: "optical-cross", name: "Оптический кросс", icon: "✣" },
    { id: "optical-device", name: "Оптическое устройство", icon: "⇄" },
    { id: "other", name: "Другое оборудование", icon: "◇" },
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function fileNameWithoutExtension(fileName) {
    return String(fileName || "").replace(/\.[^.]+$/, "").trim();
  }

  function safeProjectFileName(name) {
    const safeName = String(name || "Проект камер")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .trim()
      .replace(/[. ]+$/, "") || "Проект камер";
    return `${safeName}.cmap`;
  }

  function serializableCard(cabinet) {
    const card = getCabinetCard(cabinet);
    return {
      open: card.open,
      collapsed: card.collapsed,
      x: card.x,
      y: card.y,
      width: card.width,
    };
  }

  function serializableCabinet(cabinet) {
    return {
      id: cabinet.id,
      name: cabinet.name,
      x: cabinet.x,
      y: cabinet.y,
      equipment: cabinetEquipment(cabinet).map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        model: item.model,
        ip: item.ip,
        ports: item.ports,
        note: item.note,
      })),
      card: serializableCard(cabinet),
    };
  }

  function projectContent(includeImage = true) {
    return {
      name: state.projectName,
      map: {
        fileName: state.mapFileName,
        mimeType: state.mapMimeType,
        width: state.imageWidth,
        height: state.imageHeight,
        ...(includeImage ? { dataUrl: state.imageData } : { token: state.imageToken }),
      },
      settings: {
        elementScale: state.elementScale,
      },
      counters: {
        nextCameraId: state.nextCameraId,
        nextMountId: state.nextMountId,
        nextPoleNumber: state.nextPoleNumber,
        nextPointNumber: state.nextPointNumber,
        nextCabinetId: state.nextCabinetId,
        nextEquipmentId: state.nextEquipmentId,
        nextCableId: state.nextCableId,
        nextCopperNumber: state.nextCopperNumber,
        nextFiberNumber: state.nextFiberNumber,
      },
      cameras: state.cameras.map((camera) => ({ ...camera })),
      mounts: state.mounts.map((mount) => ({ ...mount })),
      cabinets: state.cabinets.map(serializableCabinet),
      cables: state.cables.map((cable) => ({ ...cable, viaMountIds: [...cable.viaMountIds] })),
    };
  }

  function currentFingerprint() {
    return JSON.stringify(projectContent(false));
  }

  function updateProjectStatus() {
    const suffix = state.isDirty ? " · не сохранён" : "";
    elements.projectStatus.textContent = `${state.projectName}${suffix}`;
    elements.projectStatus.classList.toggle("is-dirty", state.isDirty);
    elements.projectStatus.title = state.isDirty
      ? `${state.projectName}: есть несохранённые изменения`
      : state.projectName;
    elements.saveProjectButton.disabled = !state.imageWidth;
    document.title = `${state.isDirty ? "● " : ""}${state.projectName} — Редактор карты камер`;
  }

  function refreshDirtyState() {
    state.isDirty = currentFingerprint() !== state.cleanFingerprint;
    updateProjectStatus();
  }

  function markProjectClean() {
    state.cleanFingerprint = currentFingerprint();
    state.isDirty = false;
    updateProjectStatus();
  }

  function captureHistorySnapshot() {
    const content = projectContent(false);
    return {
      settings: content.settings,
      counters: content.counters,
      cameras: content.cameras,
      mounts: content.mounts,
      cabinets: content.cabinets,
      cables: content.cables,
    };
  }

  function cloneHistorySnapshot(snapshot) {
    return JSON.parse(JSON.stringify(snapshot));
  }

  function historyFingerprint(snapshot) {
    return JSON.stringify(snapshot);
  }

  function updateHistoryButtons() {
    elements.undoButton.disabled = state.undoStack.length === 0;
    elements.redoButton.disabled = state.redoStack.length === 0;
  }

  function resetHistory() {
    state.undoStack = [];
    state.redoStack = [];
    state.historySnapshot = captureHistorySnapshot();
    state.historyCoalesceKey = null;
    updateHistoryButtons();
  }

  function historyInputKey(target) {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return null;
    if (target.id) return `input:${target.id}`;
    const equipment = target.closest("[data-equipment-id]");
    const field = target.closest("[class*='cabinet-equipment-field--']")?.className || target.tagName;
    return equipment ? `equipment:${equipment.dataset.equipmentId}:${field}` : `input:${field}`;
  }

  function recordHistory(coalesceKey = null) {
    if (state.applyingHistory) return;
    const next = captureHistorySnapshot();
    if (!state.historySnapshot) {
      state.historySnapshot = next;
      state.historyCoalesceKey = coalesceKey;
      updateHistoryButtons();
      return;
    }
    if (historyFingerprint(next) === historyFingerprint(state.historySnapshot)) {
      if (!coalesceKey) state.historyCoalesceKey = null;
      return;
    }
    if (!coalesceKey || state.historyCoalesceKey !== coalesceKey) {
      state.undoStack.push(state.historySnapshot);
      if (state.undoStack.length > HISTORY_LIMIT) state.undoStack.shift();
    }
    state.historySnapshot = next;
    state.historyCoalesceKey = coalesceKey;
    state.redoStack = [];
    updateHistoryButtons();
  }

  function applyHistorySnapshot(snapshot) {
    state.applyingHistory = true;
    const selected = {
      cameraId: state.selectedCameraId,
      mountId: state.selectedMountId,
      cabinetId: state.selectedCabinetId,
      cableId: state.selectedCableId,
    };
    setActiveTool(null);
    const restored = cloneHistorySnapshot(snapshot);
    state.elementScale = restored.settings.elementScale;
    Object.assign(state, restored.counters);
    state.cameras = restored.cameras;
    state.mounts = restored.mounts;
    state.cabinets = restored.cabinets;
    state.cables = restored.cables;
    state.selectedCameraId = state.cameras.some((item) => item.id === selected.cameraId) ? selected.cameraId : null;
    state.selectedMountId = state.mounts.some((item) => item.id === selected.mountId) ? selected.mountId : null;
    state.selectedCabinetId = state.cabinets.some((item) => item.id === selected.cabinetId) ? selected.cabinetId : null;
    state.selectedCableId = state.cables.some((item) => item.id === selected.cableId) ? selected.cableId : null;
    state.objectInteraction = null;
    state.snapTargetId = null;
    state.lastCabinetPointerDown = null;
    state.lastCardResizePointerDown = null;
    elements.elementScaleInput.value = String(Math.round(state.elementScale * 100));
    elements.elementScaleValue.value = `${Math.round(state.elementScale * 100)}%`;
    renderView();
    refreshEditor();
    state.applyingHistory = false;
    state.historySnapshot = captureHistorySnapshot();
    state.historyCoalesceKey = null;
    refreshDirtyState();
    updateHistoryButtons();
  }

  function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(captureHistorySnapshot());
    const previous = state.undoStack.pop();
    applyHistorySnapshot(previous);
  }

  function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(captureHistorySnapshot());
    if (state.undoStack.length > HISTORY_LIMIT) state.undoStack.shift();
    const next = state.redoStack.pop();
    applyHistorySnapshot(next);
  }

  function getCamera(id) {
    return state.cameras.find((camera) => camera.id === id) || null;
  }

  function getMount(id) {
    return state.mounts.find((mount) => mount.id === id) || null;
  }

  function getCabinet(id) {
    return state.cabinets.find((cabinet) => cabinet.id === id) || null;
  }

  function getCabinetCard(cabinet) {
    if (!cabinet.card) {
      cabinet.card = { open: false, collapsed: false, x: null, y: null, addMenuOpen: false, editingEquipmentId: null };
    }
    if (typeof cabinet.card.addMenuOpen !== "boolean") cabinet.card.addMenuOpen = false;
    if (!("editingEquipmentId" in cabinet.card)) cabinet.card.editingEquipmentId = null;
    if (!Number.isFinite(cabinet.card.width)) cabinet.card.width = CABINET_CARD_WIDTH;
    return cabinet.card;
  }

  function equipmentType(typeId) {
    return EQUIPMENT_TYPES.find((type) => type.id === typeId) || EQUIPMENT_TYPES[EQUIPMENT_TYPES.length - 1];
  }

  function cabinetEquipment(cabinet) {
    if (!Array.isArray(cabinet.equipment)) cabinet.equipment = [];
    return cabinet.equipment;
  }

  function equipmentCountText(count) {
    const lastTwo = count % 100;
    const last = count % 10;
    if (last === 1 && lastTwo !== 11) return `${count} устройство`;
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} устройства`;
    return `${count} устройств`;
  }

  function cameraCountText(count) {
    const lastTwo = count % 100;
    const last = count % 10;
    if (last === 1 && lastTwo !== 11) return `${count} камера`;
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} камеры`;
    return `${count} камер`;
  }

  function addEquipment(cabinet, typeId) {
    const type = equipmentType(typeId);
    const equipmentList = cabinetEquipment(cabinet);
    const sameTypeCount = equipmentList.filter((item) => item.type === type.id).length;
    const equipment = {
      id: `equipment${state.nextEquipmentId++}`,
      type: type.id,
      name: `${type.name} ${sameTypeCount + 1}`,
      model: "",
      ip: "",
      ports: "",
      note: "",
    };
    equipmentList.push(equipment);
    const card = getCabinetCard(cabinet);
    card.addMenuOpen = false;
    card.editingEquipmentId = equipment.id;
    renderObjects();
  }

  function openCabinetCard(cabinet) {
    const card = getCabinetCard(cabinet);
    if (!Number.isFinite(card.x) || !Number.isFinite(card.y)) {
      const rect = elements.workspace.getBoundingClientRect();
      const openCount = state.cabinets.filter((item) => getCabinetCard(item).open).length;
      const cabinetScreenX = state.view.x + cabinet.x * state.view.scale;
      const cabinetScreenY = state.view.y + cabinet.y * state.view.scale;
      const cascade = openCount * 22;
      const cardScreenWidth = card.width * state.elementScale;
      const cardScreenHeight = CABINET_CARD_HEIGHT * state.elementScale;
      const maxLeft = Math.max(12, rect.width - cardScreenWidth - 12);
      const desiredLeft = clamp(cabinetScreenX + 42 + cascade, 12, maxLeft);
      const desiredTop = clamp(cabinetScreenY - 30 + cascade, 12, Math.max(12, rect.height - cardScreenHeight - 12));
      const scenePoint = AppMath.toScene(state.view, desiredLeft, desiredTop);
      card.x = scenePoint.x;
      card.y = scenePoint.y;
    }
    card.open = true;
    card.collapsed = false;
    selectCabinet(cabinet.id);
  }

  function closeCabinetCard(cabinet) {
    const card = getCabinetCard(cabinet);
    card.open = false;
    card.addMenuOpen = false;
    card.editingEquipmentId = null;
    renderObjects();
    syncProperties();
  }

  function getCable(id) {
    return state.cables.find((cable) => cable.id === id) || null;
  }

  function cameraRangeLimits() {
    const base = Math.max(1, Math.min(state.imageWidth, state.imageHeight));
    const max = Math.max(base * MIN_CAMERA_RANGE_PERCENT / 100, Math.hypot(state.imageWidth, state.imageHeight));
    return {
      base,
      min: base * MIN_CAMERA_RANGE_PERCENT / 100,
      max,
      maxPercent: Math.max(MIN_CAMERA_RANGE_PERCENT, Math.ceil(max / base * 100)),
    };
  }

  function normalizeCameraRange(camera) {
    const limits = cameraRangeLimits();
    const fallback = limits.base * DEFAULT_CAMERA_RANGE_PERCENT / 100;
    camera.range = clamp(Number(camera.range) || fallback, limits.min, limits.max);
    return camera.range;
  }

  function cameraRangePercent(camera) {
    return normalizeCameraRange(camera) / cameraRangeLimits().base * 100;
  }

  function rangeResizeCursor(direction) {
    const angle = ((direction % 180) + 180) % 180;
    if (angle < 22.5 || angle >= 157.5) return "ew-resize";
    if (angle < 67.5) return "nwse-resize";
    if (angle < 112.5) return "ns-resize";
    return "nesw-resize";
  }

  function mountTypeName(type) {
    return type === "pole" ? "Столб" : "Точка крепления";
  }

  function renderView() {
    const { x, y, scale } = state.view;
    elements.scene.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    elements.objectsLayer.style.setProperty("--ui-scale", String(1 / scale));
    elements.objectsLayer.style.setProperty("--element-scale", String(state.elementScale));
    elements.objectsLayer.style.setProperty("--card-scale", String(state.elementScale / scale));
    elements.objectsLayer.style.setProperty("--tooltip-scale", String(1 / (scale * state.elementScale)));
    elements.zoomStatus.textContent = `Масштаб: ${Math.round(scale * 100)}%`;
  }

  function fitMap() {
    if (!state.imageWidth || !state.imageHeight) return;
    const rect = elements.workspace.getBoundingClientRect();
    state.view = AppMath.fit(rect.width, rect.height, state.imageWidth, state.imageHeight);
    state.fitScale = state.view.scale;
    state.fitted = true;
    state.workspaceSize = { width: rect.width, height: rect.height };
    renderView();
    renderObjects();
  }

  function makeSvg(name, attributes = {}) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function makeCameraIcon() {
    const svg = makeSvg("svg", { viewBox: "0 0 32 32", "aria-hidden": "true" });
    svg.append(makeSvg("path", {
      d: "M6 11h13a3 3 0 0 1 3 3v7H9a3 3 0 0 1-3-3v-7Zm16 4 7-3.5v12L22 20v-5Z",
    }));
    return svg;
  }

  function appendAttachmentLine(camera, mount) {
    const dx = camera.x - mount.x;
    const dy = camera.y - mount.y;
    const line = document.createElement("div");
    line.className = "attachment-line";
    line.style.left = `${mount.x}px`;
    line.style.top = `${mount.y}px`;
    line.style.width = `${Math.hypot(dx, dy)}px`;
    line.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
    elements.objectsLayer.append(line);
  }

  function routeNode(kind, id) {
    if (kind === "camera") {
      const camera = getCamera(id);
      return camera ? { key: `camera:${id}`, x: camera.x, y: camera.y } : null;
    }
    if (kind === "cabinet") {
      const cabinet = getCabinet(id);
      return cabinet ? { key: `cabinet:${id}`, x: cabinet.x, y: cabinet.y } : null;
    }
    const mount = getMount(id);
    return mount ? { key: `mount:${id}`, x: mount.x, y: mount.y } : null;
  }

  function cableRouteNodes(cable) {
    const nodes = [routeNode(cable.sourceKind, cable.sourceId)];
    cable.viaMountIds.forEach((id) => nodes.push(routeNode("mount", id)));
    if (cable.targetCabinetId) nodes.push(routeNode("cabinet", cable.targetCabinetId));
    return nodes.filter(Boolean).filter((node, index, all) => index === 0 || node.key !== all[index - 1].key);
  }

  function cableTypeName(type) {
    return type === "copper" ? "Витая пара уличная" : "Оптоволокно";
  }

  function buildCableBundles() {
    const segments = new Map();
    state.cables.forEach((cable) => {
      const nodes = cableRouteNodes(cable);
      for (let index = 0; index < nodes.length - 1; index += 1) {
        const first = nodes[index];
        const second = nodes[index + 1];
        const [start, end] = first.key < second.key ? [first, second] : [second, first];
        const key = `${start.key}|${end.key}`;
        if (!segments.has(key)) segments.set(key, { key, start, end, types: new Map() });
        const segment = segments.get(key);
        if (!segment.types.has(cable.type)) segment.types.set(cable.type, []);
        const cableIds = segment.types.get(cable.type);
        if (!cableIds.includes(cable.id)) cableIds.push(cable.id);
      }
    });

    const typeOrder = ["copper", "fiber"];
    const bundles = [];
    segments.forEach((segment) => {
      const presentTypes = typeOrder.filter((type) => segment.types.has(type));
      presentTypes.forEach((type, index) => {
        bundles.push({
          ...segment,
          type,
          cableIds: segment.types.get(type),
          typeCount: presentTypes.length,
          laneOffset: AppMath.cableLaneOffset(index, presentTypes.length, state.view.scale, 6),
        });
      });
    });
    return bundles;
  }

  function cableBundlePath(bundle) {
    const { start, end, laneOffset } = bundle;
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (!distance) return "";
    const offsetX = -(end.y - start.y) / distance * laneOffset;
    const offsetY = (end.x - start.x) / distance * laneOffset;
    return `M ${start.x + offsetX} ${start.y + offsetY} L ${end.x + offsetX} ${end.y + offsetY}`;
  }

  function cableCountText(count) {
    const lastTwo = count % 100;
    const last = count % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return `${count} кабелей`;
    if (last === 1) return `${count} кабель`;
    if (last >= 2 && last <= 4) return `${count} кабеля`;
    return `${count} кабелей`;
  }

  function cableBundleTitle(bundle) {
    const type = bundle.type === "copper" ? "Витая пара" : "Оптика";
    const names = bundle.cableIds.map((id) => getCable(id)?.name).filter(Boolean);
    return `${type} · ${cableCountText(bundle.cableIds.length)}${names.length ? `\n${names.join("\n")}` : ""}`;
  }

  function appendCableBundleLine(svg, bundle) {
    const pathData = cableBundlePath(bundle);
    if (!pathData) return;
    const line = makeSvg("path", {
      d: pathData,
      "data-segment-key": bundle.key,
      "data-cable-count": bundle.cableIds.length,
    });
    line.classList.add("cable-line", `cable-line--${bundle.type}`);
    if (bundle.cableIds.length > 1) line.classList.add("is-bundle");
    line.style.setProperty("--cable-width", `${AppMath.cableStrokeWidth(bundle.cableIds.length)}px`);
    svg.append(line);
  }

  function appendSelectedCableLine(svg, bundle) {
    if (!bundle.cableIds.includes(state.selectedCableId)) return;
    const pathData = cableBundlePath(bundle);
    if (!pathData) return;
    const line = makeSvg("path", { d: pathData, "data-cable-id": state.selectedCableId });
    line.classList.add("cable-line", "is-selected");
    svg.append(line);
  }

  function appendCableBundleHit(svg, bundle) {
    const pathData = cableBundlePath(bundle);
    if (!pathData) return;
    const hit = makeSvg("path", {
      d: pathData,
      "data-cable-ids": bundle.cableIds.join(","),
      "data-cable-type": bundle.type,
    });
    hit.classList.add("cable-hit");
    hit.style.setProperty("--cable-hit-width", `${AppMath.cableHitWidth(bundle.typeCount)}px`);
    const title = makeSvg("title");
    title.textContent = cableBundleTitle(bundle);
    hit.append(title);
    svg.append(hit);
  }

  function hideCableBundlePicker() {
    elements.workspace.querySelector(".cable-bundle-picker")?.remove();
  }

  function showCableBundlePicker(cableIds, type, clientX, clientY) {
    hideCableBundlePicker();
    const cables = cableIds.map(getCable).filter(Boolean);
    if (cables.length < 2) {
      if (cables[0]) selectCable(cables[0].id);
      return;
    }

    const picker = document.createElement("div");
    picker.className = "cable-bundle-picker";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Выбор кабеля");
    picker.addEventListener("pointerdown", (event) => event.stopPropagation());

    const heading = document.createElement("strong");
    const typeName = type === "copper" ? "Витая пара" : "Оптика";
    heading.textContent = `${typeName} · ${cableCountText(cables.length)}`;
    picker.append(heading);

    cables.forEach((cable) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = cable.name || cableTypeName(cable.type);
      if (cable.id === state.selectedCableId) button.classList.add("is-selected");
      button.addEventListener("click", () => selectCable(cable.id));
      picker.append(button);
    });

    elements.workspace.append(picker);
    const workspaceRect = elements.workspace.getBoundingClientRect();
    const pickerRect = picker.getBoundingClientRect();
    const left = clamp(clientX - workspaceRect.left + 8, 8, Math.max(8, workspaceRect.width - pickerRect.width - 8));
    const top = clamp(clientY - workspaceRect.top + 8, 8, Math.max(8, workspaceRect.height - pickerRect.height - 8));
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
    picker.querySelector("button")?.focus();
  }

  function appendCables() {
    const svg = makeSvg("svg", {
      viewBox: `0 0 ${Math.max(1, state.imageWidth)} ${Math.max(1, state.imageHeight)}`,
      preserveAspectRatio: "none",
    });
    svg.classList.add("cables-layer");
    const bundles = buildCableBundles();
    bundles.forEach((bundle) => appendCableBundleLine(svg, bundle));
    bundles.forEach((bundle) => appendSelectedCableLine(svg, bundle));
    bundles.forEach((bundle) => appendCableBundleHit(svg, bundle));

    if (state.cableDraft) {
      const nodes = cableRouteNodes(state.cableDraft);
      for (let index = 0; index < nodes.length - 1; index += 1) {
        const path = makeSvg("path", {
          d: `M ${nodes[index].x} ${nodes[index].y} L ${nodes[index + 1].x} ${nodes[index + 1].y}`,
        });
        path.classList.add("cable-line", `cable-line--${state.cableDraft.type}`, "is-draft");
        svg.append(path);
      }
    }
    elements.objectsLayer.append(svg);
  }

  function appendCamera(camera) {
    const object = document.createElement("div");
    object.className = "camera-object";
    if (camera.id === state.selectedCameraId) object.classList.add("is-selected");
    object.style.left = `${camera.x}px`;
    object.style.top = `${camera.y}px`;

    const range = normalizeCameraRange(camera);
    const sectorExtent = Math.max(200, Math.ceil(range + 4));
    const sector = makeSvg("svg", {
      viewBox: `${-sectorExtent} ${-sectorExtent} ${sectorExtent * 2} ${sectorExtent * 2}`,
    });
    sector.classList.add("camera-sector");
    sector.style.top = `${-sectorExtent}px`;
    sector.style.left = `${-sectorExtent}px`;
    sector.style.width = `${sectorExtent * 2}px`;
    sector.style.height = `${sectorExtent * 2}px`;
    sector.style.transform = `rotate(${camera.direction}deg)`;
    sector.append(makeSvg("path", {
      class: "camera-sector__fill",
      d: AppMath.sectorPath(camera.fov, range),
    }));
    object.append(sector);

    const ui = document.createElement("div");
    ui.className = "camera-ui";
    const control = document.createElement("button");
    control.type = "button";
    control.className = "camera-control";
    control.dataset.cameraId = camera.id;
    control.setAttribute("aria-label", `${camera.name || "Камера"}: ${camera.model || "модель не указана"}, ${camera.ip || "IP не указан"}`);
    control.style.transform = `translate(-50%, -50%) rotate(${camera.direction}deg)`;
    control.append(makeCameraIcon());
    ui.append(control);

    const tooltip = document.createElement("div");
    tooltip.className = "camera-tooltip";
    const name = document.createElement("strong");
    name.textContent = camera.name || "Без названия";
    const model = document.createElement("span");
    model.textContent = camera.model || "Модель не указана";
    const ip = document.createElement("span");
    ip.textContent = camera.ip || "IP не указан";
    tooltip.append(name, model, ip);
    ui.append(tooltip);

    if (camera.id === state.selectedCameraId) {
      const radians = camera.direction * Math.PI / 180;
      const rangeUiDistance = range / state.elementScale;
      const rotationGap = ROTATION_HANDLE_GAP / (state.view.scale * state.elementScale);
      const rotationUiDistance = rangeUiDistance + rotationGap;
      const line = document.createElement("div");
      line.className = "rotation-line";
      line.style.width = `${rotationUiDistance}px`;
      line.style.transform = `rotate(${camera.direction}deg)`;
      ui.append(line);

      const rangeHandle = document.createElement("button");
      rangeHandle.type = "button";
      rangeHandle.className = "range-handle";
      rangeHandle.dataset.cameraId = camera.id;
      rangeHandle.setAttribute("aria-label", "Изменить длину обзора");
      rangeHandle.title = "Изменить длину обзора";
      rangeHandle.style.left = `${Math.cos(radians) * rangeUiDistance}px`;
      rangeHandle.style.top = `${Math.sin(radians) * rangeUiDistance}px`;
      rangeHandle.style.cursor = rangeResizeCursor(camera.direction);
      rangeHandle.style.setProperty("--handle-angle", `${camera.direction}deg`);
      ui.append(rangeHandle);

      const rangeTooltip = document.createElement("span");
      rangeTooltip.className = "range-tooltip";
      if (state.objectInteraction?.type === "resizeRange" && state.objectInteraction.cameraId === camera.id) {
        rangeTooltip.classList.add("is-active");
      }
      rangeTooltip.style.left = rangeHandle.style.left;
      rangeTooltip.style.top = rangeHandle.style.top;
      rangeTooltip.textContent = `Длина: ${Math.round(cameraRangePercent(camera))}%`;
      ui.append(rangeTooltip);

      const rotationHandle = document.createElement("button");
      rotationHandle.type = "button";
      rotationHandle.className = "rotation-handle";
      rotationHandle.dataset.cameraId = camera.id;
      rotationHandle.setAttribute("aria-label", "Повернуть камеру");
      rotationHandle.title = "Повернуть камеру";
      rotationHandle.style.left = `${Math.cos(radians) * rotationUiDistance}px`;
      rotationHandle.style.top = `${Math.sin(radians) * rotationUiDistance}px`;
      ui.append(rotationHandle);
    }

    object.append(ui);
    elements.objectsLayer.append(object);
  }

  function appendMount(mount) {
    const object = document.createElement("div");
    object.className = "mount-object";
    if (mount.id === state.selectedMountId) object.classList.add("is-selected");
    if (mount.id === state.snapTargetId) object.classList.add("is-snap-target");
    object.style.left = `${mount.x}px`;
    object.style.top = `${mount.y}px`;

    const control = document.createElement("button");
    control.type = "button";
    control.className = `mount-control mount-control--${mount.type === "pole" ? "pole" : "point"}`;
    control.dataset.mountId = mount.id;
    control.setAttribute("aria-label", mount.name);
    const symbol = document.createElement("span");
    symbol.textContent = mount.type === "pole" ? "+" : "•";
    control.append(symbol);

    const tooltip = document.createElement("div");
    tooltip.className = "mount-tooltip";
    tooltip.textContent = mount.name;
    object.append(control, tooltip);
    elements.objectsLayer.append(object);
  }

  function appendCabinetCardLink(cabinet) {
    const card = getCabinetCard(cabinet);
    if (!card.open) return;
    const cardElement = elements.objectsLayer.querySelector(`[data-cabinet-card-id="${cabinet.id}"]`);
    const cardWidth = cardElement
      ? cardElement.getBoundingClientRect().width / state.view.scale
      : card.width * state.elementScale / state.view.scale;
    const cardHeight = cardElement
      ? cardElement.getBoundingClientRect().height / state.view.scale
      : (card.collapsed ? CABINET_CARD_HEADER_HEIGHT : CABINET_CARD_HEIGHT) * state.elementScale / state.view.scale;
    const cardBounds = {
      x: card.x,
      y: card.y,
      width: cardWidth,
      height: cardHeight,
    };
    const end = AppMath.closestPointOnRect(cabinet, cardBounds);
    const dx = end.x - cabinet.x;
    const dy = end.y - cabinet.y;
    const distance = Math.hypot(dx, dy);
    if (!distance) return;
    const line = document.createElement("div");
    line.className = "cabinet-card-link";
    if (cabinet.id === state.selectedCabinetId) line.classList.add("is-selected");
    line.style.left = `${cabinet.x}px`;
    line.style.top = `${cabinet.y}px`;
    line.style.width = `${distance}px`;
    line.style.borderTopWidth = `${1 / state.view.scale}px`;
    line.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
    elements.objectsLayer.append(line);
  }

  function updateEquipmentSummary(nameNode, detailsNode, equipment) {
    nameNode.textContent = equipment.name || equipmentType(equipment.type).name;
    detailsNode.replaceChildren();
    const values = [
      ["Модель", equipment.model],
      ["IP", equipment.ip],
      ["Портов", equipment.ports],
      ["Примечание", equipment.note],
    ];
    values.forEach(([label, value]) => {
      if (!String(value || "").trim()) return;
      const detail = document.createElement("span");
      detail.textContent = `${label}: ${value}`;
      detailsNode.append(detail);
    });
  }

  function makeEquipmentField(labelText, equipment, field, options = {}) {
    const label = document.createElement("label");
    label.className = `cabinet-equipment-field cabinet-equipment-field--${field}`;
    const caption = document.createElement("span");
    caption.textContent = labelText;
    const input = options.multiline ? document.createElement("textarea") : document.createElement("input");
    if (!options.multiline) input.type = options.type || "text";
    input.value = equipment[field] || "";
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.inputMode) input.inputMode = options.inputMode;
    if (options.min) input.min = options.min;
    if (options.max) input.max = options.max;
    input.addEventListener("input", () => {
      equipment[field] = input.value;
      const item = input.closest(".cabinet-equipment");
      updateEquipmentSummary(
        item.querySelector(".cabinet-equipment__name"),
        item.querySelector(".cabinet-equipment__details"),
        equipment,
      );
    });
    if (field === "ports") {
      input.addEventListener("change", () => {
        if (input.value === "") return;
        equipment.ports = String(clamp(Math.round(Number(input.value) || 1), 1, 512));
        input.value = equipment.ports;
        const item = input.closest(".cabinet-equipment");
        updateEquipmentSummary(
          item.querySelector(".cabinet-equipment__name"),
          item.querySelector(".cabinet-equipment__details"),
          equipment,
        );
      });
    }
    label.append(caption, input);
    return label;
  }

  function makeEquipmentItem(cabinet, equipment, cardState) {
    const type = equipmentType(equipment.type);
    const item = document.createElement("article");
    item.className = "cabinet-equipment";
    if (cardState.editingEquipmentId === equipment.id) item.classList.add("is-editing");
    item.dataset.equipmentId = equipment.id;
    item.dataset.equipmentType = equipment.type;

    const row = document.createElement("div");
    row.className = "cabinet-equipment__row";
    const main = document.createElement("button");
    main.type = "button";
    main.className = "cabinet-equipment__main";
    main.setAttribute("aria-label", `Редактировать: ${equipment.name || type.name}`);
    const icon = document.createElement("span");
    icon.className = `cabinet-equipment__icon cabinet-equipment__icon--${type.id}`;
    icon.textContent = type.icon;
    icon.setAttribute("aria-hidden", "true");
    const heading = document.createElement("span");
    heading.className = "cabinet-equipment__heading";
    const name = document.createElement("strong");
    name.className = "cabinet-equipment__name";
    const typeName = document.createElement("small");
    typeName.textContent = type.name;
    heading.append(name, typeName);
    main.append(icon, heading);
    main.addEventListener("click", () => {
      cardState.editingEquipmentId = cardState.editingEquipmentId === equipment.id ? null : equipment.id;
      cardState.addMenuOpen = false;
      renderObjects();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cabinet-equipment__remove";
    remove.textContent = "×";
    remove.title = "Удалить оборудование";
    remove.setAttribute("aria-label", `Удалить: ${equipment.name || type.name}`);
    remove.addEventListener("click", () => {
      cabinet.equipment = cabinetEquipment(cabinet).filter((item) => item.id !== equipment.id);
      if (cardState.editingEquipmentId === equipment.id) cardState.editingEquipmentId = null;
      renderObjects();
    });
    row.append(main, remove);

    const details = document.createElement("div");
    details.className = "cabinet-equipment__details";
    updateEquipmentSummary(name, details, equipment);
    item.append(row, details);

    if (cardState.editingEquipmentId === equipment.id) {
      const editor = document.createElement("div");
      editor.className = "cabinet-equipment__editor";
      editor.append(
        makeEquipmentField("Название", equipment, "name"),
        makeEquipmentField("Модель", equipment, "model", { placeholder: "Не указана" }),
        makeEquipmentField("IP-адрес", equipment, "ip", { placeholder: "Необязательно", inputMode: "decimal" }),
        makeEquipmentField("Количество портов", equipment, "ports", { type: "number", min: "1", max: "512", placeholder: "Необязательно" }),
        makeEquipmentField("Примечание", equipment, "note", { multiline: true, placeholder: "Необязательно" }),
      );
      const done = document.createElement("button");
      done.type = "button";
      done.className = "button button--primary cabinet-equipment__done";
      done.textContent = "Готово";
      done.addEventListener("click", () => {
        cardState.editingEquipmentId = null;
        renderObjects();
      });
      editor.append(done);
      item.append(editor);
    }
    return item;
  }

  function appendCabinetCard(cabinet) {
    const cardState = getCabinetCard(cabinet);
    if (!cardState.open) return;

    const card = document.createElement("section");
    card.className = "cabinet-card";
    if (cardState.collapsed) card.classList.add("is-collapsed");
    if (cabinet.id === state.selectedCabinetId) card.classList.add("is-selected");
    card.dataset.cabinetCardId = cabinet.id;
    card.style.left = `${cardState.x}px`;
    card.style.top = `${cardState.y}px`;
    card.style.width = `${cardState.width}px`;

    const header = document.createElement("header");
    header.className = "cabinet-card__header";
    header.dataset.cabinetCardId = cabinet.id;

    const dragMark = document.createElement("span");
    dragMark.className = "cabinet-card__drag-mark";
    dragMark.textContent = "⠿";
    dragMark.setAttribute("aria-hidden", "true");

    const title = document.createElement("div");
    title.className = "cabinet-card__title";
    const name = document.createElement("strong");
    name.textContent = cabinet.name || "Шкаф без названия";
    const count = document.createElement("span");
    const equipmentList = cabinetEquipment(cabinet);
    count.textContent = `· ${equipmentCountText(equipmentList.length)}`;
    title.append(name, count);

    const actions = document.createElement("div");
    actions.className = "cabinet-card__actions";

    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.textContent = cardState.collapsed ? "+" : "−";
    collapse.title = cardState.collapsed ? "Развернуть карточку" : "Свернуть карточку";
    collapse.setAttribute("aria-label", collapse.title);
    collapse.addEventListener("click", () => {
      cardState.collapsed = !cardState.collapsed;
      renderObjects();
    });

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Закрыть карточку";
    close.setAttribute("aria-label", "Закрыть карточку");
    close.addEventListener("click", () => closeCabinetCard(cabinet));

    actions.append(collapse, close);
    header.append(dragMark, title, actions);

    const body = document.createElement("div");
    body.className = "cabinet-card__body";
    body.hidden = cardState.collapsed;

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "button cabinet-equipment-add";
    addButton.textContent = "+ Добавить оборудование";
    addButton.setAttribute("aria-expanded", String(cardState.addMenuOpen));
    addButton.addEventListener("click", () => {
      cardState.addMenuOpen = !cardState.addMenuOpen;
      cardState.editingEquipmentId = null;
      renderObjects();
    });
    body.append(addButton);

    if (cardState.addMenuOpen) {
      const menu = document.createElement("div");
      menu.className = "cabinet-equipment-menu";
      EQUIPMENT_TYPES.forEach((type) => {
        const option = document.createElement("button");
        option.type = "button";
        option.dataset.equipmentType = type.id;
        const icon = document.createElement("span");
        icon.textContent = type.icon;
        icon.setAttribute("aria-hidden", "true");
        const label = document.createElement("strong");
        label.textContent = type.name;
        option.append(icon, label);
        option.addEventListener("click", () => addEquipment(cabinet, type.id));
        menu.append(option);
      });
      body.append(menu);
    }

    if (equipmentList.length) {
      const list = document.createElement("div");
      list.className = "cabinet-equipment-list";
      equipmentList.forEach((equipment) => list.append(makeEquipmentItem(cabinet, equipment, cardState)));
      body.append(list);
    } else {
      const empty = document.createElement("p");
      empty.className = "cabinet-card__empty";
      empty.textContent = "Оборудование пока не добавлено";
      body.append(empty);
    }
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "cabinet-card__resize-handle";
    resizeHandle.dataset.cabinetCardId = cabinet.id;
    resizeHandle.title = "Потяните для изменения ширины. Двойной щелчок — стандартная ширина";
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-orientation", "vertical");
    resizeHandle.setAttribute("aria-label", "Изменить ширину карточки");
    card.append(header, body, resizeHandle);
    elements.objectsLayer.append(card);
  }

  function appendCabinet(cabinet) {
    const object = document.createElement("div");
    object.className = "cabinet-object";
    if (cabinet.id === state.selectedCabinetId) object.classList.add("is-selected");
    object.style.left = `${cabinet.x}px`;
    object.style.top = `${cabinet.y}px`;

    const control = document.createElement("button");
    control.type = "button";
    control.className = "cabinet-control";
    control.dataset.cabinetId = cabinet.id;
    control.setAttribute("aria-label", cabinet.name);
    control.title = "Двойной щелчок — открыть карточку";
    const tooltip = document.createElement("div");
    tooltip.className = "cabinet-tooltip";
    tooltip.textContent = cabinet.name;
    object.append(control, tooltip);
    elements.objectsLayer.append(object);
  }

  function renderObjects() {
    hideCableBundlePicker();
    elements.objectsLayer.replaceChildren();
    appendCables();

    state.cameras.forEach((camera) => {
      const mount = getMount(camera.mountId);
      const relationSelected = camera.id === state.selectedCameraId || mount?.id === state.selectedMountId;
      if (mount && relationSelected) appendAttachmentLine(camera, mount);
    });
    state.cameras.forEach(appendCamera);
    state.mounts.forEach(appendMount);
    state.cabinets.forEach(appendCabinet);
    state.cabinets.forEach(appendCabinetCard);
    state.cabinets.forEach(appendCabinetCardLink);
  }

  function makeListCamera(camera, index) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "object-list__camera";
    if (camera.id === state.selectedCameraId) item.classList.add("is-selected");
    item.dataset.cameraId = camera.id;
    item.addEventListener("click", () => {
      setActiveTool(null);
      selectCamera(camera.id);
      ensurePointVisible(camera);
      revealProperties(elements.cameraProperties);
    });

    const name = document.createElement("span");
    name.className = "object-list__name";
    name.textContent = camera.name || "Без названия";
    const number = document.createElement("span");
    number.className = "object-list__number";
    number.textContent = `#${index + 1}`;
    const detail = document.createElement("span");
    detail.className = "object-list__detail";
    detail.textContent = camera.ip || "IP не указан";
    item.append(name, number, detail);
    return item;
  }

  function makeListMount(mount) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "object-list__mount";
    if (mount.id === state.selectedMountId) item.classList.add("is-selected");
    item.dataset.mountId = mount.id;
    item.addEventListener("click", () => {
      setActiveTool(null);
      selectMount(mount.id);
      ensurePointVisible(mount);
      revealProperties(elements.mountProperties);
    });
    const name = document.createElement("span");
    name.className = "object-list__name";
    name.textContent = mount.name || mountTypeName(mount.type);
    const type = document.createElement("span");
    type.className = "object-list__type";
    type.textContent = mount.type === "pole" ? "столб" : "точка";
    item.append(name, type);
    return item;
  }

  function makeListCabinet(cabinet) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "object-list__cabinet";
    if (cabinet.id === state.selectedCabinetId) item.classList.add("is-selected");
    item.dataset.cabinetId = cabinet.id;
    item.addEventListener("click", () => {
      setActiveTool(null);
      selectCabinet(cabinet.id);
      ensurePointVisible(cabinet);
      revealProperties(elements.cabinetProperties);
    });
    const name = document.createElement("span");
    name.className = "object-list__name";
    name.textContent = cabinet.name || "Без названия";
    const type = document.createElement("span");
    type.className = "object-list__type";
    type.textContent = "шкаф";
    item.append(name, type);
    return item;
  }

  function endpointName(kind, id) {
    if (kind === "camera") return getCamera(id)?.name || "Камера удалена";
    return getCabinet(id)?.name || "Шкаф удалён";
  }

  function makeListCable(cable) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "object-list__cable";
    if (cable.id === state.selectedCableId) item.classList.add("is-selected");
    item.dataset.cableId = cable.id;
    item.addEventListener("click", () => {
      setActiveTool(null);
      selectCable(cable.id);
      revealProperties(elements.cableProperties);
    });
    const name = document.createElement("span");
    name.className = "object-list__name";
    name.textContent = cable.name || cableTypeName(cable.type);
    const swatch = document.createElement("span");
    swatch.className = `cable-swatch cable-swatch--${cable.type}`;
    const detail = document.createElement("span");
    detail.className = "object-list__detail";
    detail.textContent = `${endpointName(cable.sourceKind, cable.sourceId)} → ${endpointName("cabinet", cable.targetCabinetId)}`;
    item.append(name, swatch, detail);
    return item;
  }

  function renderObjectList() {
    elements.objectList.replaceChildren();
    if (!state.mounts.length && !state.cameras.length && !state.cabinets.length && !state.cables.length) {
      const empty = document.createElement("p");
      empty.className = "object-list__empty";
      empty.textContent = "Элементов пока нет";
      elements.objectList.append(empty);
      return;
    }

    state.mounts.forEach((mount) => {
      const group = document.createElement("div");
      group.className = "object-list__group";
      group.append(makeListMount(mount));
      state.cameras
        .filter((camera) => camera.mountId === mount.id)
        .forEach((camera) => group.append(makeListCamera(camera, state.cameras.indexOf(camera))));
      elements.objectList.append(group);
    });

    const freeCameras = state.cameras.filter((camera) => !getMount(camera.mountId));
    if (freeCameras.length) {
      const group = document.createElement("div");
      group.className = "object-list__group";
      const heading = document.createElement("div");
      heading.className = "object-list__mount";
      const name = document.createElement("span");
      name.className = "object-list__name";
      name.textContent = "Свободные камеры";
      heading.append(name);
      group.append(heading);
      freeCameras.forEach((camera) => group.append(makeListCamera(camera, state.cameras.indexOf(camera))));
      elements.objectList.append(group);
    }

    if (state.cabinets.length) {
      const group = document.createElement("div");
      group.className = "object-list__group";
      const heading = document.createElement("div");
      heading.className = "object-list__mount";
      const name = document.createElement("span");
      name.className = "object-list__name";
      name.textContent = "Шкафы";
      heading.append(name);
      group.append(heading);
      state.cabinets.forEach((cabinet) => group.append(makeListCabinet(cabinet)));
      elements.objectList.append(group);
    }

    if (state.cables.length) {
      const group = document.createElement("div");
      group.className = "object-list__group";
      const heading = document.createElement("div");
      heading.className = "object-list__mount";
      const name = document.createElement("span");
      name.className = "object-list__name";
      name.textContent = "Кабели";
      heading.append(name);
      group.append(heading);
      state.cables.forEach((cable) => group.append(makeListCable(cable)));
      elements.objectList.append(group);
    }
  }

  function renderMountConnections(mount) {
    const attached = state.cameras.filter((camera) => camera.mountId === mount.id);
    const routed = state.cables.filter((cable) => cable.viaMountIds.includes(mount.id));
    const hasCameras = attached.length > 0;
    const hasCables = routed.length > 0;

    elements.mountConnections.hidden = !hasCameras && !hasCables;
    elements.mountConnections.classList.toggle("has-both", hasCameras && hasCables);
    elements.mountedCameraGroup.hidden = !hasCameras;
    elements.mountedCableGroup.hidden = !hasCables;
    elements.mountedCameraCount.textContent = cameraCountText(attached.length);
    elements.mountedCableCount.textContent = cableCountText(routed.length);
    elements.mountedCameraList.replaceChildren();
    elements.mountedCableList.replaceChildren();

    routed.forEach((cable) => {
      const link = document.createElement("button");
      link.type = "button";
      link.className = `mount-connections__link mount-connections__link--${cable.type}`;
      link.dataset.mountedCableId = cable.id;
      link.textContent = cable.name || cableTypeName(cable.type);
      link.title = `Открыть кабель: ${link.textContent}`;
      elements.mountedCableList.append(link);
    });

    attached.forEach((camera) => {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "mount-connections__link mount-connections__link--camera";
      link.dataset.mountedCameraId = camera.id;
      link.textContent = camera.name || "Без названия";
      link.title = `Открыть камеру: ${link.textContent}`;
      elements.mountedCameraList.append(link);
    });
  }

  function syncProperties() {
    const camera = getCamera(state.selectedCameraId);
    const mount = getMount(state.selectedMountId);
    const cabinet = getCabinet(state.selectedCabinetId);
    const cable = getCable(state.selectedCableId);
    elements.cameraProperties.hidden = !camera;
    elements.mountProperties.hidden = !mount;
    elements.cabinetProperties.hidden = !cabinet;
    elements.cableProperties.hidden = !cable;

    if (camera) {
      elements.nameInput.value = camera.name;
      elements.modelInput.value = camera.model;
      elements.ipInput.value = camera.ip;
      elements.macInput.value = camera.mac;
      elements.fovInput.value = camera.fov;
      elements.fovNumber.value = camera.fov;
      syncCameraRangeInputs(camera);
      const cameraMount = getMount(camera.mountId);
      elements.cameraMountRow.hidden = !cameraMount;
      elements.cameraMountName.textContent = cameraMount?.name || "";
    }

    if (mount) {
      elements.mountPropertiesTitle.textContent = mountTypeName(mount.type);
      elements.mountPropertiesType.textContent = mount.type === "pole" ? "Опора для одной или нескольких камер" : "Крепление на здании";
      elements.mountNameInput.value = mount.name;
      elements.deleteMount.textContent = mount.type === "pole" ? "Удалить столб" : "Удалить точку крепления";
      renderMountConnections(mount);
    }

    if (cabinet) {
      const card = getCabinetCard(cabinet);
      elements.cabinetNameInput.value = cabinet.name;
      elements.openCabinetCard.textContent = card.open ? "Закрыть карточку" : "Открыть карточку";
      elements.openCabinetCard.setAttribute("aria-expanded", String(card.open));
    }

    if (cable) {
      elements.cableNameInput.value = cable.name;
      elements.cableType.textContent = cableTypeName(cable.type);
      elements.cableSource.textContent = endpointName(cable.sourceKind, cable.sourceId);
      elements.cableTarget.textContent = endpointName("cabinet", cable.targetCabinetId);
    }
  }

  function refreshEditor() {
    syncProperties();
    renderObjects();
    renderObjectList();
  }

  function selectCamera(id) {
    hideMountCameraMenu();
    state.selectedCameraId = id;
    state.selectedMountId = null;
    state.selectedCabinetId = null;
    state.selectedCableId = null;
    refreshEditor();
  }

  function selectMount(id) {
    hideMountCameraMenu();
    state.selectedMountId = id;
    state.selectedCameraId = null;
    state.selectedCabinetId = null;
    state.selectedCableId = null;
    refreshEditor();
  }

  function selectCabinet(id) {
    hideMountCameraMenu();
    state.selectedCabinetId = id;
    state.selectedCameraId = null;
    state.selectedMountId = null;
    state.selectedCableId = null;
    refreshEditor();
  }

  function selectCable(id) {
    hideMountCameraMenu();
    state.selectedCableId = id;
    state.selectedCameraId = null;
    state.selectedMountId = null;
    state.selectedCabinetId = null;
    refreshEditor();
  }

  function clearSelection() {
    hideMountCameraMenu();
    state.selectedCameraId = null;
    state.selectedMountId = null;
    state.selectedCabinetId = null;
    state.selectedCableId = null;
    refreshEditor();
  }

  function ensurePointVisible(object) {
    const rect = elements.workspace.getBoundingClientRect();
    const margin = 70;
    const screenX = state.view.x + object.x * state.view.scale;
    const screenY = state.view.y + object.y * state.view.scale;
    let shiftX = 0;
    let shiftY = 0;
    if (screenX < margin) shiftX = margin - screenX;
    else if (screenX > rect.width - margin) shiftX = rect.width - margin - screenX;
    if (screenY < margin) shiftY = margin - screenY;
    else if (screenY > rect.height - margin) shiftY = rect.height - margin - screenY;
    if (shiftX || shiftY) {
      state.view.x += shiftX;
      state.view.y += shiftY;
      state.fitted = false;
      renderView();
    }
  }

  function revealProperties(panel) {
    window.requestAnimationFrame(() => {
      panel.scrollTop = 0;
    });
  }

  function hideMountCameraMenu() {
    elements.mountCameraMenu.hidden = true;
    elements.addMountedCamera.setAttribute("aria-expanded", "false");
  }

  function renderFreeCameraMenu() {
    elements.freeCameraList.replaceChildren();
    const freeCameras = state.cameras.filter((camera) => !getMount(camera.mountId));
    if (!freeCameras.length) {
      const empty = document.createElement("p");
      empty.className = "free-camera-list__empty";
      empty.textContent = "Свободных камер нет";
      elements.freeCameraList.append(empty);
      return;
    }

    freeCameras.forEach((camera) => {
      const item = document.createElement("button");
      item.type = "button";
      item.dataset.freeCameraId = camera.id;
      const name = document.createElement("span");
      name.textContent = camera.name || "Без названия";
      const detail = document.createElement("small");
      detail.textContent = camera.ip || "IP не указан";
      item.append(name, detail);
      elements.freeCameraList.append(item);
    });
  }

  function hideCableTypePicker() {
    elements.cableTypePicker.hidden = true;
  }

  function showCableTypePicker(cabinet) {
    state.pendingCableSourceId = cabinet.id;
    elements.cableTypePicker.hidden = false;
    updateCablePlacementHint();
    window.requestAnimationFrame(() => elements.chooseFiberCable.focus());
  }

  function setActiveTool(tool, cameraMountId = null) {
    const clearedCableState = tool !== "cable" && Boolean(state.cableDraft || state.pendingCableSourceId);
    if (tool !== "cable") {
      state.cableDraft = null;
      state.pendingCableSourceId = null;
      hideCableTypePicker();
    }
    state.activeTool = tool && state.imageWidth ? tool : null;
    state.cameraMountId = state.activeTool === "camera" ? cameraMountId : null;
    elements.cameraTool.setAttribute("aria-pressed", String(state.activeTool === "camera"));
    elements.poleTool.setAttribute("aria-pressed", String(state.activeTool === "pole"));
    elements.mountTool.setAttribute("aria-pressed", String(state.activeTool === "point"));
    elements.cabinetTool.setAttribute("aria-pressed", String(state.activeTool === "cabinet"));
    elements.cableTool.setAttribute("aria-pressed", String(state.activeTool === "cable"));
    elements.workspace.classList.toggle("is-placing", Boolean(state.activeTool));
    elements.placementHint.hidden = !state.activeTool;
    if (!state.activeTool) {
      if (clearedCableState) renderObjects();
      return;
    }

    if (state.activeTool === "pole") {
      elements.placementHint.textContent = "Щёлкните по карте, чтобы поставить столб";
    } else if (state.activeTool === "point") {
      elements.placementHint.textContent = "Щёлкните по стене или углу здания";
    } else if (state.activeTool === "cabinet") {
      elements.placementHint.textContent = "Щёлкните по карте, чтобы поставить шкаф";
    } else if (state.activeTool === "cable") {
      updateCablePlacementHint();
    } else {
      const mount = getMount(state.cameraMountId);
      elements.placementHint.textContent = mount
        ? `Поставьте камеру для «${mount.name}»`
        : "Щёлкните по карте, чтобы поставить камеру";
    }
  }

  function workspacePoint(clientX, clientY) {
    const rect = elements.workspace.getBoundingClientRect();
    return AppMath.toScene(state.view, clientX - rect.left, clientY - rect.top);
  }

  function isInsideMap(point) {
    return point.x >= 0 && point.y >= 0 && point.x <= state.imageWidth && point.y <= state.imageHeight;
  }

  function addCamera(point, mountId = null) {
    const number = state.nextCameraId++;
    const rangeBase = Math.max(1, Math.min(state.imageWidth, state.imageHeight));
    const camera = {
      id: `c${number}`,
      x: point.x,
      y: point.y,
      direction: 0,
      fov: 90,
      range: rangeBase * DEFAULT_CAMERA_RANGE_PERCENT / 100,
      name: `Камера ${number}`,
      model: "HiWatch T020",
      ip: `192.168.1.${19 + number}`,
      mac: "",
      mountId: getMount(mountId)?.id || null,
    };
    state.cameras.push(camera);
    setActiveTool(null);
    selectCamera(camera.id);
  }

  function addMount(point, type) {
    const number = type === "pole" ? state.nextPoleNumber++ : state.nextPointNumber++;
    const mount = {
      id: `m${state.nextMountId++}`,
      type,
      name: type === "pole" ? `Столб ${number}` : `Точка крепления ${number}`,
      x: point.x,
      y: point.y,
    };
    state.mounts.push(mount);
    setActiveTool(null);
    selectMount(mount.id);
  }

  function addCabinet(point) {
    const number = state.nextCabinetId++;
    const cabinet = {
      id: `cabinet${number}`,
      name: `Шкаф ${number}`,
      x: point.x,
      y: point.y,
      equipment: [],
      card: {
        open: false,
        collapsed: false,
        x: null,
        y: null,
        width: CABINET_CARD_WIDTH,
        addMenuOpen: false,
        editingEquipmentId: null,
      },
    };
    state.cabinets.push(cabinet);
    setActiveTool(null);
    selectCabinet(cabinet.id);
  }

  function updateCablePlacementHint(message = "") {
    if (message) {
      elements.placementHint.textContent = message;
      return;
    }
    if (state.pendingCableSourceId) {
      elements.placementHint.textContent = "Выберите тип кабеля между шкафами";
      return;
    }
    const draft = state.cableDraft;
    if (!draft) {
      elements.placementHint.textContent = "Выберите камеру для витой пары или шкаф для оптики";
    } else if (draft.type === "copper") {
      elements.placementHint.textContent = "Выбирайте столбы и точки, затем конечный шкаф";
    } else {
      elements.placementHint.textContent = "Выбирайте столбы и точки, затем другой шкаф";
    }
  }

  function startCable(kind, id) {
    if (kind === "camera") {
      const camera = getCamera(id);
      if (!camera) return;
      state.cableDraft = {
        type: "copper",
        sourceKind: "camera",
        sourceId: camera.id,
        viaMountIds: getMount(camera.mountId) ? [camera.mountId] : [],
        targetCabinetId: null,
      };
    } else {
      const cabinet = getCabinet(id);
      if (!cabinet) return;
      showCableTypePicker(cabinet);
      return;
    }
    updateCablePlacementHint();
    renderObjects();
  }

  function startCabinetCable(type) {
    const cabinet = getCabinet(state.pendingCableSourceId);
    if (!cabinet || (type !== "fiber" && type !== "copper")) return;
    state.cableDraft = {
      type,
      sourceKind: "cabinet",
      sourceId: cabinet.id,
      viaMountIds: [],
      targetCabinetId: null,
    };
    state.pendingCableSourceId = null;
    hideCableTypePicker();
    updateCablePlacementHint();
    renderObjects();
  }

  function finishCable(targetCabinetId) {
    const draft = state.cableDraft;
    const target = getCabinet(targetCabinetId);
    if (!draft || !target) return;
    if (draft.sourceKind === "cabinet" && draft.sourceId === target.id) {
      updateCablePlacementHint("Выберите другой конечный шкаф");
      return;
    }

    const number = draft.type === "copper" ? state.nextCopperNumber++ : state.nextFiberNumber++;
    const cable = {
      id: `cable${state.nextCableId++}`,
      name: draft.type === "copper" ? `Витая пара ${number}` : `Оптика ${number}`,
      type: draft.type,
      sourceKind: draft.sourceKind,
      sourceId: draft.sourceId,
      viaMountIds: [...draft.viaMountIds],
      targetCabinetId: target.id,
    };
    state.cables.push(cable);
    setActiveTool(null);
    selectCable(cable.id);
  }

  function handleCableNode(kind, id) {
    if (state.pendingCableSourceId) {
      updateCablePlacementHint("Сначала выберите тип кабеля");
      return;
    }
    if (!state.cableDraft) {
      if (kind === "camera" || kind === "cabinet") startCable(kind, id);
      else updateCablePlacementHint("Сначала выберите камеру или шкаф");
      return;
    }

    if (kind === "mount") {
      const via = state.cableDraft.viaMountIds;
      if (via[via.length - 1] !== id) via.push(id);
      updateCablePlacementHint();
      renderObjects();
      return;
    }

    if (kind === "cabinet") {
      finishCable(id);
      return;
    }

    updateCablePlacementHint(state.cableDraft.type === "copper"
      ? "Витая пара уже начата: выберите опоры или шкаф"
      : "Оптика уже начата: выберите опоры или другой шкаф");
  }

  function nearestMount(x, y) {
    const threshold = 34 / state.view.scale;
    let nearest = null;
    let nearestDistance = threshold;
    state.mounts.forEach((mount) => {
      const distance = Math.hypot(x - mount.x, y - mount.y);
      if (distance <= nearestDistance) {
        nearest = mount;
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.hidden = false;
  }

  function clearError() {
    elements.error.textContent = "";
    elements.error.hidden = true;
  }

  async function hasSupportedSignature(file) {
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const isPng = bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return isPng || isJpeg;
  }

  function decodeImage(url) {
    return new Promise((resolve, reject) => {
      const probe = new Image();
      probe.onload = () => resolve(probe);
      probe.onerror = reject;
      probe.src = url;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function releaseImageUrl() {
    if (state.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(state.imageUrl);
  }

  function setMapControlsEnabled(enabled) {
    elements.fitButton.disabled = !enabled;
    elements.cameraTool.disabled = !enabled;
    elements.poleTool.disabled = !enabled;
    elements.mountTool.disabled = !enabled;
    elements.cabinetTool.disabled = !enabled;
    elements.cableTool.disabled = !enabled;
    elements.saveProjectButton.disabled = !enabled;
  }

  function showLoadedMap() {
    elements.scene.style.width = `${state.imageWidth}px`;
    elements.scene.style.height = `${state.imageHeight}px`;
    elements.mapImage.src = state.imageUrl;
    elements.mapImage.alt = `Карта «${state.mapFileName}»`;
    elements.scene.hidden = false;
    elements.emptyState.hidden = true;
    elements.workspace.classList.add("has-map");
    setMapControlsEnabled(true);
    elements.status.textContent = `${state.mapFileName} · ${state.imageWidth} × ${state.imageHeight} px`;
  }

  function limitedText(value, fallback = "", maxLength = 5000) {
    return typeof value === "string" ? value.slice(0, maxLength) : fallback;
  }

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function validId(value, label) {
    if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) {
      throw new Error(`Файл проекта повреждён: некорректный идентификатор ${label}.`);
    }
    return value;
  }

  function projectArray(value, label) {
    if (!Array.isArray(value) || value.length > 10000) {
      throw new Error(`Файл проекта повреждён: некорректный раздел «${label}».`);
    }
    return value;
  }

  function uniqueIds(items, label) {
    const ids = new Set();
    items.forEach((item) => {
      if (ids.has(item.id)) throw new Error(`Файл проекта повреждён: повторяется идентификатор в разделе «${label}».`);
      ids.add(item.id);
    });
    return ids;
  }

  function normalizedCounter(value, minimum = 1) {
    return Math.max(minimum, Math.floor(finiteNumber(value, minimum)));
  }

  function nextNumericId(items, prefix) {
    return items.reduce((next, item) => {
      const match = String(item.id).match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? Math.max(next, Number(match[1]) + 1) : next;
    }, 1);
  }

  function normalizeProject(raw) {
    if (!raw || typeof raw !== "object" || raw.format !== PROJECT_FORMAT) {
      throw new Error("Выбранный файл не является проектом Camera Map.");
    }
    if (raw.version !== PROJECT_VERSION) {
      throw new Error(`Версия проекта ${raw.version ?? "не указана"} не поддерживается этой версией приложения.`);
    }
    const project = raw.project;
    const map = project?.map;
    if (!project || typeof project !== "object" || !map || typeof map !== "object") {
      throw new Error("Файл проекта повреждён: отсутствуют данные карты.");
    }
    if (typeof map.dataUrl !== "string" || !/^data:image\/(png|jpeg);base64,/i.test(map.dataUrl)) {
      throw new Error("Файл проекта повреждён: изображение карты отсутствует или имеет неподдерживаемый формат.");
    }
    const width = Math.floor(finiteNumber(map.width));
    const height = Math.floor(finiteNumber(map.height));
    if (width < 1 || height < 1 || width > 100000 || height > 100000) {
      throw new Error("Файл проекта повреждён: некорректный размер карты.");
    }

    const mounts = projectArray(project.mounts, "крепления").map((item) => ({
      id: validId(item?.id, "крепления"),
      type: item?.type === "pole" ? "pole" : item?.type === "point" ? "point" : null,
      name: limitedText(item?.name),
      x: clamp(finiteNumber(item?.x), 0, width),
      y: clamp(finiteNumber(item?.y), 0, height),
    }));
    if (mounts.some((mount) => !mount.type)) throw new Error("Файл проекта повреждён: неизвестный тип крепления.");
    const mountIds = uniqueIds(mounts, "крепления");

    const cameras = projectArray(project.cameras, "камеры").map((item) => ({
      id: validId(item?.id, "камеры"),
      x: clamp(finiteNumber(item?.x), 0, width),
      y: clamp(finiteNumber(item?.y), 0, height),
      direction: ((finiteNumber(item?.direction) % 360) + 360) % 360,
      fov: clamp(finiteNumber(item?.fov, 90), 1, 180),
      range: Math.max(1, finiteNumber(item?.range, Math.min(width, height) * DEFAULT_CAMERA_RANGE_PERCENT / 100)),
      name: limitedText(item?.name),
      model: limitedText(item?.model),
      ip: limitedText(item?.ip),
      mac: limitedText(item?.mac),
      mountId: typeof item?.mountId === "string" && mountIds.has(item.mountId) ? item.mountId : null,
    }));
    const cameraIds = uniqueIds(cameras, "камеры");

    const equipmentIds = new Set();
    const cabinets = projectArray(project.cabinets, "шкафы").map((item) => {
      const equipment = projectArray(item?.equipment ?? [], "оборудование").map((equipmentItem) => {
        const id = validId(equipmentItem?.id, "оборудования");
        if (equipmentIds.has(id)) throw new Error("Файл проекта повреждён: повторяется идентификатор оборудования.");
        equipmentIds.add(id);
        return {
          id,
          type: EQUIPMENT_TYPES.some((type) => type.id === equipmentItem?.type) ? equipmentItem.type : "other",
          name: limitedText(equipmentItem?.name),
          model: limitedText(equipmentItem?.model),
          ip: limitedText(equipmentItem?.ip),
          ports: limitedText(equipmentItem?.ports, "", 20),
          note: limitedText(equipmentItem?.note),
        };
      });
      const card = item?.card && typeof item.card === "object" ? item.card : {};
      return {
        id: validId(item?.id, "шкафа"),
        name: limitedText(item?.name),
        x: clamp(finiteNumber(item?.x), 0, width),
        y: clamp(finiteNumber(item?.y), 0, height),
        equipment,
        card: {
          open: Boolean(card.open),
          collapsed: Boolean(card.collapsed),
          x: Number.isFinite(Number(card.x)) ? Number(card.x) : null,
          y: Number.isFinite(Number(card.y)) ? Number(card.y) : null,
          width: clamp(finiteNumber(card.width, CABINET_CARD_WIDTH), MIN_CABINET_CARD_WIDTH, MAX_CABINET_CARD_WIDTH),
          addMenuOpen: false,
          editingEquipmentId: null,
        },
      };
    });
    const cabinetIds = uniqueIds(cabinets, "шкафы");

    const cables = projectArray(project.cables, "кабели").map((item) => {
      const type = item?.type === "fiber" ? "fiber" : item?.type === "copper" ? "copper" : null;
      const sourceKind = item?.sourceKind === "camera" ? "camera" : item?.sourceKind === "cabinet" ? "cabinet" : null;
      const sourceId = validId(item?.sourceId, "источника кабеля");
      const targetCabinetId = validId(item?.targetCabinetId, "конечного шкафа");
      const sourceExists = sourceKind === "camera" ? cameraIds.has(sourceId) : sourceKind === "cabinet" && cabinetIds.has(sourceId);
      if (!type || !sourceKind || !sourceExists || !cabinetIds.has(targetCabinetId)) {
        throw new Error("Файл проекта повреждён: некорректное подключение кабеля.");
      }
      if (sourceKind === "camera" && type !== "copper") {
        throw new Error("Файл проекта повреждён: камера может подключаться только витой парой.");
      }
      return {
        id: validId(item?.id, "кабеля"),
        name: limitedText(item?.name),
        type,
        sourceKind,
        sourceId,
        viaMountIds: projectArray(item?.viaMountIds ?? [], "маршрут кабеля").filter((id) => mountIds.has(id)),
        targetCabinetId,
      };
    });
    uniqueIds(cables, "кабели");

    const counters = project.counters || {};
    return {
      name: limitedText(project.name, fileNameWithoutExtension(map.fileName) || "Проект камер", 200),
      map: {
        fileName: limitedText(map.fileName, "Карта", 260),
        mimeType: /^image\/(png|jpeg)$/i.test(map.mimeType) ? map.mimeType.toLowerCase() : map.dataUrl.slice(5, map.dataUrl.indexOf(";")),
        width,
        height,
        dataUrl: map.dataUrl,
      },
      settings: {
        elementScale: clamp(finiteNumber(project.settings?.elementScale, 1), 0.5, 3),
      },
      counters: {
        nextCameraId: normalizedCounter(counters.nextCameraId, nextNumericId(cameras, "c")),
        nextMountId: normalizedCounter(counters.nextMountId, nextNumericId(mounts, "m")),
        nextPoleNumber: normalizedCounter(counters.nextPoleNumber, mounts.filter((item) => item.type === "pole").length + 1),
        nextPointNumber: normalizedCounter(counters.nextPointNumber, mounts.filter((item) => item.type === "point").length + 1),
        nextCabinetId: normalizedCounter(counters.nextCabinetId, nextNumericId(cabinets, "cabinet")),
        nextEquipmentId: normalizedCounter(counters.nextEquipmentId, nextNumericId([...equipmentIds].map((id) => ({ id })), "equipment")),
        nextCableId: normalizedCounter(counters.nextCableId, nextNumericId(cables, "cable")),
        nextCopperNumber: normalizedCounter(counters.nextCopperNumber, cables.filter((item) => item.type === "copper").length + 1),
        nextFiberNumber: normalizedCounter(counters.nextFiberNumber, cables.filter((item) => item.type === "fiber").length + 1),
      },
      cameras,
      mounts,
      cabinets,
      cables,
    };
  }

  function confirmDiscardChanges(action) {
    refreshDirtyState();
    return !state.isDirty || window.confirm(`${action}\n\nНесохранённые изменения будут потеряны.`);
  }

  function resetProject() {
    releaseImageUrl();
    state.imageUrl = null;
    state.imageData = null;
    state.imageToken += 1;
    state.mapFileName = null;
    state.mapMimeType = null;
    state.imageWidth = 0;
    state.imageHeight = 0;
    state.view = { x: 0, y: 0, scale: 1 };
    state.fitScale = 1;
    state.elementScale = 1;
    state.fitted = false;
    state.cameras = [];
    state.mounts = [];
    state.cabinets = [];
    state.cables = [];
    state.nextCameraId = 1;
    state.nextMountId = 1;
    state.nextPoleNumber = 1;
    state.nextPointNumber = 1;
    state.nextCabinetId = 1;
    state.nextEquipmentId = 1;
    state.nextCableId = 1;
    state.nextCopperNumber = 1;
    state.nextFiberNumber = 1;
    state.selectedCameraId = null;
    state.selectedMountId = null;
    state.selectedCabinetId = null;
    state.selectedCableId = null;
    state.objectInteraction = null;
    state.snapTargetId = null;
    state.projectName = "Новый проект";
    state.projectFileName = null;
    state.projectFileHandle = null;
    setActiveTool(null);
    clearError();
    elements.mapImage.removeAttribute("src");
    elements.scene.hidden = true;
    elements.emptyState.hidden = false;
    elements.workspace.classList.remove("has-map", "is-dragging");
    elements.status.textContent = "Карта не загружена";
    elements.zoomStatus.textContent = "Масштаб: —";
    elements.elementScaleInput.value = "100";
    elements.elementScaleValue.value = "100%";
    setMapControlsEnabled(false);
    refreshEditor();
    resetHistory();
    markProjectClean();
  }

  async function openProject(file, fileHandle = null) {
    clearError();
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const project = normalizeProject(raw);
      let decoded;
      try {
        decoded = await decodeImage(project.map.dataUrl);
      } catch {
        throw new Error("Файл проекта повреждён: изображение карты не читается.");
      }
      if (decoded.naturalWidth !== project.map.width || decoded.naturalHeight !== project.map.height) {
        throw new Error("Файл проекта повреждён: размер изображения карты не совпадает с данными проекта.");
      }
      if (!confirmDiscardChanges("Открыть выбранный проект?")) return;

      releaseImageUrl();
      state.imageUrl = project.map.dataUrl;
      state.imageData = project.map.dataUrl;
      state.imageToken += 1;
      state.mapFileName = project.map.fileName;
      state.mapMimeType = project.map.mimeType;
      state.imageWidth = project.map.width;
      state.imageHeight = project.map.height;
      state.elementScale = project.settings.elementScale;
      state.cameras = project.cameras;
      state.mounts = project.mounts;
      state.cabinets = project.cabinets;
      state.cables = project.cables;
      Object.assign(state, project.counters);
      state.selectedCameraId = null;
      state.selectedMountId = null;
      state.selectedCabinetId = null;
      state.selectedCableId = null;
      state.objectInteraction = null;
      state.snapTargetId = null;
      state.projectName = fileNameWithoutExtension(file.name) || project.name || "Проект камер";
      state.projectFileName = /\.cmap$/i.test(file.name)
        ? file.name
        : safeProjectFileName(fileNameWithoutExtension(file.name));
      state.projectFileHandle = fileHandle;
      setActiveTool(null);
      elements.elementScaleInput.value = String(Math.round(state.elementScale * 100));
      elements.elementScaleValue.value = `${Math.round(state.elementScale * 100)}%`;
      showLoadedMap();
      refreshEditor();
      fitMap();
      resetHistory();
      markProjectClean();
    } catch (error) {
      const detail = error instanceof SyntaxError
        ? "Не удалось открыть проект: файл повреждён или содержит неверный формат данных."
        : error.message || "Не удалось открыть выбранный проект.";
      showError(detail);
    } finally {
      elements.projectFileInput.value = "";
    }
  }

  async function chooseProjectFile() {
    clearError();
    if (typeof window.showOpenFilePicker !== "function") {
      elements.projectFileInput.click();
      return;
    }
    try {
      const [fileHandle] = await window.showOpenFilePicker(PROJECT_FILE_PICKER_OPTIONS);
      if (!fileHandle) return;
      await openProject(await fileHandle.getFile(), fileHandle);
    } catch (error) {
      if (error?.name === "AbortError") return;
      showError("Не удалось открыть файл проекта. Проверьте доступ к выбранному файлу.");
    }
  }

  function downloadProjectBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function writeProjectFile(fileHandle, blob) {
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  function showSaveSuccess() {
    elements.saveProjectButton.classList.add("is-saved");
    elements.saveProjectButton.title = "Проект сохранён";
    elements.saveProjectButton.setAttribute("aria-label", "Проект сохранён");
    elements.saveProjectButton.dataset.tooltip = "Проект сохранён";
    window.setTimeout(() => {
      elements.saveProjectButton.classList.remove("is-saved");
      elements.saveProjectButton.title = "Сохранить проект";
      elements.saveProjectButton.setAttribute("aria-label", "Сохранить проект");
      elements.saveProjectButton.dataset.tooltip = "Сохранить проект";
    }, 1400);
  }

  async function saveProject() {
    clearError();
    if (!state.imageData || !state.imageWidth) {
      showError("Сначала загрузите карту, затем сохраните проект.");
      return;
    }
    try {
      let fileHandle = state.projectFileHandle;
      if (!fileHandle && typeof window.showSaveFilePicker === "function") {
        fileHandle = await window.showSaveFilePicker({
          ...PROJECT_FILE_PICKER_OPTIONS,
          suggestedName: state.projectFileName || safeProjectFileName(state.projectName),
        });
        if (!fileHandle) return;
        state.projectName = fileNameWithoutExtension(fileHandle.name) || state.projectName;
      }

      const fileName = fileHandle?.name || state.projectFileName || safeProjectFileName(state.projectName);
      const payload = {
        format: PROJECT_FORMAT,
        version: PROJECT_VERSION,
        savedAt: new Date().toISOString(),
        project: projectContent(true),
      };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      if (fileHandle) await writeProjectFile(fileHandle, blob);
      else downloadProjectBlob(blob, fileName);

      state.projectFileHandle = fileHandle || null;
      state.projectFileName = fileName;
      markProjectClean();
      showSaveSuccess();
    } catch (error) {
      if (error?.name === "AbortError") return;
      showError("Не удалось сохранить проект. Проверьте доступ к выбранному файлу и попробуйте снова.");
    }
  }

  async function loadMap(file) {
    clearError();
    if (!file) return;
    try {
      if (!(await hasSupportedSignature(file))) throw new Error("unsupported");
      const nextUrl = URL.createObjectURL(file);
      let decoded;
      try {
        decoded = await decodeImage(nextUrl);
      } catch {
        URL.revokeObjectURL(nextUrl);
        throw new Error("damaged");
      }

      let imageData;
      try {
        imageData = await readFileAsDataUrl(file);
      } catch {
        URL.revokeObjectURL(nextUrl);
        throw new Error("read");
      }

      releaseImageUrl();
      state.imageUrl = nextUrl;
      state.imageData = imageData;
      state.imageToken += 1;
      state.mapFileName = file.name;
      state.mapMimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      state.imageWidth = decoded.naturalWidth;
      state.imageHeight = decoded.naturalHeight;
      if (!state.cameras.length && !state.mounts.length && !state.cabinets.length && !state.cables.length && state.projectName === "Новый проект") {
        state.projectName = fileNameWithoutExtension(file.name) || "Проект камер";
      }
      [...state.mounts, ...state.cameras, ...state.cabinets].forEach((object) => {
        object.x = clamp(object.x, 0, state.imageWidth);
        object.y = clamp(object.y, 0, state.imageHeight);
      });
      state.cameras.forEach(normalizeCameraRange);

      showLoadedMap();
      renderObjects();
      renderObjectList();
      fitMap();
      resetHistory();
      refreshDirtyState();
    } catch (error) {
      let detail = "Не удалось прочитать выбранный файл. Проверьте доступ к нему и попробуйте снова.";
      if (error.message === "unsupported") {
        detail = "Неподдерживаемый файл. Выберите изображение в формате PNG или JPG.";
      } else if (error.message === "damaged") {
        detail = "Файл похож на PNG или JPG, но изображение повреждено и не читается.";
      }
      showError(detail);
      if (!state.imageWidth) elements.status.textContent = "Карта не загружена";
    } finally {
      elements.fileInput.value = "";
    }
  }

  function updateCamera(field, value) {
    const camera = getCamera(state.selectedCameraId);
    if (!camera) return;
    camera[field] = value;
    renderObjects();
    renderObjectList();
  }

  elements.fileInput.addEventListener("change", (event) => loadMap(event.target.files[0]));
  elements.projectFileInput.addEventListener("change", (event) => openProject(event.target.files[0]));
  elements.newProjectButton.addEventListener("click", () => {
    if (confirmDiscardChanges("Создать новый проект?")) resetProject();
  });
  elements.openProjectButton.addEventListener("click", chooseProjectFile);
  elements.saveProjectButton.addEventListener("click", saveProject);
  elements.undoButton.addEventListener("click", undo);
  elements.redoButton.addEventListener("click", redo);
  elements.propertiesPopover.addEventListener("pointerdown", (event) => event.stopPropagation());
  elements.propertiesPopover.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
  elements.propertiesPopover.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-properties]")) {
      clearSelection();
      return;
    }
    const cableButton = event.target.closest("[data-mounted-cable-id]");
    const mountedCable = getCable(cableButton?.dataset.mountedCableId);
    if (cableButton && mountedCable) {
      selectCable(mountedCable.id);
      return;
    }
    const cameraButton = event.target.closest("[data-mounted-camera-id]");
    const camera = getCamera(cameraButton?.dataset.mountedCameraId);
    if (!cameraButton || !camera) return;
    selectCamera(camera.id);
    ensurePointVisible(camera);
  });
  elements.fitButton.addEventListener("click", fitMap);
  elements.elementScaleInput.addEventListener("input", (event) => {
    state.elementScale = Number(event.target.value) / 100;
    elements.elementScaleValue.value = `${event.target.value}%`;
    renderView();
    renderObjects();
  });

  elements.cameraTool.addEventListener("click", () => {
    const active = state.activeTool === "camera" && !state.cameraMountId;
    clearSelection();
    setActiveTool(active ? null : "camera");
  });
  elements.poleTool.addEventListener("click", () => {
    const active = state.activeTool === "pole";
    clearSelection();
    setActiveTool(active ? null : "pole");
  });
  elements.mountTool.addEventListener("click", () => {
    const active = state.activeTool === "point";
    clearSelection();
    setActiveTool(active ? null : "point");
  });
  elements.cabinetTool.addEventListener("click", () => {
    const active = state.activeTool === "cabinet";
    clearSelection();
    setActiveTool(active ? null : "cabinet");
  });
  elements.cableTool.addEventListener("click", () => {
    const active = state.activeTool === "cable";
    clearSelection();
    setActiveTool(active ? null : "cable");
  });
  elements.cableTypePicker.addEventListener("pointerdown", (event) => event.stopPropagation());
  elements.chooseFiberCable.addEventListener("click", () => startCabinetCable("fiber"));
  elements.chooseCopperCable.addEventListener("click", () => startCabinetCable("copper"));
  elements.cancelCableType.addEventListener("click", () => setActiveTool(null));

  elements.nameInput.addEventListener("input", (event) => updateCamera("name", event.target.value));
  elements.modelInput.addEventListener("input", (event) => updateCamera("model", event.target.value));
  elements.ipInput.addEventListener("input", (event) => updateCamera("ip", event.target.value));
  elements.macInput.addEventListener("input", (event) => updateCamera("mac", event.target.value));

  function setFov(rawValue) {
    const value = clamp(Number(rawValue) || 1, 1, 180);
    elements.fovInput.value = value;
    elements.fovNumber.value = value;
    updateCamera("fov", value);
  }

  elements.fovInput.addEventListener("input", (event) => setFov(event.target.value));
  elements.fovNumber.addEventListener("input", (event) => {
    if (event.target.value !== "") setFov(event.target.value);
  });
  elements.fovNumber.addEventListener("change", (event) => setFov(event.target.value));

  function syncCameraRangeInputs(camera) {
    const limits = cameraRangeLimits();
    const percent = Math.round(cameraRangePercent(camera));
    elements.rangeInput.min = MIN_CAMERA_RANGE_PERCENT;
    elements.rangeNumber.min = MIN_CAMERA_RANGE_PERCENT;
    elements.rangeInput.max = limits.maxPercent;
    elements.rangeNumber.max = limits.maxPercent;
    elements.rangeInput.value = percent;
    elements.rangeNumber.value = percent;
  }

  function setCameraRangePercent(rawValue) {
    const camera = getCamera(state.selectedCameraId);
    if (!camera) return;
    const limits = cameraRangeLimits();
    const percent = clamp(Number(rawValue) || MIN_CAMERA_RANGE_PERCENT, MIN_CAMERA_RANGE_PERCENT, limits.maxPercent);
    camera.range = clamp(limits.base * percent / 100, limits.min, limits.max);
    syncCameraRangeInputs(camera);
    renderObjects();
  }

  elements.rangeInput.addEventListener("input", (event) => setCameraRangePercent(event.target.value));
  elements.rangeNumber.addEventListener("input", (event) => {
    if (event.target.value !== "") setCameraRangePercent(event.target.value);
  });
  elements.rangeNumber.addEventListener("change", (event) => setCameraRangePercent(event.target.value));

  elements.detachCamera.addEventListener("click", () => {
    const camera = getCamera(state.selectedCameraId);
    if (!camera) return;
    camera.mountId = null;
    refreshEditor();
  });

  elements.deleteCamera.addEventListener("click", () => {
    const cameraId = state.selectedCameraId;
    const camera = getCamera(cameraId);
    if (!camera) return;
    const linkedCableCount = state.cables.filter((cable) => cable.sourceKind === "camera" && cable.sourceId === cameraId).length;
    if (linkedCableCount && !window.confirm(`Удалить «${camera.name}»?\n\nВместе с камерой будут удалены связанные кабели.`)) return;
    state.cameras = state.cameras.filter((camera) => camera.id !== cameraId);
    state.cables = state.cables.filter((cable) => !(cable.sourceKind === "camera" && cable.sourceId === cameraId));
    state.selectedCameraId = null;
    refreshEditor();
  });
  elements.closeProperties.addEventListener("click", clearSelection);

  elements.mountNameInput.addEventListener("input", (event) => {
    const mount = getMount(state.selectedMountId);
    if (!mount) return;
    mount.name = event.target.value;
    renderObjects();
    renderObjectList();
  });
  elements.addMountedCamera.addEventListener("click", () => {
    if (!getMount(state.selectedMountId)) return;
    const willOpen = elements.mountCameraMenu.hidden;
    if (willOpen) renderFreeCameraMenu();
    elements.mountCameraMenu.hidden = !willOpen;
    elements.addMountedCamera.setAttribute("aria-expanded", String(willOpen));
  });
  elements.addNewMountedCamera.addEventListener("click", () => {
    const mountId = state.selectedMountId;
    hideMountCameraMenu();
    if (getMount(mountId)) setActiveTool("camera", mountId);
  });
  elements.freeCameraList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-free-camera-id]");
    const mount = getMount(state.selectedMountId);
    const camera = getCamera(item?.dataset.freeCameraId);
    if (!item || !mount || !camera) return;
    camera.mountId = mount.id;
    hideMountCameraMenu();
    selectCamera(camera.id);
  });
  elements.deleteMount.addEventListener("click", () => {
    const mountId = state.selectedMountId;
    const mount = getMount(mountId);
    if (!mount) return;
    const attachedCount = state.cameras.filter((camera) => camera.mountId === mountId).length;
    const routedCableCount = state.cables.filter((cable) => cable.viaMountIds.includes(mountId)).length;
    if ((attachedCount || routedCableCount) && !window.confirm(
      `Удалить «${mount.name}»?\n\nКамеры будут отвязаны, а точка будет убрана из маршрутов кабелей.`,
    )) return;
    state.cameras.forEach((camera) => {
      if (camera.mountId === mountId) camera.mountId = null;
    });
    state.mounts = state.mounts.filter((mount) => mount.id !== mountId);
    state.cables.forEach((cable) => {
      cable.viaMountIds = cable.viaMountIds.filter((id) => id !== mountId);
    });
    state.selectedMountId = null;
    refreshEditor();
  });
  elements.closeMountProperties.addEventListener("click", clearSelection);

  elements.cabinetNameInput.addEventListener("input", (event) => {
    const cabinet = getCabinet(state.selectedCabinetId);
    if (!cabinet) return;
    cabinet.name = event.target.value;
    renderObjects();
    renderObjectList();
  });
  elements.openCabinetCard.addEventListener("click", () => {
    const cabinet = getCabinet(state.selectedCabinetId);
    if (!cabinet) return;
    if (getCabinetCard(cabinet).open) closeCabinetCard(cabinet);
    else openCabinetCard(cabinet);
  });
  elements.deleteCabinet.addEventListener("click", () => {
    const cabinetId = state.selectedCabinetId;
    const cabinet = getCabinet(cabinetId);
    if (!cabinet) return;
    const connectedCableCount = state.cables.filter((cable) =>
      cable.targetCabinetId === cabinetId || (cable.sourceKind === "cabinet" && cable.sourceId === cabinetId)).length;
    if ((connectedCableCount || cabinetEquipment(cabinet).length) && !window.confirm(
      `Удалить «${cabinet.name}»?\n\nБудут также удалены его оборудование и связанные кабели.`,
    )) return;
    state.cabinets = state.cabinets.filter((cabinet) => cabinet.id !== cabinetId);
    state.cables = state.cables.filter((cable) =>
      cable.targetCabinetId !== cabinetId && !(cable.sourceKind === "cabinet" && cable.sourceId === cabinetId));
    state.selectedCabinetId = null;
    refreshEditor();
  });
  elements.closeCabinetProperties.addEventListener("click", clearSelection);

  elements.cableNameInput.addEventListener("input", (event) => {
    const cable = getCable(state.selectedCableId);
    if (!cable) return;
    cable.name = event.target.value;
    renderObjectList();
  });
  elements.deleteCable.addEventListener("click", () => {
    state.cables = state.cables.filter((cable) => cable.id !== state.selectedCableId);
    state.selectedCableId = null;
    refreshEditor();
  });
  elements.closeCableProperties.addEventListener("click", clearSelection);

  elements.objectsLayer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    hideCableBundlePicker();
    const cabinetCard = event.target.closest(".cabinet-card");
    if (cabinetCard) {
      event.stopPropagation();
      const resizeHandle = event.target.closest(".cabinet-card__resize-handle");
      if (resizeHandle) {
        event.preventDefault();
        const cabinet = getCabinet(cabinetCard.dataset.cabinetCardId);
        const card = cabinet && getCabinetCard(cabinet);
        if (!cabinet || !card) return;
        const now = performance.now();
        const previous = state.lastCardResizePointerDown;
        const isDoubleClick = previous && previous.cabinetId === cabinet.id && now - previous.time < 450 &&
          Math.abs(event.clientX - previous.clientX) < 8;
        state.lastCardResizePointerDown = isDoubleClick ? null : {
          cabinetId: cabinet.id,
          time: now,
          clientX: event.clientX,
        };
        if (isDoubleClick) {
          card.width = CABINET_CARD_WIDTH;
          selectCabinet(cabinet.id);
          return;
        }
        const interaction = {
          type: "resizeCabinetCard",
          cabinetId: cabinet.id,
          startClientX: event.clientX,
          startWidth: card.width,
        };
        selectCabinet(cabinet.id);
        state.objectInteraction = interaction;
        return;
      }
      if (event.target.closest("button, input, textarea, select, label")) return;
      const header = event.target.closest(".cabinet-card__header");
      if (!header) return;
      event.preventDefault();
      state.lastCardResizePointerDown = null;
      const cabinet = getCabinet(cabinetCard.dataset.cabinetCardId);
      const card = cabinet && getCabinetCard(cabinet);
      if (!cabinet || !card) return;
      const interaction = {
        type: "moveCabinetCard",
        cabinetId: cabinet.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: card.x,
        startY: card.y,
      };
      selectCabinet(cabinet.id);
      state.objectInteraction = interaction;
      return;
    }
    const rotationHandle = event.target.closest(".rotation-handle");
    const rangeHandle = event.target.closest(".range-handle");
    const cameraControl = event.target.closest(".camera-control");
    const mountControl = event.target.closest(".mount-control");
    const cabinetControl = event.target.closest(".cabinet-control");
    const cableHit = event.target.closest(".cable-hit");
    const target = rotationHandle || rangeHandle || cameraControl || mountControl || cabinetControl || cableHit;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();

    if (state.activeTool === "cable") {
      if (cameraControl) handleCableNode("camera", cameraControl.dataset.cameraId);
      else if (mountControl) handleCableNode("mount", mountControl.dataset.mountId);
      else if (cabinetControl) handleCableNode("cabinet", cabinetControl.dataset.cabinetId);
      return;
    }

    setActiveTool(null);

    if (cableHit) {
      const cableIds = cableHit.dataset.cableIds.split(",").filter(Boolean);
      if (cableIds.length === 1) selectCable(cableIds[0]);
      else showCableBundlePicker(cableIds, cableHit.dataset.cableType, event.clientX, event.clientY);
      return;
    }

    if (cabinetControl) {
      const cabinet = getCabinet(cabinetControl.dataset.cabinetId);
      if (!cabinet) return;
      const now = performance.now();
      const previous = state.lastCabinetPointerDown;
      const isDoubleClick = previous && previous.cabinetId === cabinet.id && now - previous.time < 450 &&
        Math.hypot(event.clientX - previous.clientX, event.clientY - previous.clientY) < 8;
      state.lastCabinetPointerDown = isDoubleClick ? null : {
        cabinetId: cabinet.id,
        time: now,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (isDoubleClick) {
        openCabinetCard(cabinet);
        return;
      }
      selectCabinet(cabinet.id);
      state.objectInteraction = {
        type: "moveCabinet",
        cabinetId: cabinet.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: cabinet.x,
        startY: cabinet.y,
      };
      return;
    }

    if (mountControl) {
      const mount = getMount(mountControl.dataset.mountId);
      if (!mount) return;
      selectMount(mount.id);
      const attached = state.cameras
        .filter((camera) => camera.mountId === mount.id)
        .map((camera) => ({ id: camera.id, x: camera.x, y: camera.y }));
      state.objectInteraction = {
        type: "moveMount",
        mountId: mount.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: mount.x,
        startY: mount.y,
        attached,
      };
      return;
    }

    const camera = getCamera((rotationHandle || rangeHandle || cameraControl).dataset.cameraId);
    if (!camera) return;
    selectCamera(camera.id);
    state.objectInteraction = rotationHandle
      ? { type: "rotate", cameraId: camera.id }
      : rangeHandle
        ? { type: "resizeRange", cameraId: camera.id }
        : {
          type: "moveCamera",
          cameraId: camera.id,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: camera.x,
          startY: camera.y,
        };
  });

  elements.objectsLayer.addEventListener("dblclick", (event) => {
    const control = event.target.closest(".cabinet-control");
    if (!control || state.activeTool === "cable") return;
    const cabinet = getCabinet(control.dataset.cabinetId);
    if (!cabinet) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveTool(null);
    openCabinetCard(cabinet);
  });

  elements.objectsLayer.addEventListener("wheel", (event) => {
    if (event.target.closest(".cabinet-card")) event.stopPropagation();
  }, { passive: true });

  window.addEventListener("pointermove", (event) => {
    const interaction = state.objectInteraction;
    if (!interaction) return;

    if (interaction.type === "resizeCabinetCard") {
      const cabinet = getCabinet(interaction.cabinetId);
      const card = cabinet && getCabinetCard(cabinet);
      if (!card) return;
      if (Math.abs(event.clientX - interaction.startClientX) > 4) state.lastCardResizePointerDown = null;
      card.width = clamp(
        interaction.startWidth + (event.clientX - interaction.startClientX) / state.elementScale,
        MIN_CABINET_CARD_WIDTH,
        MAX_CABINET_CARD_WIDTH,
      );
    } else if (interaction.type === "moveCabinetCard") {
      const cabinet = getCabinet(interaction.cabinetId);
      const card = cabinet && getCabinetCard(cabinet);
      if (!card) return;
      card.x = interaction.startX + (event.clientX - interaction.startClientX) / state.view.scale;
      card.y = interaction.startY + (event.clientY - interaction.startClientY) / state.view.scale;
    } else if (interaction.type === "moveMount") {
      const mount = getMount(interaction.mountId);
      if (!mount) return;
      const points = [{ x: interaction.startX, y: interaction.startY }, ...interaction.attached];
      const delta = AppMath.clampGroupDelta(
        points,
        (event.clientX - interaction.startClientX) / state.view.scale,
        (event.clientY - interaction.startClientY) / state.view.scale,
        state.imageWidth,
        state.imageHeight,
      );
      mount.x = interaction.startX + delta.x;
      mount.y = interaction.startY + delta.y;
      interaction.attached.forEach((start) => {
        const camera = getCamera(start.id);
        if (camera) {
          camera.x = start.x + delta.x;
          camera.y = start.y + delta.y;
        }
      });
    } else if (interaction.type === "moveCabinet") {
      const cabinet = getCabinet(interaction.cabinetId);
      if (!cabinet) return;
      if (Math.hypot(event.clientX - interaction.startClientX, event.clientY - interaction.startClientY) > 4) {
        state.lastCabinetPointerDown = null;
      }
      cabinet.x = clamp(interaction.startX + (event.clientX - interaction.startClientX) / state.view.scale, 0, state.imageWidth);
      cabinet.y = clamp(interaction.startY + (event.clientY - interaction.startClientY) / state.view.scale, 0, state.imageHeight);
    } else {
      const camera = getCamera(interaction.cameraId);
      if (!camera) return;
      if (interaction.type === "moveCamera") {
        camera.x = clamp(interaction.startX + (event.clientX - interaction.startClientX) / state.view.scale, 0, state.imageWidth);
        camera.y = clamp(interaction.startY + (event.clientY - interaction.startClientY) / state.view.scale, 0, state.imageHeight);
        state.snapTargetId = nearestMount(camera.x, camera.y)?.id || null;
      } else if (interaction.type === "resizeRange") {
        const point = workspacePoint(event.clientX, event.clientY);
        const limits = cameraRangeLimits();
        camera.range = AppMath.rangeFromPoint(camera, point, camera.direction, limits.min, limits.max);
        syncCameraRangeInputs(camera);
      } else {
        const point = workspacePoint(event.clientX, event.clientY);
        camera.direction = (Math.atan2(point.y - camera.y, point.x - camera.x) * 180 / Math.PI + 360) % 360;
      }
    }
    renderObjects();
  });

  function finishObjectInteraction() {
    const interaction = state.objectInteraction;
    if (!interaction) return;
    if (interaction?.type === "moveCamera" && state.snapTargetId) {
      const camera = getCamera(interaction.cameraId);
      if (camera) camera.mountId = state.snapTargetId;
    }
    state.objectInteraction = null;
    state.snapTargetId = null;
    syncProperties();
    renderObjects();
    renderObjectList();
  }

  window.addEventListener("pointerup", finishObjectInteraction);
  window.addEventListener("pointercancel", finishObjectInteraction);

  elements.workspace.addEventListener("wheel", (event) => {
    if (!state.imageWidth) return;
    event.preventDefault();
    const rect = elements.workspace.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const factor = Math.exp(-event.deltaY * 0.0015);
    const nextScale = clamp(state.view.scale * factor, state.fitScale * 0.1, state.fitScale * 20);
    state.view = AppMath.zoomAt(state.view, cursorX, cursorY, nextScale);
    state.fitted = false;
    renderView();
    renderObjects();
  }, { passive: false });

  elements.workspace.addEventListener("pointerdown", (event) => {
    hideCableBundlePicker();
    if (!state.imageWidth || event.button !== 0) return;
    if (state.activeTool) {
      event.preventDefault();
      if (state.activeTool === "cable") return;
      const point = workspacePoint(event.clientX, event.clientY);
      if (!isInsideMap(point)) return;
      if (state.activeTool === "camera") addCamera(point, state.cameraMountId);
      else if (state.activeTool === "cabinet") addCabinet(point);
      else addMount(point, state.activeTool);
      return;
    }

    state.dragging = true;
    state.fitted = false;
    state.pointerId = event.pointerId;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    elements.workspace.setPointerCapture(event.pointerId);
    elements.workspace.classList.add("is-dragging");
  });

  elements.workspace.addEventListener("pointermove", (event) => {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    state.view.x += event.clientX - state.lastPointer.x;
    state.view.y += event.clientY - state.lastPointer.y;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    renderView();
  });

  function finishDrag(event) {
    if (event.pointerId !== state.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    elements.workspace.classList.remove("is-dragging");
  }

  elements.workspace.addEventListener("pointerup", finishDrag);
  elements.workspace.addEventListener("pointercancel", finishDrag);

  document.addEventListener("keydown", (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && !event.altKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && !event.altKey && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (event.key === "Escape") {
      hideCableBundlePicker();
      if (state.activeTool) setActiveTool(null);
    }
    if (event.key === "Delete" && !event.target.matches("input")) {
      if (state.selectedCameraId) elements.deleteCamera.click();
      else if (state.selectedMountId) elements.deleteMount.click();
      else if (state.selectedCabinetId) elements.deleteCabinet.click();
      else if (state.selectedCableId) elements.deleteCable.click();
    }
  });

  const resizeObserver = new ResizeObserver((entries) => {
    if (!state.imageWidth) return;
    const rect = entries[0].contentRect;
    if (state.fitted) {
      fitMap();
      return;
    }
    const previous = state.workspaceSize;
    if (previous.width && previous.height) {
      state.view.x += (rect.width - previous.width) / 2;
      state.view.y += (rect.height - previous.height) / 2;
      renderView();
    }
    state.workspaceSize = { width: rect.width, height: rect.height };
  });

  resizeObserver.observe(elements.workspace);

  document.addEventListener("input", (event) => {
    refreshDirtyState();
    recordHistory(historyInputKey(event.target));
  });
  document.addEventListener("change", () => window.queueMicrotask(() => {
    refreshDirtyState();
    recordHistory();
  }));
  document.addEventListener("click", () => window.queueMicrotask(() => {
    refreshDirtyState();
    recordHistory();
  }));
  window.addEventListener("pointerup", () => window.queueMicrotask(() => {
    refreshDirtyState();
    recordHistory();
  }));
  window.addEventListener("pointercancel", () => window.queueMicrotask(() => {
    refreshDirtyState();
    recordHistory();
  }));

  window.addEventListener("beforeunload", (event) => {
    refreshDirtyState();
    if (!state.isDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("pagehide", releaseImageUrl);

  markProjectClean();
  resetHistory();
})();
