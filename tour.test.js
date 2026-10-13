// Placement tests for the product tour card. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeCard } from './tour.js';

const desktop = { width: 1024, height: 768 };
const card = { width: 340, height: 180 };
const rect = (top, left, width, height) => ({ top, left, width, height, bottom: top + height, right: left + width });

test('no target: the card is centred in the viewport', () => {
  assert.deepEqual(placeCard(null, card, desktop), { top: 294, left: 342, side: 'center' });
});

test('room below: the card sits under the target, centred on it', () => {
  assert.deepEqual(placeCard(rect(100, 300, 200, 40), card, desktop), { top: 152, left: 230, side: 'bottom' });
});

test('no room below: the card flips above the target', () => {
  assert.deepEqual(placeCard(rect(650, 300, 200, 40), card, desktop), { top: 458, left: 230, side: 'top' });
});

test('near the right edge: the card is clamped inside the viewport margin', () => {
  assert.deepEqual(placeCard(rect(100, 900, 100, 40), card, desktop), { top: 152, left: 672, side: 'bottom' });
});

test('prefer left (drawer steps): the card goes beside the drawer when it fits', () => {
  assert.deepEqual(placeCard(rect(120, 544, 460, 40), card, desktop, { prefer: 'left' }), { top: 120, left: 192, side: 'left' });
});

test('prefer left without room falls back to below', () => {
  assert.deepEqual(placeCard(rect(120, 200, 300, 40), card, desktop, { prefer: 'left' }), { top: 172, left: 180, side: 'bottom' });
});

test('phones: the card docks to the half of the screen the target is not in', () => {
  const phone = { width: 375, height: 812 };
  const phoneCard = { width: 351, height: 190 };
  assert.deepEqual(placeCard(rect(600, 16, 343, 40), phoneCard, phone), { top: 12, left: 12, side: 'top' });
  assert.deepEqual(placeCard(rect(100, 16, 343, 40), phoneCard, phone), { top: 610, left: 12, side: 'bottom' });
});
