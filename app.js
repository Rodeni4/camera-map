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
      const largeArc = angle > 180 ? 1 : 0;
      return `M 0 0 L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;
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
    error: document.querySelector("#error-message"),
    cameraTool: document.querySelector("#camera-tool"),
    cameraList: document.querySelector("#camera-list"),
    properties: document.querySelector("#camera-properties"),
    nameInput: document.querySelector("#camera-name"),
    modelInput: document.querySelector("#camera-model"),
    ipInput: document.querySelector("#camera-ip"),
    macInput: document.querySelector("#camera-mac"),
    fovInput: document.querySelector("#camera-fov"),
    fovNumber: document.querySelector("#camera-fov-number"),
    deleteCamera: document.querySelector("#delete-camera"),
    closeProperties: document.querySelector("#close-properties"),
  };

  const state = {
    imageUrl: null,
    imageWidth: 0,
    imageHeight: 0,
    view: { x: 0, y: 0, scale: 1 },
    fitScale: 1,
    dragging: false,
    pointerId: null,
    lastPointer: { x: 0, y: 0 },
    fitted: false,
    workspaceSize: { width: 0, height: 0 },
    cameras: [],
    nextCameraId: 1,
    selectedCameraId: null,
    placingCamera: false,
    objectInteraction: null,
  };

  const SVG_NS = "http://www.w3.org/2000/svg";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getCamera(id) {
    return state.cameras.find((camera) => camera.id === id) || null;
  }

  function renderView() {
    const { x, y, scale } = state.view;
    elements.scene.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    elements.objectsLayer.style.setProperty("--ui-scale", String(1 / scale));
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

  function renderCameras() {
    elements.objectsLayer.replaceChildren();

    state.cameras.forEach((camera) => {
      const object = document.createElement("div");
      object.className = "camera-object";
      if (camera.id === state.selectedCameraId) object.classList.add("is-selected");
      object.style.left = `${camera.x}px`;
      object.style.top = `${camera.y}px`;
      object.dataset.cameraId = camera.id;

      const sector = makeSvg("svg", { viewBox: "-200 -200 400 400" });
      sector.classList.add("camera-sector");
      sector.style.transform = `rotate(${camera.direction}deg)`;
      sector.append(makeSvg("path", {
        class: "camera-sector__fill",
        d: AppMath.sectorPath(camera.fov, 180),
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
      const model = document.createElement("strong");
      model.textContent = camera.model || "Модель не указана";
      const ip = document.createElement("span");
      ip.textContent = camera.ip || "IP не указан";
      tooltip.append(model, ip);
      ui.append(tooltip);

      if (camera.id === state.selectedCameraId) {
        const radians = camera.direction * Math.PI / 180;
        const handleDistance = 70;

        const line = document.createElement("div");
        line.className = "rotation-line";
        line.style.transform = `rotate(${camera.direction}deg)`;
        ui.append(line);

        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "rotation-handle";
        handle.dataset.cameraId = camera.id;
        handle.setAttribute("aria-label", "Повернуть камеру");
        handle.style.left = `${Math.cos(radians) * handleDistance}px`;
        handle.style.top = `${Math.sin(radians) * handleDistance}px`;
        ui.append(handle);
      }

      object.append(ui);
      elements.objectsLayer.append(object);
    });
  }

  function renderCameraList() {
    elements.cameraList.replaceChildren();
    if (!state.cameras.length) {
      const empty = document.createElement("p");
      empty.className = "camera-list__empty";
      empty.textContent = "Камер пока нет";
      elements.cameraList.append(empty);
      return;
    }

    state.cameras.forEach((camera, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "camera-list__item";
      if (camera.id === state.selectedCameraId) item.classList.add("is-selected");
      item.dataset.cameraId = camera.id;

      const name = document.createElement("span");
      name.className = "camera-list__name";
      name.textContent = camera.name || "Без названия";
      const number = document.createElement("span");
      number.className = "camera-list__number";
      number.textContent = `#${index + 1}`;
      const ip = document.createElement("span");
      ip.className = "camera-list__ip";
      ip.textContent = camera.ip || "IP не указан";

      item.append(name, number, ip);
      elements.cameraList.append(item);
    });
  }

  function syncProperties() {
    const camera = getCamera(state.selectedCameraId);
    elements.properties.hidden = !camera;
    if (!camera) return;
    elements.nameInput.value = camera.name;
    elements.modelInput.value = camera.model;
    elements.ipInput.value = camera.ip;
    elements.macInput.value = camera.mac;
    elements.fovInput.value = camera.fov;
    elements.fovNumber.value = camera.fov;
  }

  function selectCamera(id) {
    state.selectedCameraId = id;
    syncProperties();
    renderCameras();
    renderCameraList();
  }

  function setCameraTool(active) {
    state.placingCamera = active && Boolean(state.imageWidth);
    elements.cameraTool.setAttribute("aria-pressed", String(state.placingCamera));
    elements.workspace.classList.toggle("is-placing", state.placingCamera);
    elements.placementHint.hidden = !state.placingCamera;
  }

  function workspacePoint(clientX, clientY) {
    const rect = elements.workspace.getBoundingClientRect();
    return AppMath.toScene(state.view, clientX - rect.left, clientY - rect.top);
  }

  function isInsideMap(point) {
    return point.x >= 0 && point.y >= 0 && point.x <= state.imageWidth && point.y <= state.imageHeight;
  }

  function addCamera(point) {
    const camera = {
      id: String(state.nextCameraId++),
      x: point.x,
      y: point.y,
      direction: 0,
      fov: 90,
      name: `Камера ${state.nextCameraId - 1}`,
      model: "HiWatch T020",
      ip: "192.168.1.20",
      mac: "",
    };
    state.cameras.push(camera);
    setCameraTool(false);
    selectCamera(camera.id);
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
      state.cameras.forEach((camera) => {
        camera.x = clamp(camera.x, 0, state.imageWidth);
        camera.y = clamp(camera.y, 0, state.imageHeight);
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
      elements.status.textContent = `${file.name} · ${state.imageWidth} × ${state.imageHeight} px`;
      renderCameras();
      renderCameraList();
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

  function updateSelected(field, value) {
    const camera = getCamera(state.selectedCameraId);
    if (!camera) return;
    camera[field] = value;
    renderCameras();
    renderCameraList();
  }

  elements.fileInput.addEventListener("change", (event) => loadMap(event.target.files[0]));
  elements.fitButton.addEventListener("click", fitMap);
  elements.cameraTool.addEventListener("click", () => setCameraTool(!state.placingCamera));

  elements.nameInput.addEventListener("input", (event) => updateSelected("name", event.target.value));
  elements.modelInput.addEventListener("input", (event) => updateSelected("model", event.target.value));
  elements.ipInput.addEventListener("input", (event) => updateSelected("ip", event.target.value));
  elements.macInput.addEventListener("input", (event) => updateSelected("mac", event.target.value));

  function setFov(rawValue) {
    const value = clamp(Number(rawValue) || 1, 1, 180);
    elements.fovInput.value = value;
    elements.fovNumber.value = value;
    updateSelected("fov", value);
  }

  elements.fovInput.addEventListener("input", (event) => setFov(event.target.value));
  elements.fovNumber.addEventListener("input", (event) => {
    if (event.target.value !== "") setFov(event.target.value);
  });
  elements.fovNumber.addEventListener("change", (event) => setFov(event.target.value));

  elements.deleteCamera.addEventListener("click", () => {
    state.cameras = state.cameras.filter((camera) => camera.id !== state.selectedCameraId);
    state.selectedCameraId = null;
    syncProperties();
    renderCameras();
    renderCameraList();
  });

  elements.closeProperties.addEventListener("click", () => {
    state.selectedCameraId = null;
    syncProperties();
    renderCameras();
    renderCameraList();
  });

  elements.cameraList.addEventListener("click", (event) => {
    const item = event.target.closest(".camera-list__item");
    if (!item) return;
    setCameraTool(false);
    selectCamera(item.dataset.cameraId);
  });

  elements.objectsLayer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rotationHandle = event.target.closest(".rotation-handle");
    const cameraControl = event.target.closest(".camera-control");
    const target = rotationHandle || cameraControl;
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    const cameraId = target.dataset.cameraId;
    const camera = getCamera(cameraId);
    if (!camera) return;
    setCameraTool(false);
    selectCamera(cameraId);

    state.objectInteraction = rotationHandle
      ? { type: "rotate", cameraId }
      : {
          type: "move",
          cameraId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: camera.x,
          startY: camera.y,
        };
  });

  window.addEventListener("pointermove", (event) => {
    const interaction = state.objectInteraction;
    if (!interaction) return;
    const camera = getCamera(interaction.cameraId);
    if (!camera) return;

    if (interaction.type === "move") {
      camera.x = clamp(interaction.startX + (event.clientX - interaction.startClientX) / state.view.scale, 0, state.imageWidth);
      camera.y = clamp(interaction.startY + (event.clientY - interaction.startClientY) / state.view.scale, 0, state.imageHeight);
    } else {
      const point = workspacePoint(event.clientX, event.clientY);
      const angle = Math.atan2(point.y - camera.y, point.x - camera.x) * 180 / Math.PI;
      camera.direction = (angle + 360) % 360;
    }
    renderCameras();
  });

  function finishObjectInteraction() {
    state.objectInteraction = null;
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
    const minScale = state.fitScale * 0.1;
    const maxScale = state.fitScale * 20;
    const nextScale = clamp(state.view.scale * factor, minScale, maxScale);
    state.view = AppMath.zoomAt(state.view, cursorX, cursorY, nextScale);
    state.fitted = false;
    renderView();
  }, { passive: false });

  elements.workspace.addEventListener("pointerdown", (event) => {
    if (!state.imageWidth || event.button !== 0) return;

    if (state.placingCamera) {
      event.preventDefault();
      const point = workspacePoint(event.clientX, event.clientY);
      if (isInsideMap(point)) addCamera(point);
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
    if (event.key === "Escape" && state.placingCamera) setCameraTool(false);
    if (event.key === "Delete" && state.selectedCameraId && !event.target.matches("input")) {
      elements.deleteCamera.click();
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
