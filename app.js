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

    placeLabels(items, width, height, gap = 3, margin = 4) {
      const placed = [];
      const overlaps = (candidate) => placed.some((item) => !(
        candidate.x + candidate.width + gap <= item.x ||
        item.x + item.width + gap <= candidate.x ||
        candidate.y + candidate.height + gap <= item.y ||
        item.y + item.height + gap <= candidate.y
      ));
      const fits = (candidate) => (
        candidate.x >= margin && candidate.y >= margin &&
        candidate.x + candidate.width <= width - margin &&
        candidate.y + candidate.height <= height - margin
      );

      return items.map((item) => {
        const candidates = [];
        const base = item.radius + 4;
        const rings = Math.max(6, items.length + 2);
        for (let ring = 0; ring < rings; ring += 1) {
          const vertical = ring * (item.height + gap);
          const sideShift = Math.ceil(ring / 2) * (item.height + gap) * (ring % 2 ? 1 : -1);
          candidates.push(
            { x: item.anchorX - item.width / 2, y: item.anchorY + base + vertical },
            { x: item.anchorX - item.width / 2, y: item.anchorY - base - item.height - vertical },
            { x: item.anchorX + base, y: item.anchorY - item.height / 2 + sideShift },
            { x: item.anchorX - base - item.width, y: item.anchorY - item.height / 2 + sideShift },
          );
        }

        let position = candidates.find((candidate) => fits({ ...candidate, width: item.width, height: item.height }) &&
          !overlaps({ ...candidate, width: item.width, height: item.height }));
        if (!position) {
          const stepX = Math.max(36, item.width + gap);
          const stepY = item.height + gap;
          for (let y = margin; !position && y + item.height <= height - margin; y += stepY) {
            for (let x = margin; x + item.width <= width - margin; x += stepX) {
              const candidate = { x, y, width: item.width, height: item.height };
              if (!overlaps(candidate)) {
                position = { x, y };
                break;
              }
            }
          }
        }

        if (!position) return { hidden: true, x: 0, y: 0 };
        const result = { ...position, width: item.width, height: item.height, hidden: false };
        placed.push(result);
        return result;
      });
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
    toggleLabelsButton: document.querySelector("#toggle-labels"),
    savePdfButton: document.querySelector("#save-pdf"),
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
    cameraLabelsLayer: document.querySelector("#camera-labels-layer"),
    status: document.querySelector("#status"),
    zoomStatus: document.querySelector("#zoom-status"),
    elementScaleInput: document.querySelector("#element-scale"),
    elementScaleValue: document.querySelector("#element-scale-value"),
    error: document.querySelector("#error-message"),
    cameraTool: document.querySelector("#camera-tool"),
    poleTool: document.querySelector("#pole-tool"),
    cabinetTool: document.querySelector("#cabinet-tool"),
    cableTool: document.querySelector("#cable-tool"),
    objectList: document.querySelector("#object-list"),
    cameraProperties: document.querySelector("#camera-properties"),
    statusInput: document.querySelector("#camera-status"),
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
    printSheet: document.querySelector("#print-sheet"),
    printTitle: document.querySelector("#print-title"),
    printSummary: document.querySelector("#print-summary"),
    printDate: document.querySelector("#print-date"),
    printDiagram: document.querySelector("#print-diagram"),
  };

  elements.propertiesPopover.append(
    elements.cameraProperties,
    elements.mountProperties,
    elements.cabinetProperties,
    elements.cableProperties,
  );

  const state = {
    activeWorkspace: "map",
    openCabinetTabs: [],
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
    showLabels: false,
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
    showCabinetProperties: true,
    selectedCableId: null,
    activeTool: null,
    cameraMountId: null,
    objectInteraction: null,
    snapTargetId: null,
    cableDraft: null,
    pendingCableSourceId: null,
    lastCabinetPointerDown: null,
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
    titleBeforePrint: null,
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

  function serializableCabinet(cabinet) {
    return {
      id: cabinet.id,
      name: cabinet.name,
      note: cabinet.note || "",
      modelImage: cabinet.modelImage || "",
      locationImage: cabinet.locationImage || "",
      internalConnections: validInternalConnections(cabinet, state.cables),
      schemeLayout: normalizeSchemeLayout(cabinet.schemeLayout),
      x: cabinet.x,
      y: cabinet.y,
      equipment: cabinetEquipment(cabinet).map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        model: item.model,
        ip: item.ip,
        ports: item.ports,
        uplinkPorts: item.uplinkPorts ?? (item.type === "poe-switch" ? "2" : "0"),
        note: item.note,
        modelImage: item.modelImage || "",
        locationImage: item.locationImage || "",
      })),
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
        showLabels: state.showLabels,
        ...(includeImage ? { viewport: { ...state.view, ...state.workspaceSize } } : {}),
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
      cameras: state.cameras.map(({ active, ...camera }) => ({ ...camera, status: cameraStatus({ active, ...camera }) })),
      mounts: state.mounts.map((mount) => ({ ...mount })),
      cabinets: state.cabinets.map(serializableCabinet),
      cables: state.cables.map((cable) => ({
        ...cable, viaMountIds: [...cable.viaMountIds],
        sourcePoint: cable.sourcePoint ? { ...cable.sourcePoint } : null,
        routePoints: cable.routePoints?.map((point) => ({ ...point })),
        targetConnection: validPortConnection(cable.targetConnection, getCabinet(cable.targetCabinetId)),
        sourceConnection: cable.sourceKind === "cabinet" ? validPortConnection(cable.sourceConnection, getCabinet(cable.sourceId)) : null,
      })),
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
    const field = target.tagName;
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
    state.showLabels = Boolean(restored.settings.showLabels);
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

  const CAMERA_STATUSES = {
    active: { label: "Активна", color: "#16a34a" },
    alarm: { label: "Авария", color: "#dc2626" },
    problem: { label: "Проблемная", color: "#eab308" },
    off: { label: "Выключена", color: "#111111" },
    removed: { label: "Демонтирована", color: "#9ca3af" },
  };

  function cameraStatus(camera) {
    return Object.hasOwn(CAMERA_STATUSES, camera?.status) ? camera.status : camera?.active === false ? "off" : "active";
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

  function equipmentType(typeId) {
    return EQUIPMENT_TYPES.find((type) => type.id === typeId) || EQUIPMENT_TYPES[EQUIPMENT_TYPES.length - 1];
  }

  function cabinetEquipment(cabinet) {
    if (!Array.isArray(cabinet.equipment)) cabinet.equipment = [];
    return cabinet.equipment;
  }

  function cameraCountText(count) {
    const lastTwo = count % 100;
    const last = count % 10;
    if (last === 1 && lastTwo !== 11) return `${count} камера`;
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} камеры`;
    return `${count} камер`;
  }

  function addEquipment(cabinet, typeId, { render = true } = {}) {
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
    if (render) renderObjects();
    return equipment;
  }

  function removeEquipment(cabinet, equipmentId) {
    cabinet.equipment = cabinetEquipment(cabinet).filter((item) => item.id !== equipmentId);
    cabinet.internalConnections = validInternalConnections(cabinet);
    state.cables.forEach((cable) => {
      if (cable.sourceKind === "cabinet" && cable.sourceId === cabinet.id) cable.sourceConnection = validPortConnection(cable.sourceConnection, cabinet);
      if (cable.targetCabinetId === cabinet.id) cable.targetConnection = validPortConnection(cable.targetConnection, cabinet);
    });
    if (cabinet.schemeLayout?.positions) delete cabinet.schemeLayout.positions[`device:${equipmentId}`];
    schemeSelection = null; selectedSchemeWire = null;
    recordHistory(); refreshDirtyState(); renderCabinetScheme();
  }

  function openEquipmentProperties(cabinet, device) {
    const dialog = document.querySelector("#equipment-properties-dialog");
    const form = document.createElement("form");
    form.method = "dialog";
    const title = document.createElement("h2");
    title.textContent = `Свойства · ${device.name || equipmentType(device.type).name}`;
    form.append(title);
    const fields = new Map();
    [["name", "Название"], ["model", "Модель"], ["ip", "IP-адрес"], ["ports", "Количество портов"], ["uplinkPorts", "Uplink-порты"], ["note", "Описание"]].forEach(([key, caption]) => {
      const label = document.createElement("label"); label.className = "field";
      const text = document.createElement("span"); text.textContent = caption;
      const input = document.createElement(key === "note" ? "textarea" : "input");
      input.value = device[key] ?? "";
      input.id = `equipment-properties-${key}`;
      if (key === "ports" || key === "uplinkPorts") {
        input.type = "number"; input.min = "0"; input.max = key === "ports" ? "512" : "32"; input.step = "1";
      } else { input.type = "text"; input.maxLength = 5000; }
      fields.set(key, input); label.append(text, input); form.append(label);
    });
    const actions = document.createElement("div"); actions.className = "equipment-properties-actions";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "button"; cancel.textContent = "Отмена";
    cancel.addEventListener("click", () => dialog.close());
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "button"; remove.textContent = "Удалить устройство";
    remove.addEventListener("click", () => {
      if (!window.confirm(`Удалить «${device.name || equipmentType(device.type).name}» и его соединения?`)) return;
      removeEquipment(cabinet, device.id); dialog.close();
    });
    const save = document.createElement("button"); save.type = "submit"; save.className = "button button--primary"; save.textContent = "Сохранить";
    actions.append(remove, cancel, save); form.append(actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      fields.forEach((input, key) => { device[key] = key === "ports" || key === "uplinkPorts" ? String(clamp(Math.floor(Number(input.value) || 0), 0, key === "ports" ? 512 : 32)) : input.value; });
      cabinet.internalConnections = validInternalConnections(cabinet);
      cabinetCables(cabinet).forEach((cable) => { cable[connectionKey(cable, cabinet)] = cablePortConnection(cable, cabinet); });
      dialog.close(); recordHistory(); refreshDirtyState(); renderCabinetScheme();
    });
    dialog.replaceChildren(form); dialog.showModal();
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
    elements.objectsLayer.style.setProperty("--tooltip-scale", String(1 / (scale * state.elementScale)));
    elements.zoomStatus.textContent = `Масштаб: ${Math.round(scale * 100)}%`;
    renderCameraLabels();
  }

  function fitMap() {
    if (state.activeWorkspace !== "map") {
      state.fitted = true;
      return;
    }
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
    const freeNode = (point) => ({ ...point, key: `point:${point.x}:${point.y}` });
    const nodes = [cable.sourceKind === "point" ? freeNode(cable.sourcePoint) : routeNode(cable.sourceKind, cable.sourceId)];
    if (cable.routePoints) cable.routePoints.forEach((point) => nodes.push(point.mountId ? routeNode("mount", point.mountId) : freeNode(point)));
    else cable.viaMountIds.forEach((id) => nodes.push(routeNode("mount", id)));
    if (cable.targetCabinetId) nodes.push(routeNode("cabinet", cable.targetCabinetId));
    else if (cable.targetCameraId) nodes.push(routeNode("camera", cable.targetCameraId));
    return nodes.filter(Boolean).filter((node, index, all) => index === 0 || node.key !== all[index - 1].key);
  }

  function bindCableEndpoint(cable, endpoint, point) {
    const candidates = [
      ...state.cabinets.map((item) => ({ kind: "cabinet", item })),
      ...(cable.type === "copper" ? state.cameras.map((item) => ({ kind: "camera", item })) : []),
    ].filter(({ kind, item }) => endpoint === "source"
      ? !(kind === "cabinet" && item.id === cable.targetCabinetId) && !(kind === "camera" && item.id === cable.targetCameraId)
      : !(kind === cable.sourceKind && item.id === cable.sourceId));
    const nearest = candidates.map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.item.x - point.x, candidate.item.y - point.y) }))
      .filter((candidate) => candidate.distance <= 24 / state.view.scale).sort((a, b) => a.distance - b.distance)[0];
    if (!nearest) return false;
    if (endpoint === "source") {
      cable.sourceKind = nearest.kind; cable.sourceId = nearest.item.id; cable.sourcePoint = null; cable.sourceConnection = null;
    } else {
      cable.routePoints.pop();
      cable.targetCabinetId = nearest.kind === "cabinet" ? nearest.item.id : null;
      cable.targetCameraId = nearest.kind === "camera" ? nearest.item.id : null;
      cable.targetConnection = null;
    }
    return true;
  }

  function cableTypeName(type) {
    return type === "copper" ? "Витая пара" : "Оптоволокно";
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
      if (state.cableDraft.cursor) nodes.push(state.cableDraft.cursor);
      for (let index = 0; index < nodes.length - 1; index += 1) {
        const path = makeSvg("path", {
          d: `M ${nodes[index].x} ${nodes[index].y} L ${nodes[index + 1].x} ${nodes[index + 1].y}`,
        });
        path.classList.add("cable-line", `cable-line--${state.cableDraft.type}`, "is-draft");
        svg.append(path);
      }
      cableRouteNodes(state.cableDraft).forEach((point) => {
        const vertex = makeSvg("circle", { cx: point.x, cy: point.y, r: 3 / state.view.scale });
        vertex.classList.add("cable-draft-vertex");
        svg.append(vertex);
      });
    }
    const selected = getCable(state.selectedCableId);
    if (selected && !state.activeTool) {
      const handles = [
        ...(selected.sourceKind === "point" ? [{ point: selected.sourcePoint, field: "sourcePoint" }] : []),
        ...(selected.routePoints || []).flatMap((point, index) => point.mountId ? [] : [{ point, field: "routePoints", index }]),
      ];
      handles.forEach(({ point, field, index }) => {
        const handle = makeSvg("circle", { cx: point.x, cy: point.y, r: 5 / state.view.scale });
        handle.classList.add("cable-vertex");
        handle.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          state.objectInteraction = { type: "moveCableVertex", cableId: selected.id, field, index };
        });
        svg.append(handle);
      });
    }
    elements.objectsLayer.append(svg);
  }

  function appendCamera(camera) {
    const object = document.createElement("div");
    object.className = "camera-object";
    const status = cameraStatus(camera);
    object.dataset.status = status;
    object.classList.toggle("is-inactive", status === "off" || status === "removed");
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
    control.style.setProperty("--camera-color", CAMERA_STATUSES[status].color);
    control.title = `${camera.name} ? ${CAMERA_STATUSES[status].label}`;
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
    control.title = "Двойной щелчок — открыть схему";
    const tooltip = document.createElement("div");
    tooltip.className = "cabinet-tooltip";
    tooltip.textContent = cabinet.name;
    object.append(control, tooltip);
    elements.objectsLayer.append(object);
  }

  function syncObjectLabels() {
    const action = state.showLabels ? "Скрыть названия камер" : "Показать названия камер";
    elements.toggleLabelsButton.setAttribute("aria-pressed", String(state.showLabels));
    elements.toggleLabelsButton.title = action;
    elements.toggleLabelsButton.setAttribute("aria-label", action);
    elements.toggleLabelsButton.dataset.tooltip = action;
  }

  function renderCameraLabels() {
    elements.cameraLabelsLayer.replaceChildren();
    elements.cameraLabelsLayer.hidden = !state.showLabels || !state.imageWidth;
    if (elements.cameraLabelsLayer.hidden) return;

    const width = elements.workspace.clientWidth;
    const height = elements.workspace.clientHeight;
    // Keep label placement in screen pixels within the scene's stacking context.
    elements.cameraLabelsLayer.style.width = `${width}px`;
    elements.cameraLabelsLayer.style.height = `${height}px`;
    elements.cameraLabelsLayer.style.transform = `scale(${1 / state.view.scale}) translate(${-state.view.x}px, ${-state.view.y}px)`;
    const records = state.cameras.map((camera) => {
      const anchorX = state.view.x + camera.x * state.view.scale;
      const anchorY = state.view.y + camera.y * state.view.scale;
      if (anchorX < -40 || anchorY < -40 || anchorX > width + 40 || anchorY > height + 40) return null;
      const label = document.createElement("span");
      label.className = "camera-name-label";
      if (camera.id === state.selectedCameraId) label.classList.add("is-selected");
      label.dataset.cameraLabelId = camera.id;
      label.textContent = camera.name || "Камера без названия";
      elements.cameraLabelsLayer.append(label);
      return { camera, label, anchorX, anchorY };
    }).filter(Boolean);

    const items = records.map(({ label, anchorX, anchorY }) => ({
      anchorX,
      anchorY,
      width: label.offsetWidth,
      height: label.offsetHeight,
      radius: Math.max(10, 14 * state.view.scale * state.elementScale),
    }));
    const positions = AppMath.placeLabels(items, width, height);
    records.forEach(({ label }, index) => {
      const position = positions[index];
      label.hidden = position.hidden;
      if (position.hidden) return;
      label.style.left = `${Math.round(position.x)}px`;
      label.style.top = `${Math.round(position.y)}px`;
    });
  }

  const mapTab = document.querySelector("#map-tab");
  const equipmentTab = document.querySelector("#equipment-tab");
  const equipmentPanel = document.querySelector("#equipment-panel");
  const equipmentSearch = document.querySelector("#equipment-search");
  const equipmentGroups = document.querySelector("#equipment-groups");

  function switchWorkspace(tab) {
    state.activeWorkspace = tab;
    setActiveTool(null);
    const isMap = tab === "map";
    elements.workspace.hidden = !isMap;
    equipmentPanel.hidden = tab !== "equipment";
    document.querySelector("#cabinet-scheme-panel").hidden = !tab.startsWith("cabinet:");
    document.querySelector(".editor-layout").classList.toggle("is-equipment", !isMap);
    [mapTab, equipmentTab].forEach((button, index) => {
      const selected = tab === (index === 0 ? "map" : "equipment");
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    renderCabinetTabs();
    if (isMap) refreshEditor();
    else if (tab === "equipment") renderEquipment();
    else renderCabinetScheme();
  }

  mapTab.addEventListener("click", () => switchWorkspace("map"));
  equipmentTab.addEventListener("click", () => switchWorkspace("equipment"));
  document.querySelector(".workspace-tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('.workspace-tabs [role="tab"]')];
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    next.click();
    document.querySelector('.workspace-tabs [aria-selected="true"]')?.focus();
  });
  equipmentSearch.addEventListener("input", renderEquipment);

  function openCabinetScheme(id) {
    if (!getCabinet(id)) return;
    if (!state.openCabinetTabs.includes(id)) state.openCabinetTabs.push(id);
    switchWorkspace(`cabinet:${id}`);
  }

  document.querySelector("#open-cabinet-scheme").addEventListener("click", () => openCabinetScheme(state.selectedCabinetId));

  function renderCabinetTabs() {
    const tabs = document.querySelector(".workspace-tabs");
    tabs.querySelectorAll(".cabinet-workspace-tab").forEach((tab) => tab.remove());
    state.openCabinetTabs.forEach((id) => {
      const cabinet = getCabinet(id);
      if (!cabinet) return;
      const wrapper = document.createElement("div");
      wrapper.className = "cabinet-workspace-tab";
      const button = document.createElement("button");
      button.type = "button";
      button.id = `cabinet-tab-${id}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", "cabinet-scheme-panel");
      const selected = state.activeWorkspace === `cabinet:${id}`;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.textContent = cabinet.name || "Шкаф";
      button.addEventListener("click", () => openCabinetScheme(id));
      const close = document.createElement("button");
      close.type = "button";
      close.className = "cabinet-workspace-tab__close";
      close.textContent = "×";
      close.setAttribute("aria-label", `Закрыть вкладку: ${cabinet.name || "Шкаф"}`);
      close.addEventListener("click", () => {
        state.openCabinetTabs = state.openCabinetTabs.filter((item) => item !== id);
        if (selected) switchWorkspace("map");
        else renderCabinetTabs();
        document.querySelector('.workspace-tabs [aria-selected="true"]')?.focus();
      });
      wrapper.append(button, close);
      tabs.append(wrapper);
    });
  }

  function reconcileCabinetTabs() {
    state.openCabinetTabs = state.openCabinetTabs.filter((id) => getCabinet(id));
    if (state.activeWorkspace.startsWith("cabinet:") && !getCabinet(state.activeWorkspace.slice(8))) {
      switchWorkspace("map");
    } else renderCabinetTabs();
  }

  function cabinetCables(cabinet) {
    return state.cables.filter((cable) => cable.targetCabinetId === cabinet.id ||
      (cable.sourceKind === "cabinet" && cable.sourceId === cabinet.id));
  }

  function connectionKey(cable, cabinet) {
    return cable.targetCabinetId === cabinet.id ? "targetConnection" : "sourceConnection";
  }

  function equipmentPorts(item) {
    return clamp(Math.floor(Number(item.ports) || 0), 0, 512);
  }

  function validPortConnection(connection, cabinet) {
    if (!connection || !cabinet) return null;
    const equipment = cabinetEquipment(cabinet).find((item) => item.id === connection.equipmentId);
    return equipment && Number.isInteger(connection.port) && connection.port > 0 &&
      (connection.port <= equipmentPorts(equipment) || (connection.port > 512 && connection.port <= 512 + equipmentUplinks(equipment)))
      ? { equipmentId: equipment.id, port: connection.port } : null;
  }

  function cablePortConnection(cable, cabinet) {
    return validPortConnection(cable[connectionKey(cable, cabinet)], cabinet);
  }

  function assignCablePort(cable, cabinet, equipmentId, port) {
    if (!cabinetCables(cabinet).includes(cable)) return "Кабель не относится к этому шкафу.";
    const key = connectionKey(cable, cabinet);
    if (!equipmentId) { cable[key] = null; return ""; }
    const connection = validPortConnection({ equipmentId, port: Number(port) }, cabinet);
    if (!connection) return "Выберите устройство и доступный порт.";
    const occupied = cabinetCables(cabinet).some((other) => {
      const assigned = cablePortConnection(other, cabinet);
      return other !== cable && assigned?.equipmentId === connection.equipmentId && assigned.port === connection.port;
    });
    if (occupied) return "Этот порт уже занят другим кабелем.";
    if (validInternalConnections(cabinet).some((link) => [link.from, link.to].some((end) => samePort(end, connection)))) return "Этот порт занят внутренним соединением.";
    cable[key] = connection;
    return "";
  }

  function equipmentUplinks(item) {
    return clamp(Math.floor(Number(item.uplinkPorts ?? (item.type === "poe-switch" ? 2 : 0)) || 0), 0, 32);
  }

  function samePort(a, b) { return a?.equipmentId === b?.equipmentId && a?.port === b?.port; }

  function validInternalConnections(cabinet, cables = state.cables) {
    const occupied = new Set();
    const key = (end) => `${end.equipmentId}:${end.port}`;
    cables.forEach((cable) => {
      if (cable.targetCabinetId !== cabinet.id && !(cable.sourceKind === "cabinet" && cable.sourceId === cabinet.id)) return;
      const end = cablePortConnection(cable, cabinet);
      if (end) occupied.add(key(end));
    });
    return (Array.isArray(cabinet.internalConnections) ? cabinet.internalConnections : []).flatMap((link, index) => {
      const from = validPortConnection(link?.from, cabinet), to = validPortConnection(link?.to, cabinet);
      if (!from || !to || from.equipmentId === to.equipmentId || occupied.has(key(from)) || occupied.has(key(to))) return [];
      occupied.add(key(from)); occupied.add(key(to));
      return [{ id: typeof link.id === "string" ? link.id.slice(0, 100) : `internal-${index}`, from, to }];
    });
  }

  function assignInternalConnection(cabinet, from, to) {
    from = validPortConnection(from, cabinet); to = validPortConnection(to, cabinet);
    if (!from || !to) return "Выберите два существующих порта.";
    if (from.equipmentId === to.equipmentId) return "Выберите порт другого устройства.";
    const links = validInternalConnections(cabinet);
    const occupied = (end) => cabinetCables(cabinet).some((cable) => samePort(cablePortConnection(cable, cabinet), end)) ||
      links.some((link) => samePort(link.from, end) || samePort(link.to, end));
    if (occupied(from) || occupied(to)) return "Порт уже занят. Сначала удалите существующую связь.";
    cabinet.internalConnections = [...links, { id: `internal-${Date.now()}-${links.length}`, from, to }];
    return "";
  }

  function portLabel(device, port) {
    return port > 512 ? `Uplink ${port - 512}` : `${device.type === "poe-switch" ? "PoE " : "Порт "}${port}`;
  }

  let schemeSelection = null;
  let selectedSchemeWire = null;
  let schemeMessage = "";
  const schemeScrollPositions = new Map();

  function resetCabinetSchemeSession() {
    schemeScrollPositions.clear();
    schemeSelection = null; selectedSchemeWire = null; schemeMessage = "";
    state.openCabinetTabs = [];
    document.querySelector("#cabinet-scheme-panel").replaceChildren();
    switchWorkspace("map");
  }

  function normalizeSchemeLayout(raw) {
    const positions = {};
    if (raw?.positions && typeof raw.positions === "object") {
      Object.entries(raw.positions).slice(0, 10000).forEach(([key, point]) => {
        if (!/^(cable|device):.+$/.test(key) || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
        positions[key] = { x: clamp(point.x, 0, 20000), y: clamp(point.y, 0, 20000) };
      });
    }
    return { scale: clamp(Number(raw?.scale) || 1, 0.2, 2.5), positions };
  }

  function routeSchemeWire(a, b, blocks, lane = 0) {
    const lead = 32 + lane * 8, padding = 12 + lane * 8;
    const offset = (point) => ({ x: point.x + (point.direction === "right" ? lead : 0), y: point.y + (point.direction === "right" ? 0 : lead) });
    const start = offset(a), end = offset(b);
    const obstacles = blocks.map((block) => ({ left: block.x - padding, right: block.x + block.width + padding, top: block.y - padding, bottom: block.y + block.height + padding }));
    const xs = [...new Set([start.x, end.x, 4, ...obstacles.flatMap((box) => [Math.max(4, box.left), box.right])])].sort((x, y) => x - y);
    const ys = [...new Set([start.y, end.y, 4, ...obstacles.flatMap((box) => [Math.max(4, box.top), box.bottom])])].sort((x, y) => x - y);
    const clear = (p, q) => !obstacles.some((box) => p.x === q.x
      ? p.x > box.left && p.x < box.right && Math.max(p.y, q.y) > box.top && Math.min(p.y, q.y) < box.bottom
      : p.y > box.top && p.y < box.bottom && Math.max(p.x, q.x) > box.left && Math.min(p.x, q.x) < box.right);
    const queue = [{ x: xs.indexOf(start.x), y: ys.indexOf(start.y), direction: "", cost: 0, previous: null }], best = new Map();
    let found = null;
    while (queue.length) {
      queue.sort((p, q) => (q.cost + Math.abs(xs[q.x] - end.x) + Math.abs(ys[q.y] - end.y)) - (p.cost + Math.abs(xs[p.x] - end.x) + Math.abs(ys[p.y] - end.y)));
      const current = queue.pop(), point = { x: xs[current.x], y: ys[current.y] };
      const key = `${current.x}:${current.y}:${current.direction}`;
      if (best.has(key) && best.get(key) < current.cost) continue;
      if (point.x === end.x && point.y === end.y) { found = current; break; }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const x = current.x + dx, y = current.y + dy;
        if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) return;
        const next = { x: xs[x], y: ys[y] };
        if (!clear(point, next)) return;
        const direction = dx ? "h" : "v";
        const cost = current.cost + Math.abs(point.x - next.x) + Math.abs(point.y - next.y) + (current.direction && current.direction !== direction ? 24 : 0);
        const nextKey = `${x}:${y}:${direction}`;
        if (best.has(nextKey) && best.get(nextKey) <= cost) return;
        best.set(nextKey, cost); queue.push({ x, y, direction, cost, previous: current });
      });
    }
    const middle = [];
    for (let point = found; point; point = point.previous) middle.unshift({ x: xs[point.x], y: ys[point.y] });
    const points = found ? [a, ...middle, b] : [a, start, { x: start.x, y: Math.max(start.y, end.y) + 32 }, { x: end.x, y: Math.max(start.y, end.y) + 32 }, end, b];
    return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  }

  function renderCabinetScheme(printCabinet = null, printPanel = null) {
    const cabinet = printCabinet || getCabinet(state.activeWorkspace.slice(8));
    if (!cabinet) return;
    if (!printCabinet && schemeSelection?.cabinetId !== cabinet.id) schemeSelection = null;
    if (!printCabinet && selectedSchemeWire?.cabinetId !== cabinet.id) selectedSchemeWire = null;
    const panel = printPanel || document.querySelector("#cabinet-scheme-panel");
    const oldScroll = panel.querySelector(".scheme-canvas-scroll");
    if (oldScroll?.dataset.cabinetId) schemeScrollPositions.set(oldScroll.dataset.cabinetId, { x: oldScroll.scrollLeft || 0, y: oldScroll.scrollTop || 0 });
    panel.setAttribute("aria-labelledby", `cabinet-tab-${cabinet.id}`);
    panel.replaceChildren();
    const node = (tag, text, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; };
    const button = (text, action, cls = "button") => { const el = node("button", text, cls); el.type = "button"; el.addEventListener("click", action); return el; };
    const cables = cabinetCables(cabinet), devices = cabinetEquipment(cabinet), links = validInternalConnections(cabinet);
    const connected = cables.filter((cable) => cablePortConnection(cable, cabinet)).length;
    const layout = normalizeSchemeLayout(cabinet.schemeLayout);
    const toolbar = node("div", "", "scheme-visual-toolbar");
    const status = node("p", schemeMessage || (schemeSelection ? "Выберите второй конец соединения." : `Подключено ${connected}/${cables.length} · Связей ${links.length}`), "scheme-summary");
    status.setAttribute("role", "status"); toolbar.append(status);
    const addMenu = node("details", "", "scheme-add-equipment");
    addMenu.append(node("summary", "+ Добавить оборудование"));
    const addChoices = node("div", "", "scheme-add-equipment__choices");
    EQUIPMENT_TYPES.forEach((type) => {
      const choice = button(`${type.icon} ${type.name}`, () => {
        const equipment = addEquipment(cabinet, type.id, { render: false });
        const point = { x: clamp(scroll.scrollLeft / layout.scale + 40, 0, 20000), y: clamp(scroll.scrollTop / layout.scale + 40, 0, 20000) };
        const width = deviceWidth(equipment);
        let collision;
        while ((collision = blocks.find((block) => point.x < block.x + block.width + 16 && point.x + width + 16 > block.x && point.y < block.y + block.height + 16 && point.y + 120 > block.y)) && point.y < 20000) {
          point.y = Math.min(20000, collision.y + collision.height + 24);
        }
        layout.positions[`device:${equipment.id}`] = point;
        cabinet.schemeLayout = layout;
        schemeSelection = null; selectedSchemeWire = null; schemeMessage = `Добавлено: ${equipment.name}. Укажите количество портов на блоке.`;
        scroll.scrollLeft = Math.max(0, (point.x - 24) * layout.scale); scroll.scrollTop = Math.max(0, (point.y - 24) * layout.scale);
        rememberScroll(); recordHistory(); refreshDirtyState(); renderCabinetScheme();
        const updatedScroll = panel.querySelector(".scheme-canvas-scroll");
        if (updatedScroll) {
          updatedScroll.scrollLeft = Math.max(0, (point.x - 24) * layout.scale);
          updatedScroll.scrollTop = Math.max(0, (point.y - 24) * layout.scale);
          schemeScrollPositions.set(cabinet.id, { x: updatedScroll.scrollLeft, y: updatedScroll.scrollTop });
        }
      });
      choice.dataset.equipmentType = type.id;
      addChoices.append(choice);
    });
    addMenu.append(addChoices); toolbar.append(addMenu);
    const help = node("details", "", "scheme-help");
    help.append(node("summary", "?"), node("p", "Перетаскивайте блоки за заголовок. Камера → порт или порт → порт создаёт связь. Колесо меняет масштаб, перетаскивание фона перемещает область. Esc отменяет выбор."));
    if (schemeSelection || selectedSchemeWire) toolbar.append(button("Отменить выбор", () => { schemeSelection = null; selectedSchemeWire = null; schemeMessage = ""; renderCabinetScheme(); }));
    if (selectedSchemeWire) toolbar.append(button("Удалить выбранную связь", () => {
      const selected = selectedSchemeWire;
      if (selected.kind === "cable") {
        const cable = cables.find((item) => item.id === selected.id);
        if (cable) cable[connectionKey(cable, cabinet)] = null;
      } else cabinet.internalConnections = links.filter((link) => link.id !== selected.id);
      selectedSchemeWire = null; schemeSelection = null; schemeMessage = "Соединение удалено.";
      recordHistory(); refreshDirtyState(); renderCabinetScheme();
    }));
    panel.append(toolbar);
    const scroll = node("div", "", "scheme-canvas-scroll");
    scroll.dataset.cabinetId = cabinet.id;
    const stage = node("div", "", "scheme-canvas-stage");
    const board = node("div", "", "scheme-canvas");
    const svg = makeSvg("svg", { class: "scheme-wires", width: 1240, height: 800 });
    const anchors = new Map(), pinElements = new Map();
    const blocks = [], wires = [];
    let suppressClick = false;
    let boardWidth = 1600, boardHeight = 1000;
    const zoomLabel = node("output", `${Math.round(layout.scale * 100)}%`, "scheme-zoom-label");
    function updateExtent() {
      boardWidth = Math.max(1600, ...blocks.map((block) => block.x + block.width + 400));
      boardHeight = Math.max(1000, ...blocks.map((block) => block.y + block.height + 400));
      board.style.width = `${boardWidth}px`; board.style.height = `${boardHeight}px`;
      svg.setAttribute("width", String(boardWidth)); svg.setAttribute("height", String(boardHeight));
      board.style.transform = `scale(${layout.scale})`;
      stage.style.width = `${boardWidth * layout.scale}px`; stage.style.height = `${boardHeight * layout.scale}px`;
      zoomLabel.textContent = `${Math.round(layout.scale * 100)}%`;
    }
    function zoom(scale, x = scroll.clientWidth / 2, y = scroll.clientHeight / 2) {
      const worldX = (scroll.scrollLeft + x) / layout.scale, worldY = (scroll.scrollTop + y) / layout.scale;
      layout.scale = clamp(scale, 0.2, 2.5); cabinet.schemeLayout = layout; updateExtent();
      scroll.scrollLeft = worldX * layout.scale - x; scroll.scrollTop = worldY * layout.scale - y;
      recordHistory(`scheme-zoom:${cabinet.id}`); refreshDirtyState();
    }
    toolbar.append(button("−", () => zoom(layout.scale / 1.2)), zoomLabel, button("+", () => zoom(layout.scale * 1.2)),
      button("Вписать", () => {
        if (!blocks.length) { zoom(1); scroll.scrollLeft = 0; scroll.scrollTop = 0; return; }
        const minX = Math.max(0, Math.min(...blocks.map((block) => block.x - 24), 20000));
        const minY = Math.max(0, Math.min(...blocks.map((block) => block.y - 24), 20000));
        const right = Math.max(400, ...blocks.map((block) => block.x + block.width + 24));
        const bottom = Math.max(300, ...blocks.map((block) => block.y + block.height + 24));
        zoom(Math.min(scroll.clientWidth / (right - minX), scroll.clientHeight / (bottom - minY)));
        scroll.scrollLeft = Math.max(0, minX * layout.scale); scroll.scrollTop = Math.max(0, minY * layout.scale);
      }), button("100%", () => zoom(1)), help);
    function rememberScroll() { schemeScrollPositions.set(cabinet.id, { x: scroll.scrollLeft, y: scroll.scrollTop }); }
    scroll.addEventListener("scroll", rememberScroll);
    scroll.addEventListener("wheel", (event) => {
      event.preventDefault(); const rect = scroll.getBoundingClientRect();
      zoom(layout.scale * Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
    scroll.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".scheme-node, .scheme-pin, .scheme-wire, .scheme-uplink-caption")) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY, left: scroll.scrollLeft, top: scroll.scrollTop };
      scroll.setPointerCapture(event.pointerId); scroll.classList.add("is-panning");
      const pan = (next) => { if (next.pointerId === event.pointerId) { scroll.scrollLeft = start.left - next.clientX + start.x; scroll.scrollTop = start.top - next.clientY + start.y; } };
      const finish = (next) => {
        if (next.pointerId !== event.pointerId) return;
        scroll.removeEventListener("pointermove", pan); scroll.removeEventListener("pointerup", finish); scroll.removeEventListener("pointercancel", finish);
        scroll.classList.remove("is-panning");
        if (scroll.hasPointerCapture(event.pointerId)) scroll.releasePointerCapture(event.pointerId);
        rememberScroll();
      };
      scroll.addEventListener("pointermove", pan); scroll.addEventListener("pointerup", finish); scroll.addEventListener("pointercancel", finish);
    });
    function redrawWires() { wires.forEach((item) => item.update()); }
    function movable(key, card, x, y, width, height, elements, keys) {
      const block = { key, x, y, width, height }; blocks.push(block);
      function move(nextX, nextY) {
        const dx = nextX - block.x, dy = nextY - block.y;
        elements.forEach((element) => { element.style.left = `${parseFloat(element.style.left) + dx}px`; element.style.top = `${parseFloat(element.style.top) + dy}px`; });
        keys.forEach((anchor) => { const point = anchors.get(anchor); point.x += dx; point.y += dy; });
        block.x = nextX; block.y = nextY;
      }
      const saved = layout.positions[key]; if (saved) move(saved.x, saved.y);
      card.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !event.target.closest(".scheme-node > strong")) return;
        event.preventDefault(); event.stopPropagation();
        const start = { x: event.clientX, y: event.clientY, left: block.x, top: block.y };
        let moved = false; card.setPointerCapture(event.pointerId); card.classList.add("is-moving");
        const drag = (next) => {
          if (next.pointerId !== event.pointerId) return;
          if (!moved && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 4) return;
          moved = true;
          move(clamp(start.left + (next.clientX - start.x) / layout.scale, 0, 20000), clamp(start.top + (next.clientY - start.y) / layout.scale, 0, 20000));
          updateExtent(); redrawWires();
        };
        const finish = (next) => {
          if (next.pointerId !== event.pointerId) return;
          card.removeEventListener("pointermove", drag); card.removeEventListener("pointerup", finish); card.removeEventListener("pointercancel", finish);
          card.classList.remove("is-moving");
          if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
          if (!moved) return;
          suppressClick = true; window.setTimeout(() => { suppressClick = false; }, 0);
          layout.positions[key] = { x: block.x, y: block.y }; cabinet.schemeLayout = layout;
          recordHistory(); refreshDirtyState(); rememberScroll();
        };
        card.addEventListener("pointermove", drag); card.addEventListener("pointerup", finish); card.addEventListener("pointercancel", finish);
      });
    }
    const anchorKey = (end) => end.kind === "cable" ? `cable:${end.cableId}` : `${end.equipmentId}:${end.port}`;
    function pick(end) {
      if (suppressClick) return;
      selectedSchemeWire = null; schemeMessage = "";
      if (!schemeSelection) { schemeSelection = { ...end, cabinetId: cabinet.id }; renderCabinetScheme(); return; }
      const first = schemeSelection;
      if (anchorKey(first) === anchorKey(end)) { schemeSelection = null; renderCabinetScheme(); return; }
      let error;
      if (first.kind === "cable" && end.kind === "cable") error = "Выберите порт устройства.";
      else if (first.kind === "cable" || end.kind === "cable") {
        const cableEnd = first.kind === "cable" ? first : end, portEnd = first.kind === "cable" ? end : first;
        const cable = cables.find((item) => item.id === cableEnd.cableId);
        error = cable ? assignCablePort(cable, cabinet, portEnd.equipmentId, portEnd.port) : "Кабель удалён.";
      } else error = assignInternalConnection(cabinet, first, end);
      if (error) { schemeMessage = error; renderCabinetScheme(); return; }
      schemeSelection = null; recordHistory(); refreshDirtyState(); renderCabinetScheme();
    }
    function pin(end, text, x, y, used, socket = false) {
      const selected = schemeSelection && anchorKey(schemeSelection) === anchorKey(end);
      const el = button(text, () => pick(end), `scheme-pin${used ? " is-used" : ""}${selected ? " is-selected" : ""}`);
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      if (socket) { el.className += " scheme-pin--socket"; el.textContent = end.port > 512 ? `U${end.port - 512}` : String(end.port); }
      el.title = text;
      el.setAttribute("aria-pressed", String(Boolean(selected)));
      el.setAttribute("aria-label", end.kind === "cable" ? text : `${devices.find((item) => item.id === end.equipmentId)?.name || "Устройство"}: ${text}${used ? ", занят" : ", свободен"}`);
      board.append(el); pinElements.set(anchorKey(end), el);
      anchors.set(anchorKey(end), socket ? { x: x + 24, y: y + 44, direction: "bottom" } : { x: x + 66, y: y + 14, direction: "right" });
    }
    cables.forEach((cable, index) => {
      const elementStart = board.children.length;
      const y = 24 + index * 132;
      const source = cable.targetCabinetId === cabinet.id ? endpointName(cable.sourceKind, cable.sourceId) : endpointName(cable.targetCameraId ? "camera" : "cabinet", cable.targetCameraId || cable.targetCabinetId);
      const card = node("article", "", "scheme-node scheme-node--external");
      card.style.left = "20px"; card.style.top = `${y}px`;
      const remoteKind = cable.targetCabinetId === cabinet.id ? cable.sourceKind : cable.targetCameraId ? "camera" : cable.targetCabinetId ? "cabinet" : "point";
      const camera = remoteKind === "camera" ? getCamera(cable.targetCabinetId === cabinet.id ? cable.sourceId : cable.targetCameraId) : null;
      const heading = camera ? `Камера · ${source}` : `${remoteKind === "point" ? "Точка" : "Шкаф"} · ${source}`;
      const installationLabel = cable.type === "copper" ? (cable.installation === "outdoor" ? "Уличная" : cable.installation === "indoor" ? "Внутренняя" : "") : "";
      const cableName = cable.name || cableTypeName(cable.type);
      const cableLabel = installationLabel ? `${installationLabel} ${cableName.replace(/^Витая пара/i, "витая пара")}` : cableName;
      const cableDetails = [cable.cableSpecification,
        cable.lengthMeters != null ? `${cable.lengthMeters} м` : ""].filter(Boolean).join(" · ");
      card.append(node("strong", heading));
      if (camera) card.append(node("p", camera.model || "Модель не указана"));
      card.append(node("p", cableLabel));
      if (cableDetails) card.append(node("small", cableDetails));
      card.title = [heading, camera?.model, cableLabel, cableDetails].filter(Boolean).join("\n");
      card.tabIndex = 0; card.setAttribute("role", "button"); card.setAttribute("aria-label", `Подключить: ${source}, ${cable.name}`);
      card.addEventListener("click", () => pick({ kind: "cable", cableId: cable.id }));
      card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick({ kind: "cable", cableId: cable.id }); } });
      board.append(card);
      pin({ kind: "cable", cableId: cable.id }, "Выход ●", 210, y + 52, Boolean(cablePortConnection(cable, cabinet)));
      movable(`cable:${cable.id}`, card, 20, y, 260, 108, [...board.children].slice(elementStart), [`cable:${cable.id}`]);
    });
    const heights = [24, 24];
    const deviceWidth = (device) => Math.max(320, 32 + equipmentPorts(device) * 58 + (equipmentUplinks(device) ? 32 + equipmentUplinks(device) * 58 : 0));
    const columnWidth = Math.max(350, ...devices.map(deviceWidth)) + 100;
    devices.forEach((device, index) => {
      const elementStart = board.children.length, oldAnchors = new Set(anchors.keys());
      const col = index % 2, x = 360 + col * columnWidth, y = heights[col];
      const main = equipmentPorts(device), uplinks = equipmentUplinks(device);
      const width = deviceWidth(device), height = 104;
      heights[col] += height + 40;
      const card = node("article", "", "scheme-node scheme-node--device"); card.style.left = `${x}px`; card.style.top = `${y}px`; card.style.height = `${height}px`;
      card.style.width = `${width}px`;
      const name = node("strong", `${equipmentType(device.type).icon} ${device.name || equipmentType(device.type).name}`);
      name.title = device.name || equipmentType(device.type).name;
      const type = node("p", equipmentType(device.type).name);
      type.title = [equipmentType(device.type).name, device.model].filter(Boolean).join(" · ");
      card.append(name, type);
      if (!printCabinet) {
        const edit = button("Свойства", () => openEquipmentProperties(cabinet, device), "scheme-device-edit");
        edit.setAttribute("aria-label", `Свойства: ${device.name || equipmentType(device.type).name}`);
        card.append(edit);
        card.addEventListener("dblclick", (event) => {
          if (event.target.closest("input, button")) return;
          event.preventDefault(); openEquipmentProperties(cabinet, device);
        });
      }
      const config = node("div", "", "scheme-port-config");
      [["ports", device.type === "poe-switch" ? "PoE" : "Порты", main, 512], ["uplinkPorts", "Uplink", uplinks, 32]].forEach(([field, title, value, max]) => {
        const label = node("label", `${title} `), input = node("input"); input.type = "number"; input.min = "0"; input.max = String(max); input.value = String(value);
        input.id = `scheme-${cabinet.id}-${device.id}-${field}`;
        input.addEventListener("change", () => {
          device[field] = String(clamp(Math.floor(Number(input.value) || 0), 0, max));
          cabinet.internalConnections = validInternalConnections(cabinet);
          cables.forEach((cable) => { cable[connectionKey(cable, cabinet)] = cablePortConnection(cable, cabinet); });
          schemeSelection = null; recordHistory(); refreshDirtyState(); renderCabinetScheme();
        });
        label.append(input); config.append(label);
      });
      card.append(config); board.append(card);
      const used = (port) => cables.some((cable) => samePort(cablePortConnection(cable, cabinet), { equipmentId: device.id, port })) || links.some((link) => [link.from, link.to].some((end) => samePort(end, { equipmentId: device.id, port })));
      const portCaption = node("span", device.type === "poe-switch" ? "PoE / RJ45" : "Порты", "scheme-uplink-caption"); portCaption.style.left = `${x + 16}px`; portCaption.style.top = `${y + 40}px`; board.append(portCaption);
      for (let i = 0; i < main; i += 1) pin({ kind: "port", equipmentId: device.id, port: i + 1 }, portLabel(device, i + 1), x + 16 + i * 58, y + 60, used(i + 1), true);
      if (uplinks) {
        const caption = node("span", "UPLINK", "scheme-uplink-caption"); caption.style.left = `${x + 48 + main * 58}px`; caption.style.top = `${y + 40}px`; board.append(caption);
        for (let i = 0; i < uplinks; i += 1) pin({ kind: "port", equipmentId: device.id, port: 513 + i }, portLabel(device, 513 + i), x + 48 + main * 58 + i * 58, y + 60, used(513 + i), true);
      }
      movable(`device:${device.id}`, card, x, y, width, height, [...board.children].slice(elementStart), [...anchors.keys()].filter((key) => !oldAnchors.has(key)));
    });
    function wire(from, to, kind, id, title) {
      const a = anchors.get(anchorKey(from)), b = anchors.get(anchorKey(to)); if (!a || !b) return;
      const lane = wires.length % 8;
      const route = routeSchemeWire(a, b, blocks, lane);
      const halo = makeSvg("path", { d: route, class: "scheme-wire-halo" });
      const path = makeSvg("path", { d: route, class: `scheme-wire${selectedSchemeWire?.kind === kind && selectedSchemeWire?.id === id ? " is-selected" : ""}`, tabindex: "0", role: "button", "aria-label": title });
      const colors = ["#2563eb", "#0891b2", "#7c3aed", "#d97706", "#059669", "#db2777", "#475569"];
      const colorIndex = [...`${kind}:${id}`].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length;
      path.style.setProperty("--wire-color", colors[colorIndex]);
      const tooltip = makeSvg("title"); tooltip.textContent = title; path.append(tooltip);
      const select = () => { selectedSchemeWire = { cabinetId: cabinet.id, kind, id }; schemeSelection = null; schemeMessage = title; renderCabinetScheme(); };
      path.addEventListener("click", select); path.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
      const endpoints = [pinElements.get(anchorKey(from)), pinElements.get(anchorKey(to))].filter(Boolean);
      endpoints.forEach((element) => { element.title = title; });
      const hover = (active) => {
        wires.forEach((item) => { item.path.style.opacity = active && item.path !== path ? "0.12" : "1"; item.halo.style.opacity = active && item.path !== path ? "0.12" : "1"; });
        path.classList.toggle("is-traced", active);
        endpoints.forEach((element) => element.classList.toggle("is-traced", active));
        if (active) status.textContent = title;
        else status.textContent = schemeMessage || (schemeSelection ? "Выберите второй конец соединения." : `Подключено ${connected}/${cables.length} · Связей ${links.length}`);
      };
      [path, ...endpoints].forEach((element) => {
        element.addEventListener("pointerenter", () => hover(true)); element.addEventListener("pointerleave", () => hover(false));
        element.addEventListener("focus", () => hover(true)); element.addEventListener("blur", () => hover(false));
      });
      wires.push({ path, halo, update() {
        const start = anchors.get(anchorKey(from)), end = anchors.get(anchorKey(to));
        const nextRoute = routeSchemeWire(start, end, blocks, lane);
        path.setAttribute("d", nextRoute); halo.setAttribute("d", nextRoute);
      } });
      svg.append(halo, path);
    }
    cables.forEach((cable) => {
      const end = cablePortConnection(cable, cabinet);
      const source = cable.targetCabinetId === cabinet.id ? endpointName(cable.sourceKind, cable.sourceId) : endpointName(cable.targetCameraId ? "camera" : "cabinet", cable.targetCameraId || cable.targetCabinetId);
      if (end) wire({ kind: "cable", cableId: cable.id }, end, "cable", cable.id, `${source} · ${cable.name} → ${devices.find((item) => item.id === end.equipmentId)?.name || "Устройство"}, ${portLabel(devices.find((item) => item.id === end.equipmentId), end.port)}`);
    });
    links.forEach((link) => wire(link.from, link.to, "internal", link.id, `${devices.find((item) => item.id === link.from.equipmentId)?.name || "Устройство"} (${portLabel(devices.find((item) => item.id === link.from.equipmentId), link.from.port)}) ↔ ${devices.find((item) => item.id === link.to.equipmentId)?.name || "Устройство"} (${portLabel(devices.find((item) => item.id === link.to.equipmentId), link.to.port)})`));
    board.append(svg); stage.append(board); scroll.append(stage); panel.append(scroll);
    updateExtent();
    const savedScroll = schemeScrollPositions.get(cabinet.id);
    if (savedScroll) { scroll.scrollLeft = savedScroll.x; scroll.scrollTop = savedScroll.y; }
    if (!devices.length) panel.append(node("p", "Нажмите «Добавить оборудование», чтобы наполнить шкаф.", "scheme-summary"));
    return { board, blocks };
  }

  function inventoryEntries() {
    return [
      ...state.cameras.map((item) => ({ item, type: "Камеры", location: getMount(item.mountId)?.name || "На карте", kind: "camera" })),
      ...state.mounts.map((item) => ({ item, type: item.type === "pole" ? "Столбы" : "Точки крепления", location: "На карте", kind: "mount" })),
      ...state.cabinets.flatMap((cabinet) => [
        { item: cabinet, type: "Шкафы", location: "На карте", kind: "cabinet" },
        ...cabinetEquipment(cabinet).map((item) => ({ item, type: equipmentType(item.type).name, location: cabinet.name || "Шкаф", kind: "equipment", cabinet })),
      ]),
      ...state.cables.map((item) => ({
        item,
        type: `Кабели · ${cableTypeName(item.type)}`,
        location: `${endpointName(item.sourceKind, item.sourceId)} → ${endpointName(item.targetCameraId ? "camera" : "cabinet", item.targetCameraId || item.targetCabinetId)}`,
        kind: "cable",
      })),
    ];
  }

  function inventoryColumns(entry) {
    const { kind, item } = entry;
    const columns = [{ key: "name", title: "Название" }];
    if (kind !== "camera" && kind !== "cabinet") columns.push({ key: "location", title: "Расположение", readOnly: true, value: (entry) => entry.location });
    if (kind === "camera" || kind === "equipment" || kind === "mount") columns.push(
      { key: "model", title: "Модель", readOnly: kind === "mount" },
      { key: "ip", title: "IP-адрес", readOnly: kind === "mount" },
      { key: kind === "camera" ? "mac" : "ports", title: "MAC / Порты", readOnly: kind === "mount" });
    if (kind === "cable") {
      columns.push({ key: "cableSpecification", title: "Тип" });
      if (item.type === "copper") columns.push({ key: "installation", title: "Прокладка", options: [["", "Не указано"], ["outdoor", "Уличная"], ["indoor", "Внутренняя"]], value: (entry) => entry.item.installation === "outdoor" ? "Уличная" : entry.item.installation === "indoor" ? "Внутренняя" : "" });
      columns.push({ key: "lengthMeters", title: "Длина, м" });
    }
    columns.push({ key: "note", title: "Описание", multiline: true });
    return columns;
  }

  function renderEquipment() {
    const entries = inventoryEntries();
    const query = equipmentSearch.value.trim().toLocaleLowerCase("ru");
    const filtered = entries.filter((entry) => [entry.type, entry.location, entry.item.name, entry.item.model, entry.item.ip, entry.item.mac, entry.item.note, entry.item.cableSpecification, entry.item.lengthMeters,
      entry.item.installation === "outdoor" ? "уличная" : entry.item.installation === "indoor" ? "внутренняя" : ""]
      .some((value) => String(value || "").toLocaleLowerCase("ru").includes(query)));
    document.querySelector("#equipment-count").textContent = query
      ? `Найдено: ${filtered.length} из ${entries.length}` : `Всего элементов: ${entries.length}`;
    equipmentGroups.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "equipment-empty";
      empty.textContent = entries.length ? "По вашему запросу ничего не найдено." : "Оборудования пока нет. Добавьте объекты на карте или оборудование в шкафы.";
      equipmentGroups.append(empty);
      return;
    }
    const groups = new Map();
    filtered.forEach((entry) => {
      if (!groups.has(entry.type)) groups.set(entry.type, []);
      groups.get(entry.type).push(entry);
    });
    groups.forEach((items, type) => {
      const group = document.createElement("details");
      group.className = "equipment-group";
      group.open = true;
      const summary = document.createElement("summary");
      summary.textContent = `${type} · ${items.length}`;
      const scroll = document.createElement("div");
      scroll.className = "equipment-table-scroll";
      const table = document.createElement("table");
      table.className = "equipment-table";
      const head = table.createTHead().insertRow();
      const columns = inventoryColumns(items[0]);
      [...columns.map(column => column.title), "\u0424\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0438", ""].forEach((title) => {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = title;
        head.append(th);
      });
      const body = table.createTBody();
      items.forEach((entry) => {
        const { item, kind } = entry;
        const row = body.insertRow();
        function field(key, label, multiline = false) {
          const cell = row.insertCell();
          const input = document.createElement(multiline ? "textarea" : "input");
          input.value = item[key] ?? "";
          input.id = `inventory-${kind}-${item.id}-${key}`;
          input.maxLength = key === "ports" ? 20 : 1000;
          input.setAttribute("aria-label", `${label}: ${item.name || type}`);
          input.placeholder = "Не указано";
          if (multiline) input.rows = 2;
          if (key === "ports") { input.type = "number"; input.min = "1"; input.max = "512"; }
          if (key === "cableSpecification") input.placeholder = item.type === "copper" ? "UTP, FTP…" : "Марка кабеля";
          if (key === "lengthMeters") { input.type = "number"; input.min = "0"; input.step = "any"; }
          input.addEventListener("input", () => {
            item[key] = key === "lengthMeters" ? (input.value === "" ? null : Math.max(0, Number(input.value) || 0)) : input.value;
          });
          input.addEventListener("change", () => {
            if (key === "ports" && input.value) {
              item.ports = String(clamp(Math.round(Number(input.value) || 1), 1, 512));
              input.value = item.ports;
            }
          });
          cell.append(input);
        }
        columns.forEach((column) => {
          if (column.readOnly) { row.insertCell().textContent = column.value ? column.value(entry) : "—"; return; }
          if (column.options) {
            const cell = row.insertCell();
            const select = document.createElement("select");
            select.id = `inventory-${kind}-${item.id}-${column.key}`;
            select.setAttribute("aria-label", `${column.title}: ${item.name || type}`);
            column.options.forEach(([value, label]) => {
              const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option);
            });
            select.value = item[column.key] || "";
            select.addEventListener("change", () => { item[column.key] = select.value; });
            cell.append(select);
          } else field(column.key, column.title, column.multiline);
        });
        {
          const photos = document.createElement("div");
          photos.className = "equipment-photos";
          objectImageKinds.forEach(({ key, title }) => {
            if (!item[key]) return;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "object-image__thumbnail";
            button.title = title;
            button.setAttribute("aria-label", `${item.name || "Камера"}: ${title}`);
            const image = document.createElement("img");
            image.src = item[key];
            image.alt = title;
            image.loading = "lazy";
            button.append(image);
            button.addEventListener("click", () => showObjectImage(item, key, title));
            photos.append(button);
          });
          row.cells[0].append(photos);
        }
        const imageCell = row.insertCell();
        const imageDetails = document.createElement("details");
        imageDetails.className = "equipment-image-editor";
        const imageSummary = document.createElement("summary");
        imageSummary.textContent = "Добавить / изменить фото";
        const imageEditor = document.createElement("div");
        imageEditor.className = "object-images";
        renderObjectImages(item, imageEditor);
        imageDetails.append(imageSummary, imageEditor);
        imageCell.append(imageDetails);
        const show = document.createElement("button");
        show.type = "button";
        show.className = "button";
        show.textContent = "На карте";
        show.addEventListener("click", () => {
          switchWorkspace("map");
          const target = kind === "cable" ? cableRouteNodes(item)[0] : entry.cabinet || item;
          if (kind === "camera") selectCamera(item.id);
          else if (kind === "mount") selectMount(item.id);
          else if (kind === "cable") selectCable(item.id);
          else selectCabinet(target.id);
          if (target) ensurePointVisible(target);
        });
        const actions = row.insertCell();
        actions.append(show);
        if (kind === "cabinet") {
          const scheme = document.createElement("button");
          scheme.type = "button";
          scheme.className = "button";
          scheme.textContent = "Схема подключений";
          scheme.addEventListener("click", () => openCabinetScheme(item.id));
          actions.append(scheme);
        }
      });
      scroll.append(table);
      group.append(summary, scroll);
      equipmentGroups.append(group);
    });
  }

  function renderObjects() {
    reconcileCabinetTabs();
    if (state.activeWorkspace.startsWith("cabinet:")) renderCabinetScheme();
    if (state.activeWorkspace === "equipment") renderEquipment();
    hideCableBundlePicker();
    syncObjectLabels();
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
    renderCameraLabels();
  }

  function renderPrintCameraLabels(layer, scale, offsetX, offsetY, width, height) {
    if (!state.showLabels) return;
    const records = state.cameras.map((camera) => {
      const anchorX = offsetX + camera.x * scale;
      const anchorY = offsetY + camera.y * scale;
      if (anchorX < -40 || anchorY < -40 || anchorX > width + 40 || anchorY > height + 40) return null;
      const label = document.createElement("span");
      label.className = "camera-name-label";
      label.textContent = camera.name || "Камера без названия";
      layer.append(label);
      return { label, anchorX, anchorY };
    }).filter(Boolean);
    const positions = AppMath.placeLabels(records.map(({ label, anchorX, anchorY }) => ({
      anchorX,
      anchorY,
      width: label.offsetWidth,
      height: label.offsetHeight,
      radius: Math.max(8, 14 * scale * state.elementScale),
    })), width, height);
    records.forEach(({ label }, index) => {
      const position = positions[index];
      label.hidden = position.hidden;
      if (position.hidden) return;
      label.style.left = `${Math.round(position.x)}px`;
      label.style.top = `${Math.round(position.y)}px`;
    });
  }

  function preparePrintAppendices(pageWidth, pageHeight) {
    elements.printSheet.querySelectorAll(".print-appendix").forEach((page) => page.remove());
    const makePage = (title) => {
      const page = document.createElement("section");
      page.className = "print-appendix";
      const heading = document.createElement("h2");
      heading.textContent = title;
      page.append(heading);
      elements.printSheet.append(page);
      return page;
    };
    const inventory = makePage("Перечень оборудования");
    const groups = new Map();
    inventoryEntries().forEach((entry) => {
      if (!groups.has(entry.type)) groups.set(entry.type, []);
      groups.get(entry.type).push(entry);
    });
    groups.forEach((entries, title) => {
      const heading = document.createElement("h3");
      heading.textContent = title;
      inventory.append(heading);
      const columns = inventoryColumns(entries[0]);
      const table = document.createElement("table");
      table.className = "print-inventory";
      const head = table.createTHead().insertRow();
      columns.forEach(({ title: label }) => {
        const cell = document.createElement("th");
        cell.textContent = label; cell.scope = "col"; head.append(cell);
      });
      const body = table.createTBody();
      entries.forEach((entry) => {
        const row = body.insertRow();
        columns.forEach((column) => { row.insertCell().textContent = (column.value ? column.value(entry) : column.readOnly ? "—" : entry.item[column.key]) ?? "—"; });
      });
      inventory.append(table);
    });
    state.cabinets.forEach((cabinet) => {
      const panel = document.createElement("div");
      const { board, blocks } = renderCabinetScheme(cabinet, panel);
      const padding = 24;
      const minX = blocks.length ? Math.max(0, Math.min(...blocks.map((block) => block.x - padding))) : 0;
      const minY = blocks.length ? Math.max(0, Math.min(...blocks.map((block) => block.y - padding))) : 0;
      const width = blocks.length ? Math.max(...blocks.map((block) => block.x + block.width + padding)) - minX : 400;
      const height = blocks.length ? Math.max(...blocks.map((block) => block.y + block.height + padding)) - minY : 200;
      const scale = Math.min(pageWidth / width, pageHeight / height);
      const page = makePage(`Схема шкафа · ${cabinet.name || "Шкаф"}`);
      page.classList.add("print-scheme-page");
      const frame = document.createElement("div");
      frame.className = "print-scheme-frame";
      const copy = board.cloneNode(true);
      copy.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      copy.querySelectorAll(".is-selected, .is-hovered").forEach((node) => node.classList.remove("is-selected", "is-hovered"));
      const offsetX = (pageWidth - width * scale) / 2 - minX * scale;
      const offsetY = (pageHeight - height * scale) / 2 - minY * scale;
      copy.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      frame.append(copy); page.append(frame);
    });
  }

  function preparePrintSheet() {
    if (!state.imageWidth || !state.imageHeight) return false;
    renderObjects();
    elements.printTitle.textContent = state.projectName || "Схема размещения камер";
    elements.printSummary.textContent = `Камер: ${state.cameras.length} · Креплений: ${state.mounts.length} · Шкафов: ${state.cabinets.length} · Кабелей: ${state.cables.length}`;
    const now = new Date();
    elements.printDate.dateTime = now.toISOString();
    elements.printDate.textContent = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(now);
    elements.printDiagram.replaceChildren();
    document.body.classList.add("is-preparing-print");

    const diagramWidth = elements.printDiagram.clientWidth;
    const diagramHeight = elements.printDiagram.clientHeight;
    // Fit the current viewport as a whole; keep all objects at their on-screen proportions.
    const viewport = elements.workspace.getBoundingClientRect();
    const width = viewport.width || state.workspaceSize.width || diagramWidth;
    const height = viewport.height || state.workspaceSize.height || diagramHeight;
    const fit = Math.min(diagramWidth / width, diagramHeight / height);
    const frame = document.createElement("div");
    frame.className = "print-viewport";
    Object.assign(frame.style, { width: width + "px", height: height + "px",
      left: (diagramWidth - width * fit) / 2 + "px", top: (diagramHeight - height * fit) / 2 + "px",
      transform: "scale(" + fit + ")" });
    const printScene = elements.scene.cloneNode(true);
    printScene.hidden = false;
    printScene.classList.add("print-scene");
    printScene.querySelector(".camera-labels-layer")?.remove();
    printScene.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    printScene.querySelectorAll(".is-selected, .is-snap-target, .is-editing").forEach((node) => {
      node.classList.remove("is-selected", "is-snap-target", "is-editing");
    });
    frame.append(printScene);
    const labels = document.createElement("div");
    labels.className = "print-camera-labels";
    frame.append(labels);
    elements.printDiagram.append(frame);
    renderPrintCameraLabels(labels, state.view.scale, state.view.x, state.view.y, width, height);
    preparePrintAppendices(diagramWidth, diagramHeight);
    document.body.classList.remove("is-preparing-print");

    if (state.titleBeforePrint === null) state.titleBeforePrint = document.title;
    document.title = `${state.projectName || "Схема камер"} — схема`;
    return true;
  }

  function finishPrint() {
    document.body.classList.remove("is-preparing-print");
    elements.printDiagram.replaceChildren();
    elements.printSheet.querySelectorAll(".print-appendix").forEach((page) => page.remove());
    if (state.titleBeforePrint !== null) {
      document.title = state.titleBeforePrint;
      state.titleBeforePrint = null;
    }
  }

  function saveAsPdf() {
    if (!preparePrintSheet()) return;
    window.print();
  }

  function ensurePrintSheet() {
    if (!elements.printDiagram.childElementCount) preparePrintSheet();
    if (state.imageWidth) document.title = `${state.projectName || "Схема камер"} — схема`;
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
    if (kind === "point" || !id) return "Точка на карте";
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
    detail.textContent = `${endpointName(cable.sourceKind, cable.sourceId)} → ${endpointName(cable.targetCameraId ? "camera" : "cabinet", cable.targetCameraId || cable.targetCabinetId)}`;
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

  function normalizeObjectImage(value) {
    if (typeof value !== "string" || value.length > 6 * 1024 * 1024) return "";
    return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : "";
  }

  const objectImageJobs = new WeakMap();
  const objectImageKinds = [
    { key: "modelImage", title: "Вид объекта" },
    { key: "locationImage", title: "Фото места установки" },
  ];

  function showObjectImage(object, key, title) {
    if (!object[key]) return;
    const dialog = document.querySelector("#image-viewer");
    document.querySelector("#image-viewer-title").textContent = `${object.name || "Объект"} · ${title}`;
    const image = document.querySelector("#image-viewer-image");
    image.src = object[key];
    image.alt = title;
    dialog.showModal();
  }

  document.querySelector("#close-image-viewer").addEventListener("click", () => document.querySelector("#image-viewer").close());
  document.querySelector("#image-viewer").addEventListener("close", () => document.querySelector("#image-viewer-image").removeAttribute("src"));

  async function prepareObjectImage(blob) {
    if (!/^image\/(?:jpeg|png|webp)$/i.test(blob.type)) throw new Error("Выберите изображение JPG, PNG или WebP.");
    if (blob.size > 20 * 1024 * 1024) throw new Error("Изображение слишком большое. Выберите файл до 20 МБ.");
    const url = URL.createObjectURL(blob);
    try {
      const image = await decodeImage(url);
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.86);
      if (!normalizeObjectImage(data)) throw new Error("Не удалось подготовить изображение. Выберите другой файл.");
      return data;
    } finally { URL.revokeObjectURL(url); }
  }

  async function loadObjectImage(object, key, source, status) {
    const jobs = objectImageJobs.get(object) || {};
    objectImageJobs.set(object, jobs);
    const token = {};
    jobs[key] = token;
    status.textContent = "Загрузка изображения…";
    try {
      let blob = source;
      if (typeof source === "string") {
        let url;
        try { url = new URL(source); } catch { throw new Error("Укажите прямую ссылку на изображение, начиная с https:// или http://."); }
        if (!["https:", "http:"].includes(url.protocol)) throw new Error("Ссылка должна начинаться с https:// или http://.");
        let response;
        try {
          response = await fetch(url.href, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(20000) });
        } catch { throw new Error("Сайт не разрешает загрузку или недоступен. Сохраните картинку и добавьте её файлом."); }
        if (!response.ok) throw new Error("Не удалось скачать изображение. Проверьте ссылку или загрузите файл.");
        if (Number(response.headers.get("content-length")) > 20 * 1024 * 1024) throw new Error("Изображение слишком большое. Выберите файл до 20 МБ.");
        blob = await response.blob();
      }
      const data = await prepareObjectImage(blob);
      if (jobs[key] !== token || !inventoryEntries().some((entry) => entry.item === object)) return;
      object[key] = data;
      recordHistory();
      refreshDirtyState();
      if (state.activeWorkspace === "equipment") renderEquipment();
    } catch (error) {
      if (jobs[key] === token) status.textContent = error.message || "Не удалось прочитать изображение.";
    }
  }

  function renderObjectImages(object, container) {
    container.replaceChildren();
    objectImageKinds.forEach(({ key, title }) => {
      const section = document.createElement("section");
      section.className = "object-image";
      const heading = document.createElement("strong");
      heading.textContent = title;
      section.append(heading);
      if (object[key]) {
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "object-image__preview";
        preview.setAttribute("aria-label", `Открыть: ${title}`);
        const image = document.createElement("img");
        image.src = object[key];
        image.alt = title;
        preview.append(image);
        preview.addEventListener("click", () => showObjectImage(object, key, title));
        section.append(preview);
      }
      const status = document.createElement("p");
      status.className = "object-image__status";
      status.setAttribute("role", "status");
      const label = document.createElement("label");
      label.className = "object-image__upload";
      label.textContent = object[key] ? "Заменить изображение" : "Загрузить изображение";
      const file = document.createElement("input");
      file.type = "file";
      file.accept = "image/jpeg,image/png,image/webp";
      file.addEventListener("change", () => {
        if (file.files[0]) loadObjectImage(object, key, file.files[0], status);
        file.value = "";
      });
      label.append(file);
      section.append(label);
      if (key === "modelImage") {
        const form = document.createElement("div");
        form.className = "object-image__url";
        const input = document.createElement("input");
        input.type = "url";
        input.placeholder = "Прямая ссылка на картинку";
        input.setAttribute("aria-label", "Ссылка на изображение объекта");
        const add = document.createElement("button");
        add.className = "button";
        add.type = "button";
        add.textContent = "Загрузить по ссылке";
        const load = () => loadObjectImage(object, key, input.value.trim(), status);
        add.addEventListener("click", load);
        input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); load(); } });
        form.append(input, add);
        section.append(form);
      }
      if (object[key]) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "object-image__remove";
        remove.textContent = "Удалить изображение";
        remove.addEventListener("click", () => {
          const jobs = objectImageJobs.get(object);
          if (jobs) jobs[key] = null;
          object[key] = "";
          if (state.activeWorkspace === "equipment") renderEquipment();
        });
        section.append(remove);
      }
      section.append(status);
      container.append(section);
    });
  }

  function syncProperties() {
    const camera = getCamera(state.selectedCameraId);
    const mount = getMount(state.selectedMountId);
    const cabinet = getCabinet(state.selectedCabinetId);
    const cable = getCable(state.selectedCableId);
    elements.cameraProperties.hidden = !camera;
    elements.mountProperties.hidden = !mount;
    elements.cabinetProperties.hidden = !cabinet || !state.showCabinetProperties;
    elements.cableProperties.hidden = !cable;

    if (camera) {
      elements.statusInput.value = cameraStatus(camera);
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
      elements.cabinetNameInput.value = cabinet.name;
    }

    if (cable) {
      elements.cableNameInput.value = cable.name;
      elements.cableType.textContent = cableTypeName(cable.type);
      elements.cableSource.textContent = endpointName(cable.sourceKind, cable.sourceId);
      elements.cableTarget.textContent = endpointName(cable.targetCameraId ? "camera" : "cabinet", cable.targetCameraId || cable.targetCabinetId);
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

  function selectCabinet(id, showProperties = true) {
    hideMountCameraMenu();
    state.showCabinetProperties = showProperties;
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
      status: "active",
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
      elements.placementHint.textContent = "Кликните начало на карте, камеру или шкаф";
    } else if (draft.type === "copper") {
      elements.placementHint.textContent = "Клик — поворот; шкаф, двойной клик или Enter — завершить; Esc — убрать отрезок";
    } else {
      elements.placementHint.textContent = "Клик — поворот; шкаф, двойной клик или Enter — завершить; Esc — убрать отрезок";
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
        routePoints: getMount(camera.mountId) ? [{ mountId: camera.mountId }] : [],
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
      routePoints: [],
      targetCabinetId: null,
    };
    state.pendingCableSourceId = null;
    hideCableTypePicker();
    updateCablePlacementHint();
    renderObjects();
  }

  function finishCable(targetCabinetId = null) {
    const draft = state.cableDraft;
    const target = getCabinet(targetCabinetId);
    if (!draft || (targetCabinetId && !target)) return;
    if (!target && !draft.routePoints?.length) return;
    if (target && draft.sourceKind === "cabinet" && draft.sourceId === target.id) {
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
      sourcePoint: draft.sourcePoint ? { ...draft.sourcePoint } : null,
      routePoints: (draft.routePoints || []).map((point) => ({ ...point })),
      targetCabinetId: target?.id || null,
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
      const points = state.cableDraft.routePoints;
      if (points[points.length - 1]?.mountId !== id) points.push({ mountId: id });
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
    elements.cabinetTool.disabled = !enabled;
    elements.cableTool.disabled = !enabled;
    elements.toggleLabelsButton.disabled = !enabled;
    elements.savePdfButton.disabled = !enabled;
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
      modelImage: normalizeObjectImage(item?.modelImage),
      locationImage: normalizeObjectImage(item?.locationImage),
      note: limitedText(item?.note),
      x: clamp(finiteNumber(item?.x), 0, width),
      y: clamp(finiteNumber(item?.y), 0, height),
    }));
    if (mounts.some((mount) => !mount.type)) throw new Error("Файл проекта повреждён: неизвестный тип крепления.");
    const mountIds = uniqueIds(mounts, "крепления");

    const cameras = projectArray(project.cameras, "камеры").map((item) => ({
      id: validId(item?.id, "камеры"),
      status: cameraStatus(item),
      x: clamp(finiteNumber(item?.x), 0, width),
      y: clamp(finiteNumber(item?.y), 0, height),
      direction: ((finiteNumber(item?.direction) % 360) + 360) % 360,
      fov: clamp(finiteNumber(item?.fov, 90), 1, 180),
      range: Math.max(1, finiteNumber(item?.range, Math.min(width, height) * DEFAULT_CAMERA_RANGE_PERCENT / 100)),
      name: limitedText(item?.name),
      model: limitedText(item?.model),
      ip: limitedText(item?.ip),
      mac: limitedText(item?.mac),
      modelImage: normalizeObjectImage(item?.modelImage),
      locationImage: normalizeObjectImage(item?.locationImage),
      note: limitedText(item?.note),
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
          uplinkPorts: String(clamp(Math.floor(Number(equipmentItem?.uplinkPorts ?? (equipmentItem?.type === "poe-switch" ? 2 : 0)) || 0), 0, 32)),
          note: limitedText(equipmentItem?.note),
          modelImage: normalizeObjectImage(equipmentItem?.modelImage),
          locationImage: normalizeObjectImage(equipmentItem?.locationImage),
        };
      });
      return {
        id: validId(item?.id, "шкафа"),
        name: limitedText(item?.name),
        x: clamp(finiteNumber(item?.x), 0, width),
        y: clamp(finiteNumber(item?.y), 0, height),
        equipment,
        internalConnections: projectArray(item?.internalConnections ?? [], "внутренние соединения").slice(0, 10000),
        schemeLayout: normalizeSchemeLayout(item?.schemeLayout),
        note: limitedText(item?.note),
        modelImage: normalizeObjectImage(item?.modelImage),
        locationImage: normalizeObjectImage(item?.locationImage),
      };
    });
    const cabinetIds = uniqueIds(cabinets, "шкафы");

    const cables = projectArray(project.cables, "кабели").map((item) => {
      const type = item?.type === "fiber" ? "fiber" : item?.type === "copper" ? "copper" : null;
      const sourceKind = item?.sourceKind === "camera" ? "camera" : item?.sourceKind === "cabinet" ? "cabinet" : item?.sourceKind === "point" ? "point" : null;
      const sourceId = validId(item?.sourceId, "источника кабеля");
      const targetCabinetId = item?.targetCabinetId == null ? null : validId(item.targetCabinetId, "конечного шкафа");
      const targetCameraId = item?.targetCameraId == null ? null : validId(item.targetCameraId, "конечной камеры");
      if (targetCameraId && (!cameraIds.has(targetCameraId) || type !== "copper" || targetCabinetId)) throw new Error("Файл проекта повреждён: некорректная конечная камера.");
      const sourceExists = sourceKind === "camera" ? cameraIds.has(sourceId) : sourceKind === "point" ? Boolean(item?.sourcePoint) : sourceKind === "cabinet" && cabinetIds.has(sourceId);
      if (!type || !sourceKind || !sourceExists || (targetCabinetId !== null && !cabinetIds.has(targetCabinetId))) {
        throw new Error("Файл проекта повреждён: некорректное подключение кабеля.");
      }
      if (sourceKind === "camera" && type !== "copper") {
        throw new Error("Файл проекта повреждён: камера может подключаться только витой парой.");
      }
      return {
        id: validId(item?.id, "кабеля"),
        cableSpecification: limitedText(item?.cableSpecification),
        installation: type === "copper" && ["outdoor", "indoor"].includes(item?.installation) ? item.installation : "",
        lengthMeters: item?.lengthMeters != null && item.lengthMeters !== "" && Number.isFinite(Number(item.lengthMeters)) ? Math.max(0, Number(item.lengthMeters)) : null,
        name: limitedText(item?.name),
        note: limitedText(item?.note),
        modelImage: normalizeObjectImage(item?.modelImage),
        locationImage: normalizeObjectImage(item?.locationImage),
        type,
        sourceKind,
        sourceId,
        sourceConnection: sourceKind === "cabinet" ? validPortConnection(item?.sourceConnection, cabinets.find((cabinet) => cabinet.id === sourceId)) : null,
        targetConnection: validPortConnection(item?.targetConnection, cabinets.find((cabinet) => cabinet.id === targetCabinetId)),
        viaMountIds: projectArray(item?.viaMountIds ?? [], "маршрут кабеля").filter((id) => mountIds.has(id)),
        sourcePoint: sourceKind === "point" ? { x: clamp(finiteNumber(item.sourcePoint.x), 0, width), y: clamp(finiteNumber(item.sourcePoint.y), 0, height) } : null,
        routePoints: item?.routePoints == null ? undefined : projectArray(item.routePoints, "вершины кабеля").map((point) => point.mountId ? (mountIds.has(point.mountId) ? { mountId: point.mountId } : null) : { x: clamp(finiteNumber(point.x), 0, width), y: clamp(finiteNumber(point.y), 0, height) }).filter(Boolean),
        targetCabinetId,
        targetCameraId,
      };
    });
    uniqueIds(cables, "кабели");
    const occupiedPorts = new Set();
    cables.forEach((cable) => {
      [["targetConnection", cable.targetCabinetId], ["sourceConnection", cable.sourceId]].forEach(([key, cabinetId]) => {
        const connection = cable[key];
        if (!connection) return;
        const portKey = `${cabinetId}:${connection.equipmentId}:${connection.port}`;
        if (occupiedPorts.has(portKey)) cable[key] = null;
        else occupiedPorts.add(portKey);
      });
    });

    cabinets.forEach((cabinet) => { cabinet.internalConnections = validInternalConnections(cabinet, cables); });

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
        showLabels: Boolean(project.settings?.showLabels),
        viewport: project.settings?.viewport && Number.isFinite(project.settings.viewport.scale) && project.settings.viewport.scale > 0 ? {
          x: finiteNumber(project.settings.viewport.x), y: finiteNumber(project.settings.viewport.y),
          scale: clamp(project.settings.viewport.scale, 0.000001, 10000),
          width: Math.max(0, finiteNumber(project.settings.viewport.width)), height: Math.max(0, finiteNumber(project.settings.viewport.height)),
        } : null,
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
    state.showLabels = false;
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
    resetCabinetSchemeSession();
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
      state.showLabels = project.settings.showLabels;
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
      resetCabinetSchemeSession();
      fitMap();
      if (project.settings.viewport) {
        const saved = project.settings.viewport;
        const rect = elements.workspace.getBoundingClientRect();
        const width = rect.width || saved.width, height = rect.height || saved.height;
        state.view = { x: saved.x + (saved.width ? (width - saved.width) / 2 : 0), y: saved.y + (saved.height ? (height - saved.height) / 2 : 0), scale: saved.scale };
        state.workspaceSize = { width, height }; state.fitted = false;
        renderView(); renderObjects();
      }
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
  elements.toggleLabelsButton.addEventListener("click", () => {
    state.showLabels = !state.showLabels;
    renderObjects();
  });
  elements.savePdfButton.addEventListener("click", saveAsPdf);
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
  elements.statusInput.addEventListener("change", (event) => updateCamera("status", event.target.value));
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
    const linkedCableCount = state.cables.filter((cable) => (cable.sourceKind === "camera" && cable.sourceId === cameraId) || cable.targetCameraId === cameraId).length;
    if (linkedCableCount && !window.confirm(`Удалить «${camera.name}»?\n\nВместе с камерой будут удалены связанные кабели.`)) return;
    state.cameras = state.cameras.filter((camera) => camera.id !== cameraId);
    state.cables = state.cables.filter((cable) => !(cable.sourceKind === "camera" && cable.sourceId === cameraId) && cable.targetCameraId !== cameraId);
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
      if (cable.routePoints) cable.routePoints = cable.routePoints.filter((point) => point.mountId !== mountId);
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
        openCabinetScheme(cabinet.id);
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
    openCabinetScheme(cabinet.id);
  });

  window.addEventListener("pointermove", (event) => {
    const interaction = state.objectInteraction;
    if (!interaction) return;

    if (interaction.type === "moveCableVertex") {
      const cable = getCable(interaction.cableId);
      if (!cable) return;
      const point = workspacePoint(event.clientX, event.clientY);
      const vertex = interaction.field === "routePoints" ? cable.routePoints[interaction.index] : cable[interaction.field];
      vertex.x = clamp(point.x, 0, state.imageWidth);
      vertex.y = clamp(point.y, 0, state.imageHeight);
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
    if (interaction.type === "moveCableVertex") {
      const cable = getCable(interaction.cableId);
      if (cable && interaction.field === "sourcePoint") bindCableEndpoint(cable, "source", cable.sourcePoint);
      else if (cable && !cable.targetCabinetId && !cable.targetCameraId && interaction.index === cable.routePoints.length - 1) bindCableEndpoint(cable, "target", cable.routePoints[interaction.index]);
    }
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
      if (state.activeTool === "cable") {
        if (state.pendingCableSourceId) return;
        const point = workspacePoint(event.clientX, event.clientY);
        if (!isInsideMap(point)) return;
        if (!state.cableDraft) {
          state.cableDraft = { type: "copper", sourceKind: "point", sourceId: "point", sourcePoint: point, viaMountIds: [], routePoints: [], targetCabinetId: null };
        } else {
          const nodes = cableRouteNodes(state.cableDraft);
          const last = nodes[nodes.length - 1];
          if (Math.hypot(last.x - point.x, last.y - point.y) * state.view.scale > 2) state.cableDraft.routePoints.push(point);
        }
        updateCablePlacementHint(); renderObjects();
        return;
      }
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
    if (state.activeTool === "cable" && state.cableDraft) {
      const point = workspacePoint(event.clientX, event.clientY);
      state.cableDraft.cursor = { x: clamp(point.x, 0, state.imageWidth), y: clamp(point.y, 0, state.imageHeight) };
      renderObjects();
    }
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    state.view.x += event.clientX - state.lastPointer.x;
    state.view.y += event.clientY - state.lastPointer.y;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    renderView();
  });

  elements.workspace.addEventListener("dblclick", (event) => {
    if (state.activeTool !== "cable" || !state.cableDraft) return;
    event.preventDefault(); finishCable();
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
    if (event.target.closest("input, textarea, select, [contenteditable], dialog")) return;
    if (state.cableDraft) {
      if (event.key === "Enter") { event.preventDefault(); finishCable(); refreshDirtyState(); recordHistory(); return; }
      if (event.key === "Escape" && state.cableDraft.routePoints?.length) {
        const point = state.cableDraft.routePoints.pop();
        if (point.mountId) state.cableDraft.viaMountIds.pop();
        renderObjects(); return;
      }
    }
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
      if (state.activeWorkspace.startsWith("cabinet:")) {
        schemeSelection = null; selectedSchemeWire = null; schemeMessage = ""; renderCabinetScheme();
      }
      hideCableBundlePicker();
      if (state.activeTool) setActiveTool(null);
    }
    if (event.key === "Delete" && state.activeWorkspace === "map" && !event.target.matches("input, textarea, [contenteditable]")) {
      if (state.selectedCameraId) elements.deleteCamera.click();
      else if (state.selectedMountId) elements.deleteMount.click();
      else if (state.selectedCabinetId) elements.deleteCabinet.click();
      else if (state.selectedCableId) elements.deleteCable.click();
    }
  });

  const resizeObserver = new ResizeObserver((entries) => {
    if (!state.imageWidth) return;
    const rect = entries[0].contentRect;
    if (!rect.width || !rect.height || state.activeWorkspace !== "map") return;
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
  window.addEventListener("beforeprint", ensurePrintSheet);
  window.addEventListener("afterprint", finishPrint);
  window.addEventListener("pagehide", releaseImageUrl);

  markProjectClean();
  resetHistory();
})();
