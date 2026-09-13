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
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AppMath;
  if (typeof document === "undefined") return;

  const elements = {
    fileInput: document.querySelector("#map-file"),
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
  };

  const state = {
    imageUrl: null,
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
  };

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MIN_CAMERA_RANGE_PERCENT = 5;
  const DEFAULT_CAMERA_RANGE_PERCENT = 20;
  const ROTATION_HANDLE_GAP = 32;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

  function buildCableLanes() {
    const groups = new Map();
    state.cables.forEach((cable) => {
      const nodes = cableRouteNodes(cable);
      for (let index = 0; index < nodes.length - 1; index += 1) {
        const pair = [nodes[index].key, nodes[index + 1].key].sort();
        const key = pair.join("|");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(cable.id);
      }
    });
    groups.forEach((ids) => ids.sort());
    return groups;
  }

  function appendCableSegment(svg, cable, start, end, laneIds) {
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (!distance) return;
    const laneOffset = AppMath.cableLaneOffset(
      laneIds.indexOf(cable.id),
      laneIds.length,
      state.view.scale,
    );
    const direction = start.key < end.key ? 1 : -1;
    const offsetX = -(end.y - start.y) / distance * laneOffset * direction;
    const offsetY = (end.x - start.x) / distance * laneOffset * direction;
    const pathData = `M ${start.x + offsetX} ${start.y + offsetY} L ${end.x + offsetX} ${end.y + offsetY}`;

    const segmentKey = [start.key, end.key].sort().join("|");
    const line = makeSvg("path", {
      d: pathData,
      "data-cable-id": cable.id,
      "data-segment-key": segmentKey,
    });
    line.classList.add("cable-line", `cable-line--${cable.type}`);
    if (cable.id === state.selectedCableId) line.classList.add("is-selected");
    svg.append(line);

    const hit = makeSvg("path", { d: pathData, "data-cable-id": cable.id });
    hit.classList.add("cable-hit");
    svg.append(hit);
  }

  function appendCables() {
    const svg = makeSvg("svg", {
      viewBox: `0 0 ${Math.max(1, state.imageWidth)} ${Math.max(1, state.imageHeight)}`,
      preserveAspectRatio: "none",
    });
    svg.classList.add("cables-layer");
    const lanes = buildCableLanes();

    state.cables.forEach((cable) => {
      const nodes = cableRouteNodes(cable);
      for (let index = 0; index < nodes.length - 1; index += 1) {
        const start = nodes[index];
        const end = nodes[index + 1];
        const key = [start.key, end.key].sort().join("|");
        appendCableSegment(svg, cable, start, end, lanes.get(key) || [cable.id]);
      }
    });

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
    const tooltip = document.createElement("div");
    tooltip.className = "cabinet-tooltip";
    tooltip.textContent = cabinet.name;
    object.append(control, tooltip);
    elements.objectsLayer.append(object);
  }

  function renderObjects() {
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
    }

    if (cabinet) elements.cabinetNameInput.value = cabinet.name;

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
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = nextUrl;
      state.imageWidth = decoded.naturalWidth;
      state.imageHeight = decoded.naturalHeight;
      [...state.mounts, ...state.cameras, ...state.cabinets].forEach((object) => {
        object.x = clamp(object.x, 0, state.imageWidth);
        object.y = clamp(object.y, 0, state.imageHeight);
      });
      state.cameras.forEach(normalizeCameraRange);

      elements.scene.style.width = `${state.imageWidth}px`;
      elements.scene.style.height = `${state.imageHeight}px`;
      elements.mapImage.src = nextUrl;
      elements.mapImage.alt = `Карта «${file.name}»`;
      elements.scene.hidden = false;
      elements.emptyState.hidden = true;
      elements.workspace.classList.add("has-map");
      elements.fitButton.disabled = false;
      elements.cameraTool.disabled = false;
      elements.poleTool.disabled = false;
      elements.mountTool.disabled = false;
      elements.cabinetTool.disabled = false;
      elements.cableTool.disabled = false;
      elements.status.textContent = `${file.name} · ${state.imageWidth} × ${state.imageHeight} px`;
      renderObjects();
      renderObjectList();
      fitMap();
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
  elements.deleteCabinet.addEventListener("click", () => {
    const cabinetId = state.selectedCabinetId;
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
      selectCable(cableHit.dataset.cableId);
      return;
    }

    if (cabinetControl) {
      const cabinet = getCabinet(cabinetControl.dataset.cabinetId);
      if (!cabinet) return;
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

  window.addEventListener("pointermove", (event) => {
    const interaction = state.objectInteraction;
    if (!interaction) return;

    if (interaction.type === "moveMount") {
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
    if (event.key === "Escape" && state.activeTool) setActiveTool(null);
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
  window.addEventListener("beforeunload", () => {
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  });
})();
