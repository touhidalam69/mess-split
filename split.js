// Mess Split: pure money logic. No DOM, no storage.
// Works as a plain <script> (sets window.MessSplit) and under Node (module.exports).
(function (root) {
  'use strict';

  const MIN_AMOUNT = 1;
  const MAX_AMOUNT = 100000;
  const MAX_NOTE = 100;

  function validateName(name, members) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed === '') return { ok: false, error: 'Please enter a name.' };
    const lower = trimmed.toLowerCase();
    if (members.some((m) => m.name.toLowerCase() === lower)) {
      return { ok: false, error: `"${trimmed}" is already a member.` };
    }
    return { ok: true, name: trimmed };
  }

  function parseAmount(input) {
    const error = `Amount must be whole taka, ${MIN_AMOUNT} to ${MAX_AMOUNT}.`;
    if (typeof input !== 'string' && typeof input !== 'number') return { ok: false, error };
    const s = String(input).trim();
    if (!/^\d+$/.test(s)) return { ok: false, error };
    const amount = Number(s);
    if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) return { ok: false, error };
    return { ok: true, amount };
  }

  function validateNote(note) {
    const trimmed = typeof note === 'string' ? note.trim() : '';
    if (trimmed.length > MAX_NOTE) {
      return { ok: false, error: `Note must be at most ${MAX_NOTE} characters.` };
    }
    return { ok: true, note: trimmed };
  }

  function canRemoveMember(memberId, payments) {
    return !payments.some((p) => p.payerId === memberId);
  }

  // Whole-taka shares; leftover taka go to the earliest members.
  function shares(total, memberCount) {
    if (memberCount <= 0) return [];
    const base = Math.floor(total / memberCount);
    const extra = total % memberCount;
    return Array.from({ length: memberCount }, (_, i) => base + (i < extra ? 1 : 0));
  }

  function balances(members, payments) {
    const paid = new Map(members.map((m) => [m.id, 0]));
    for (const p of payments) {
      if (paid.has(p.payerId)) paid.set(p.payerId, paid.get(p.payerId) + p.amount);
    }
    const total = [...paid.values()].reduce((a, b) => a + b, 0);
    const s = shares(total, members.length);
    const result = members.map((m, i) => ({
      id: m.id,
      name: m.name,
      paid: paid.get(m.id),
      share: s[i],
      balance: paid.get(m.id) - s[i],
    }));
    const sum = result.reduce((a, b) => a + b.balance, 0);
    if (sum !== 0) throw new Error(`Balances add up to ${sum}, not 0.`);
    return result;
  }

  // Biggest debtor pays biggest creditor, repeat. Ties: earliest member first.
  function settle(bals) {
    const left = bals.map((b) => ({ id: b.id, name: b.name, balance: b.balance }));
    const transfers = [];
    for (;;) {
      let debtor = null;
      let creditor = null;
      for (const b of left) {
        if (b.balance < 0 && (!debtor || b.balance < debtor.balance)) debtor = b;
        if (b.balance > 0 && (!creditor || b.balance > creditor.balance)) creditor = b;
      }
      if (!debtor || !creditor) break;
      const amount = Math.min(-debtor.balance, creditor.balance);
      debtor.balance += amount;
      creditor.balance -= amount;
      transfers.push({
        from: { id: debtor.id, name: debtor.name },
        to: { id: creditor.id, name: creditor.name },
        amount,
      });
    }
    return transfers;
  }

  function formatTransfer(t) {
    return `${t.from.name} pays ${t.to.name} ${t.amount} Tk`;
  }

  const api = {
    MIN_AMOUNT, MAX_AMOUNT, MAX_NOTE,
    validateName, parseAmount, validateNote, canRemoveMember,
    shares, balances, settle, formatTransfer,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MessSplit = api;
})(typeof window !== 'undefined' ? window : globalThis);
