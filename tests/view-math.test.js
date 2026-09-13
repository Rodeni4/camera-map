"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ViewMath = require("../app.js");

const landscape = ViewMath.fit(1000, 700, 1600, 900, 24);
assert.deepEqual(landscape, { scale: 0.595, x: 24, y: 82.25 });

const portrait = ViewMath.fit(900, 600, 600, 1200, 24);
assert.deepEqual(portrait, { scale: 0.46, x: 312, y: 24 });

const view = { x: 100, y: 80, scale: 2 };
const cursor = { x: 350, y: 280 };
const pointBefore = {
  x: (cursor.x - view.x) / view.scale,
  y: (cursor.y - view.y) / view.scale,
};
const zoomed = ViewMath.zoomAt(view, cursor.x, cursor.y, 3.5);
const pointAfter = {
  x: (cursor.x - zoomed.x) / zoomed.scale,
  y: (cursor.y - zoomed.y) / zoomed.scale,
};
assert.deepEqual(pointAfter, pointBefore);

assert.deepEqual(
  ViewMath.toScene({ x: 100, y: 50, scale: 2 }, 500, 250),
  { x: 200, y: 100 },
);

const narrowSector = ViewMath.sectorPath(30, 180);
const wideSector = ViewMath.sectorPath(120, 180);
assert.notEqual(narrowSector, wideSector);
assert.match(narrowSector, /^M 0 0 L /);

assert.equal(
  ViewMath.rangeFromPoint({ x: 100, y: 100 }, { x: 260, y: 140 }, 0, 50, 500),
  160,
);
assert.ok(Math.abs(
  ViewMath.rangeFromPoint({ x: 100, y: 100 }, { x: 140, y: 300 }, 90, 50, 500) - 200,
) < 1e-9);
assert.equal(
  ViewMath.rangeFromPoint({ x: 100, y: 100 }, { x: 80, y: 100 }, 0, 50, 500),
  50,
);
assert.equal(
  ViewMath.rangeFromPoint({ x: 100, y: 100 }, { x: 900, y: 100 }, 0, 50, 500),
  500,
);

assert.deepEqual(
  ViewMath.closestPointOnRect({ x: 10, y: 60 }, { x: 40, y: 30, width: 100, height: 80 }),
  { x: 40, y: 60 },
);
assert.deepEqual(
  ViewMath.closestPointOnRect({ x: 70, y: 60 }, { x: 40, y: 30, width: 100, height: 80 }),
  { x: 40, y: 60 },
);

assert.deepEqual(
  ViewMath.clampGroupDelta([{ x: 50, y: 40 }, { x: 80, y: 90 }], -100, 200, 300, 200),
  { x: -50, y: 110 },
);

const lanesAtHalfZoom = [0, 1, 2].map((index) => ViewMath.cableLaneOffset(index, 3, 0.5));
const lanesAtDoubleZoom = [0, 1, 2].map((index) => ViewMath.cableLaneOffset(index, 3, 2));
assert.deepEqual(lanesAtHalfZoom, [-10, 0, 10]);
assert.deepEqual(lanesAtDoubleZoom, [-2.5, 0, 2.5]);
assert.equal((lanesAtHalfZoom[1] - lanesAtHalfZoom[0]) * 0.5, 5);
assert.equal((lanesAtDoubleZoom[1] - lanesAtDoubleZoom[0]) * 2, 5);
assert.equal(ViewMath.cableStrokeWidth(1), 1.25);
assert.equal(ViewMath.cableStrokeWidth(2), 3);
assert.equal(ViewMath.cableStrokeWidth(10), 3);
assert.equal(ViewMath.cableHitWidth(1), 12);
assert.equal(ViewMath.cableHitWidth(2), 6);

const crowdedLabels = ViewMath.placeLabels(
  Array.from({ length: 8 }, () => ({ anchorX: 200, anchorY: 150, width: 72, height: 15, radius: 14 })),
  400,
  300,
);
assert.equal(crowdedLabels.some((label) => label.hidden), false);
crowdedLabels.forEach((label, index) => {
  crowdedLabels.slice(index + 1).forEach((other) => {
    const overlap = !(
      label.x + label.width + 3 <= other.x ||
      other.x + other.width + 3 <= label.x ||
      label.y + label.height + 3 <= other.y ||
      other.y + other.height + 3 <= label.y
    );
    assert.equal(overlap, false);
  });
});

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const requiredIds = [
  "project-status",
  "new-project",
  "open-project",
  "project-file",
  "save-project",
  "undo-action",
  "redo-action",
  "toggle-labels",
  "camera-labels-layer",
  "properties-popover",
  "camera-tool",
  "element-scale",
  "element-scale-value",
  "camera-properties",
  "object-list",
  "pole-tool",
  "mount-tool",
  "cabinet-tool",
  "cable-tool",
  "cable-type-picker",
  "choose-fiber-cable",
  "choose-copper-cable",
  "cancel-cable-type",
  "camera-name",
  "camera-model",
  "camera-ip",
  "camera-mac",
  "camera-fov",
  "camera-fov-number",
  "camera-range",
  "camera-range-number",
  "close-properties",
  "mount-properties",
  "mount-name",
  "mounted-camera-count",
  "mounted-camera-list",
  "mount-connections",
  "mounted-cable-group",
  "mounted-cable-count",
  "mounted-cable-list",
  "add-mounted-camera",
  "mount-camera-menu",
  "add-new-mounted-camera",
  "free-camera-list",
  "cabinet-properties",
  "cabinet-name",
  "open-cabinet-card",
  "cable-properties",
  "cable-name",
  "cable-type",
  "detach-camera",
  "objects-layer",
];
requiredIds.forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
assert.doesNotMatch(html, /https?:\/\//);

console.log("Проверки геометрии пройдены: карта, координаты и сектор обзора.");
