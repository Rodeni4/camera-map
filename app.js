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
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AppMath;
  if (typeof document === "undefined") return;

  const elements = {
    fileInput: document.querySelector("#map-file"),
    fitButton: document.querySelector("#fit-button"),
    workspace: document.querySelector("#workspace"),
    emptyState: document.querySelector("#empty-state"),
    placementHint: document.querySelector("#placement-hint"),
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
    objectList: document.querySelector("#object-list"),
    cameraProperties: document.querySelector("#camera-properties"),
    nameInput: document.querySelector("#camera-name"),
    modelInput: document.querySelector("#camera-model"),
    ipInput: document.querySelector("#camera-ip"),
    macInput: document.querySelector("#camera-mac"),
    fovInput: document.querySelector("#camera-fov"),
    fovNumber: document.querySelector("#camera-fov-number"),
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
    nextCameraId: 1,
    nextMountId: 1,
    nextPoleNumber: 1,
    nextPointNumber: 1,
    selectedCameraId: null,
    selectedMountId: null,
    activeTool: null,
    cameraMountId: null,
    objectInteraction: null,
    snapTargetId: null,
  };

  const SVG_NS = "http://www.w3.org/2000/svg";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getCamera(id) {
    return state.cameras.find((camera) => camera.id === id) || null;
  }

  function getMount(id) {
    return state.mounts.find((mount) => mount.id === id) || null;
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

  function appendCamera(camera) {
    const object = document.createElement("div");
    object.className = "camera-object";
    if (camera.id === state.selectedCameraId) object.classList.add("is-selected");
    object.style.left = `${camera.x}px`;
    object.style.top = `${camera.y}px`;

    const sector = makeSvg("svg", { viewBox: "-200 -200 400 400" });
    sector.classList.add("camera-sector");
    sector.style.transform = `rotate(${camera.direction}deg)`;
    sector.append(makeSvg("path", {
      class: "camera-sector__fill",
      d: AppMath.sectorPath(camera.fov, 180 * state.elementScale),
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
      const line = document.createElement("div");
      line.className = "rotation-line";
      line.style.transform = `rotate(${camera.direction}deg)`;
      ui.append(line);

      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "rotation-handle";
      handle.dataset.cameraId = camera.id;
      handle.setAttribute("aria-label", "Повернуть камеру");
      handle.style.left = `${Math.cos(radians) * 70}px`;
      handle.style.top = `${Math.sin(radians) * 70}px`;
      ui.append(handle);
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

  function renderObjects() {
    elements.objectsLayer.replaceChildren();

    state.cameras.forEach((camera) => {
      const mount = getMount(camera.mountId);
      const relationSelected = camera.id === state.selectedCameraId || mount?.id === state.selectedMountId;
      if (mount && relationSelected) appendAttachmentLine(camera, mount);
    });
    state.cameras.forEach(appendCamera);
    state.mounts.forEach(appendMount);
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

  function renderObjectList() {
    elements.objectList.replaceChildren();
    if (!state.mounts.length && !state.cameras.length) {
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
  }

  function syncProperties() {
    const camera = getCamera(state.selectedCameraId);
    const mount = getMount(state.selectedMountId);
    elements.cameraProperties.hidden = !camera;
    elements.mountProperties.hidden = !mount;

    if (camera) {
      elements.nameInput.value = camera.name;
      elements.modelInput.value = camera.model;
      elements.ipInput.value = camera.ip;
      elements.macInput.value = camera.mac;
      elements.fovInput.value = camera.fov;
      elements.fovNumber.value = camera.fov;
      const cameraMount = getMount(camera.mountId);
      elements.cameraMountRow.hidden = !cameraMount;
      elements.cameraMountName.textContent = cameraMount?.name || "";
    }

    if (mount) {
      elements.mountPropertiesTitle.textContent = mountTypeName(mount.type);
      elements.mountPropertiesType.textContent = mount.type === "pole" ? "Опора для одной или нескольких камер" : "Крепление на здании";
      elements.mountNameInput.value = mount.name;
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
    refreshEditor();
  }

  function selectMount(id) {
    hideMountCameraMenu();
    state.selectedMountId = id;
    state.selectedCameraId = null;
    refreshEditor();
  }

  function clearSelection() {
    hideMountCameraMenu();
    state.selectedCameraId = null;
    state.selectedMountId = null;
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

  function setActiveTool(tool, cameraMountId = null) {
    state.activeTool = tool && state.imageWidth ? tool : null;
    state.cameraMountId = state.activeTool === "camera" ? cameraMountId : null;
    elements.cameraTool.setAttribute("aria-pressed", String(state.activeTool === "camera"));
    elements.poleTool.setAttribute("aria-pressed", String(state.activeTool === "pole"));
    elements.mountTool.setAttribute("aria-pressed", String(state.activeTool === "point"));
    elements.workspace.classList.toggle("is-placing", Boolean(state.activeTool));
    elements.placementHint.hidden = !state.activeTool;
    if (!state.activeTool) return;

    if (state.activeTool === "pole") {
      elements.placementHint.textContent = "Щёлкните по карте, чтобы поставить столб";
    } else if (state.activeTool === "point") {
      elements.placementHint.textContent = "Щёлкните по стене или углу здания";
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
    const camera = {
      id: `c${number}`,
      x: point.x,
      y: point.y,
      direction: 0,
      fov: 90,
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
      [...state.mounts, ...state.cameras].forEach((object) => {
        object.x = clamp(object.x, 0, state.imageWidth);
        object.y = clamp(object.y, 0, state.imageHeight);
      });

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

  elements.detachCamera.addEventListener("click", () => {
    const camera = getCamera(state.selectedCameraId);
    if (!camera) return;
    camera.mountId = null;
    refreshEditor();
  });

  elements.deleteCamera.addEventListener("click", () => {
    state.cameras = state.cameras.filter((camera) => camera.id !== state.selectedCameraId);
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
    state.selectedMountId = null;
    refreshEditor();
  });
  elements.closeMountProperties.addEventListener("click", clearSelection);

  elements.objectsLayer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rotationHandle = event.target.closest(".rotation-handle");
    const cameraControl = event.target.closest(".camera-control");
    const mountControl = event.target.closest(".mount-control");
    const target = rotationHandle || cameraControl || mountControl;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveTool(null);

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

    const camera = getCamera((rotationHandle || cameraControl).dataset.cameraId);
    if (!camera) return;
    selectCamera(camera.id);
    state.objectInteraction = rotationHandle
      ? { type: "rotate", cameraId: camera.id }
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
    } else {
      const camera = getCamera(interaction.cameraId);
      if (!camera) return;
      if (interaction.type === "moveCamera") {
        camera.x = clamp(interaction.startX + (event.clientX - interaction.startClientX) / state.view.scale, 0, state.imageWidth);
        camera.y = clamp(interaction.startY + (event.clientY - interaction.startClientY) / state.view.scale, 0, state.imageHeight);
        state.snapTargetId = nearestMount(camera.x, camera.y)?.id || null;
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
  }, { passive: false });

  elements.workspace.addEventListener("pointerdown", (event) => {
    if (!state.imageWidth || event.button !== 0) return;
    if (state.activeTool) {
      event.preventDefault();
      const point = workspacePoint(event.clientX, event.clientY);
      if (!isInsideMap(point)) return;
      if (state.activeTool === "camera") addCamera(point, state.cameraMountId);
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
