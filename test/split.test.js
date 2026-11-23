'use strict';

// Tests for the money rules in SPEC.md.
// split.js exposes pure functions; members are [{ id, name }] in the order
// they were added, payments are [{ id, payerId, amount, note }].

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateName,
  parseAmount,
  validateNote,
  canRemoveMember,
  shares,
  balances,
  settle,
  formatTransfer,
} = require('../split.js');

const m = (id, name) => ({ id, name });
const p = (id, payerId, amount, note = '') => ({ id, payerId, amount, note });

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Apply transfers to balances and return the resulting balance per member id.
function applyTransfers(bals, transfers) {
  const left = new Map(bals.map((b) => [b.id, b.balance]));
  for (const t of transfers) {
    left.set(t.from.id, left.get(t.from.id) + t.amount);
    left.set(t.to.id, left.get(t.to.id) - t.amount);
  }
  return left;
}

// Small deterministic PRNG so the randomized tests are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ---------------------------------------------------------------- Members

test('validateName accepts a new name and trims it', () => {
  assert.deepEqual(validateName('Rahim', []), { ok: true, name: 'Rahim' });
  assert.deepEqual(validateName('  Selim  ', [m(1, 'Rahim')]), { ok: true, name: 'Selim' });
});

test('validateName refuses empty or whitespace-only names with a message', () => {
  for (const bad of ['', '   ', '\t\n']) {
    const r = validateName(bad, []);
    assert.equal(r.ok, false, `should refuse ${JSON.stringify(bad)}`);
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 0);
  }
});

test('validateName refuses duplicates in any case, with a message', () => {
  const members = [m(1, 'Rahim'), m(2, 'Selim')];
  for (const dup of ['Rahim', 'rahim', 'RAHIM', '  rAhIm ', 'selim']) {
    const r = validateName(dup, members);
    assert.equal(r.ok, false, `should refuse ${JSON.stringify(dup)}`);
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 0);
  }
});

test('canRemoveMember: a member with payments cannot be removed', () => {
  const payments = [p(1, 1, 500)];
  assert.equal(canRemoveMember(1, payments), false);
  assert.equal(canRemoveMember(2, payments), true);
  assert.equal(canRemoveMember(2, []), true);
});

test('canRemoveMember: removable again once their payments are deleted', () => {
  const payments = [p(1, 1, 500), p(2, 2, 300)];
  const afterDelete = payments.filter((x) => x.id !== 1);
  assert.equal(canRemoveMember(1, afterDelete), true);
});

// ---------------------------------------------------------------- Payments

test('parseAmount accepts whole taka from 1 to 100000', () => {
  assert.deepEqual(parseAmount('1'), { ok: true, amount: 1 });
  assert.deepEqual(parseAmount('500'), { ok: true, amount: 500 });
  assert.deepEqual(parseAmount('100000'), { ok: true, amount: 100000 });
  assert.deepEqual(parseAmount('  250 '), { ok: true, amount: 250 });
});

test('parseAmount refuses anything else, with a message', () => {
  const bad = [
    '', '   ', '0', '-5', '100001', '999999999',
    '12.5', '500.0', '1,000', '1e3', '0x10', '+5',
    'abc', '5 taka', 'NaN', 'Infinity',
  ];
  for (const input of bad) {
    const r = parseAmount(input);
    assert.equal(r.ok, false, `should refuse ${JSON.stringify(input)}`);
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 0);
  }
});

test('parseAmount refuses non-string junk', () => {
  for (const input of [undefined, null, NaN, 12.5, -1, 0]) {
    assert.equal(parseAmount(input).ok, false, `should refuse ${String(input)}`);
  }
});

test('validateNote: optional, trimmed, max 100 characters', () => {
  assert.deepEqual(validateNote(''), { ok: true, note: '' });
  assert.deepEqual(validateNote('  rice and dal  '), { ok: true, note: 'rice and dal' });
  assert.deepEqual(validateNote('x'.repeat(100)), { ok: true, note: 'x'.repeat(100) });
  const r = validateNote('x'.repeat(101));
  assert.equal(r.ok, false);
  assert.ok(r.error.length > 0);
});

// ---------------------------------------------------------------- Shares

test('shares: leftover taka go to members in the order they were added', () => {
  assert.deepEqual(shares(100, 3), [34, 33, 33]);
  assert.deepEqual(shares(101, 3), [34, 34, 33]);
  assert.deepEqual(shares(7, 4), [2, 2, 2, 1]);
});

test('shares: exact division, single member, zero total, no members', () => {
  assert.deepEqual(shares(300, 3), [100, 100, 100]);
  assert.deepEqual(shares(500, 1), [500]);
  assert.deepEqual(shares(0, 3), [0, 0, 0]);
  assert.deepEqual(shares(2, 5), [1, 1, 0, 0, 0]);
  assert.deepEqual(shares(0, 0), []);
});

test('shares always sum to the total and are whole taka', () => {
  const r = rng(42);
  for (let i = 0; i < 500; i++) {
    const n = 1 + Math.floor(r() * 12);
    const total = Math.floor(r() * 1_000_000);
    const s = shares(total, n);
    assert.equal(s.length, n);
    assert.equal(sum(s), total);
    for (const x of s) assert.ok(Number.isInteger(x));
    assert.ok(Math.max(...s) - Math.min(...s) <= 1);
  }
});

// ---------------------------------------------------------------- Balances

test('balances: paid - share, using the spec example', () => {
  const members = [m(1, 'Rahim'), m(2, 'Selim'), m(3, 'Karim')];
  const payments = [p(1, 1, 100, 'bazar')];
  assert.deepEqual(balances(members, payments), [
    { id: 1, name: 'Rahim', paid: 100, share: 34, balance: 66 },
    { id: 2, name: 'Selim', paid: 0, share: 33, balance: -33 },
    { id: 3, name: 'Karim', paid: 0, share: 33, balance: -33 },
  ]);
});

test('balances: adds up multiple payments per member', () => {
  const members = [m(1, 'A'), m(2, 'B')];
  const payments = [p(1, 1, 300), p(2, 2, 100), p(3, 1, 200)];
  assert.deepEqual(balances(members, payments), [
    { id: 1, name: 'A', paid: 500, share: 300, balance: 200 },
    { id: 2, name: 'B', paid: 100, share: 300, balance: -200 },
  ]);
});

test('balances: no payments means all zero; no members means empty', () => {
  const members = [m(1, 'A'), m(2, 'B')];
  assert.deepEqual(
    balances(members, []).map((b) => b.balance),
    [0, 0],
  );
  assert.deepEqual(balances([], []), []);
});

test('balances: late joiners share all payments (split over current members)', () => {
  const members = [m(1, 'A'), m(2, 'B'), m(3, 'C')];
  const payments = [p(1, 1, 300)];
  assert.deepEqual(
    balances(members, payments).map((b) => b.share),
    [100, 100, 100],
  );
});

test('balances always add up to 0 (randomized)', () => {
  const r = rng(7);
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(r() * 10);
    const members = Array.from({ length: n }, (_, k) => m(k + 1, `M${k + 1}`));
    const count = Math.floor(r() * 20);
    const payments = Array.from({ length: count }, (_, k) =>
      p(k + 1, 1 + Math.floor(r() * n), 1 + Math.floor(r() * 100000)));
    const bals = balances(members, payments);
    assert.equal(sum(bals.map((b) => b.balance)), 0);
    for (const b of bals) assert.ok(Number.isInteger(b.balance));
  }
});

// ---------------------------------------------------------------- Settle up

test('settle: nothing to do when every balance is 0', () => {
  assert.deepEqual(settle([]), []);
  const members = [m(1, 'A'), m(2, 'B')];
  assert.deepEqual(settle(balances(members, [])), []);
  assert.deepEqual(settle(balances(members, [p(1, 1, 100), p(2, 2, 100)])), []);
});

test('settle: two people', () => {
  const members = [m(1, 'Rahim'), m(2, 'Selim')];
  const bals = balances(members, [p(1, 1, 1000)]);
  const t = settle(bals);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0].from, { id: 2, name: 'Selim' });
  assert.deepEqual(t[0].to, { id: 1, name: 'Rahim' });
  assert.equal(t[0].amount, 500);
});

test('settle: biggest debtor pays biggest creditor, repeat', () => {
  // total 900, share 225: A +275, B +175, C -225, D -225
  const members = [m(1, 'A'), m(2, 'B'), m(3, 'C'), m(4, 'D')];
  const bals = balances(members, [p(1, 1, 500), p(2, 2, 400)]);
  const simple = settle(bals).map((t) => [t.from.name, t.to.name, t.amount]);
  assert.deepEqual(simple, [
    ['C', 'A', 225], // C and D tie: C was added first
    ['D', 'B', 175], // A now +50, B +175 is the biggest creditor
    ['D', 'A', 50],
  ]);
});

test('settle: ties go to the member added first', () => {
  // total 500, share 125: A +275, B -125, C -25, D -125
  const members = [m(1, 'A'), m(2, 'B'), m(3, 'C'), m(4, 'D')];
  const bals = balances(members, [p(1, 1, 400), p(2, 3, 100)]);
  const simple = settle(bals).map((t) => [t.from.name, t.to.name, t.amount]);
  assert.deepEqual(simple, [
    ['B', 'A', 125],
    ['D', 'A', 125],
    ['C', 'A', 25],
  ]);
});

test('settle: uneven split from the spec example', () => {
  const members = [m(1, 'Rahim'), m(2, 'Selim'), m(3, 'Karim')];
  const simple = settle(balances(members, [p(1, 1, 100)]))
    .map((t) => [t.from.name, t.to.name, t.amount]);
  assert.deepEqual(simple, [
    ['Selim', 'Rahim', 33],
    ['Karim', 'Rahim', 33],
  ]);
});

test('settle: does not modify the balances passed in', () => {
  const members = [m(1, 'A'), m(2, 'B')];
  const bals = balances(members, [p(1, 1, 100)]);
  const copy = structuredClone(bals);
  settle(bals);
  assert.deepEqual(bals, copy);
});

test('settle clears every balance with whole-taka transfers (randomized)', () => {
  const r = rng(2024);
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(r() * 10);
    const members = Array.from({ length: n }, (_, k) => m(k + 1, `M${k + 1}`));
    const count = Math.floor(r() * 20);
    const payments = Array.from({ length: count }, (_, k) =>
      p(k + 1, 1 + Math.floor(r() * n), 1 + Math.floor(r() * 100000)));
    const bals = balances(members, payments);
    const transfers = settle(bals);

    assert.ok(transfers.length <= Math.max(0, n - 1), 'at most n-1 transfers');
    for (const t of transfers) {
      assert.ok(Number.isInteger(t.amount), 'whole taka only');
      assert.ok(t.amount > 0, 'no zero transfers');
      assert.notEqual(t.from.id, t.to.id);
    }
    for (const [, left] of applyTransfers(bals, transfers)) {
      assert.equal(left, 0, 'every balance ends at 0');
    }
  }
});

// ---------------------------------------------------------------- Display

test('formatTransfer: "Selim pays Rahim 500 Tk"', () => {
  const t = { from: { id: 2, name: 'Selim' }, to: { id: 1, name: 'Rahim' }, amount: 500 };
  assert.equal(formatTransfer(t), 'Selim pays Rahim 500 Tk');
});
