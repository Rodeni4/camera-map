"use strict";

const assert = require("node:assert/strict");
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

console.log("Проверки геометрии пройдены: вписывание и масштабирование относительно курсора.");
