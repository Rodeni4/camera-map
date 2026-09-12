(function () {
  "use strict";

  const ViewMath = {
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
  };

  if (typeof module !== "undefined" && module.exports) module.exports = ViewMath;
  if (typeof document === "undefined") return;

  const elements = {
    fileInput: document.querySelector("#map-file"),
    fitButton: document.querySelector("#fit-button"),
    workspace: document.querySelector("#workspace"),
    emptyState: document.querySelector("#empty-state"),
    scene: document.querySelector("#scene"),
    mapImage: document.querySelector("#map-image"),
    status: document.querySelector("#status"),
    zoomStatus: document.querySelector("#zoom-status"),
    error: document.querySelector("#error-message"),
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
  };

  function renderView() {
    const { x, y, scale } = state.view;
    elements.scene.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    elements.zoomStatus.textContent = `Масштаб: ${Math.round(scale * 100)}%`;
  }

  function fitMap() {
    if (!state.imageWidth || !state.imageHeight) return;
    const rect = elements.workspace.getBoundingClientRect();
    state.view = ViewMath.fit(rect.width, rect.height, state.imageWidth, state.imageHeight);
    state.fitScale = state.view.scale;
    state.fitted = true;
    state.workspaceSize = { width: rect.width, height: rect.height };
    renderView();
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

      elements.scene.style.width = `${state.imageWidth}px`;
      elements.scene.style.height = `${state.imageHeight}px`;
      elements.mapImage.src = nextUrl;
      elements.mapImage.alt = `Карта «${file.name}»`;
      elements.scene.hidden = false;
      elements.emptyState.hidden = true;
      elements.workspace.classList.add("has-map");
      elements.fitButton.disabled = false;
      elements.status.textContent = `${file.name} · ${state.imageWidth} × ${state.imageHeight} px`;
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

  elements.fileInput.addEventListener("change", (event) => loadMap(event.target.files[0]));
  elements.fitButton.addEventListener("click", fitMap);

  elements.workspace.addEventListener("wheel", (event) => {
    if (!state.imageWidth) return;
    event.preventDefault();
    const rect = elements.workspace.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const factor = Math.exp(-event.deltaY * 0.0015);
    const minScale = state.fitScale * 0.1;
    const maxScale = state.fitScale * 20;
    const nextScale = Math.min(maxScale, Math.max(minScale, state.view.scale * factor));
    state.view = ViewMath.zoomAt(state.view, cursorX, cursorY, nextScale);
    state.fitted = false;
    renderView();
  }, { passive: false });

  elements.workspace.addEventListener("pointerdown", (event) => {
    if (!state.imageWidth || event.button !== 0) return;
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
