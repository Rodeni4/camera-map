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

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const requiredIds = [
  "camera-tool",
  "camera-properties",
  "camera-list",
  "camera-name",
  "camera-model",
  "camera-ip",
  "camera-mac",
  "camera-fov",
  "camera-fov-number",
  "close-properties",
  "objects-layer",
];
requiredIds.forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
assert.doesNotMatch(html, /https?:\/\//);

console.log("Проверки геометрии пройдены: карта, координаты и сектор обзора.");
