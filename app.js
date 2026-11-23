// Mess Split: DOM wiring and localStorage. Money logic lives in split.js.
(function () {
  'use strict';

  const S = window.MessSplit;
  const STORAGE_KEY = 'mess-split-v1';

  // ---------------------------------------------------------------- state

  function emptyState() {
    return { members: [], payments: [], nextId: 1 };
  }

  function isValidState(s) {
    return s && Array.isArray(s.members) && Array.isArray(s.payments) &&
      Number.isInteger(s.nextId) &&
      s.members.every((m) => Number.isInteger(m.id) && typeof m.name === 'string') &&
      s.payments.every((p) => Number.isInteger(p.id) && Number.isInteger(p.payerId) &&
        Number.isInteger(p.amount) && typeof p.note === 'string');
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const s = JSON.parse(raw);
      return isValidState(s) ? s : emptyState();
    } catch (e) {
      return emptyState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage full or disabled: the app still works for this session.
    }
  }

  let state = load();

  function commit() {
    save();
    render();
  }

  // ---------------------------------------------------------------- DOM

  const $ = (id) => document.getElementById(id);

  const memberForm = $('member-form');
  const memberName = $('member-name');
  const memberError = $('member-error');
  const memberList = $('member-list');
  const memberEmpty = $('member-empty');

  const paymentForm = $('payment-form');
  const payerSelect = $('payment-payer');
  const amountInput = $('payment-amount');
  const noteInput = $('payment-note');
  const paymentError = $('payment-error');
  const paymentList = $('payment-list');
  const paymentEmpty = $('payment-empty');
  const paymentsTotal = $('payments-total');

  const balanceTable = $('balance-table');
  const balanceBody = balanceTable.querySelector('tbody');
  const balanceEmpty = $('balance-empty');

  const settleList = $('settle-list');
  const settleEmpty = $('settle-empty');

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'className') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (k in node) node[k] = v;
        else node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c != null) node.append(c);
    }
    return node;
  }

  const memberById = (id) => state.members.find((m) => m.id === id);

  // ---------------------------------------------------------------- actions

  function addMember(name) {
    const r = S.validateName(name, state.members);
    if (!r.ok) return r.error;
    state.members.push({ id: state.nextId++, name: r.name });
    commit();
    return null;
  }

  function removeMember(id) {
    if (!S.canRemoveMember(id, state.payments)) return;
    state.members = state.members.filter((m) => m.id !== id);
    commit();
  }

  function addPayment(payerId, amountText, noteText) {
    if (!memberById(payerId)) return 'Choose who paid.';
    const a = S.parseAmount(amountText);
    if (!a.ok) return a.error;
    const n = S.validateNote(noteText);
    if (!n.ok) return n.error;
    state.payments.push({ id: state.nextId++, payerId, amount: a.amount, note: n.note });
    commit();
    return null;
  }

  function deletePayment(id) {
    state.payments = state.payments.filter((p) => p.id !== id);
    commit();
  }

  // ---------------------------------------------------------------- render

  function renderMembers() {
    memberList.replaceChildren(...state.members.map((m) => {
      const removable = S.canRemoveMember(m.id, state.payments);
      return el('li', null,
        el('span', { className: 'main', text: m.name }),
        el('button', {
          type: 'button',
          className: 'small',
          text: 'Remove',
          disabled: !removable,
          title: removable ? `Remove ${m.name}` : `${m.name} has payments and cannot be removed`,
          'aria-label': `Remove ${m.name}`,
          onclick: () => removeMember(m.id),
        }));
    }));
    memberEmpty.hidden = state.members.length > 0;
  }

  function renderPayerSelect() {
    const previous = Number(payerSelect.value);
    payerSelect.replaceChildren(...state.members.map((m) =>
      el('option', { value: String(m.id), text: m.name })));
    if (memberById(previous)) payerSelect.value = String(previous);
    const disabled = state.members.length === 0;
    for (const c of paymentForm.elements) c.disabled = disabled;
    if (disabled) {
      payerSelect.replaceChildren(el('option', { text: 'Add a member first' }));
    }
  }

  function renderPayments() {
    // Newest first.
    const items = state.payments.slice().reverse().map((p) => {
      const payer = memberById(p.payerId);
      return el('li', null,
        el('span', { className: 'main' },
          el('span', { text: payer ? payer.name : 'Unknown' }),
          p.note ? el('span', { className: 'sub', text: p.note }) : null),
        el('span', { className: 'amount', text: `${p.amount} Tk` }),
        el('button', {
          type: 'button',
          className: 'small',
          text: 'Delete',
          'aria-label': `Delete ${p.amount} Tk payment by ${payer ? payer.name : 'unknown'}`,
          onclick: () => deletePayment(p.id),
        }));
    });
    paymentList.replaceChildren(...items);
    paymentEmpty.hidden = state.payments.length > 0;
    const total = state.payments.reduce((a, p) => a + p.amount, 0);
    paymentsTotal.textContent = state.payments.length ? `(total ${total} Tk)` : '';
  }

  function renderBalances(bals) {
    balanceBody.replaceChildren(...bals.map((b) => {
      const cls = b.balance > 0 ? 'pos' : b.balance < 0 ? 'neg' : '';
      const sign = b.balance > 0 ? '+' : '';
      return el('tr', null,
        el('td', { text: b.name }),
        el('td', { text: String(b.paid) }),
        el('td', { text: String(b.share) }),
        el('td', { className: cls, text: `${sign}${b.balance}` }));
    }));
    balanceTable.hidden = bals.length === 0;
    balanceEmpty.hidden = bals.length > 0;
  }

  function renderSettle(bals) {
    const transfers = S.settle(bals);
    settleList.replaceChildren(...transfers.map((t) =>
      el('li', { text: S.formatTransfer(t) })));
    settleEmpty.hidden = transfers.length > 0;
  }

  function render() {
    renderMembers();
    renderPayerSelect();
    renderPayments();
    const bals = S.balances(state.members, state.payments);
    renderBalances(bals);
    renderSettle(bals);
  }

  // ---------------------------------------------------------------- events

  memberForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = addMember(memberName.value);
    memberError.textContent = error || '';
    if (!error) memberName.value = '';
    memberName.focus();
  });

  paymentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = addPayment(Number(payerSelect.value), amountInput.value, noteInput.value);
    paymentError.textContent = error || '';
    if (!error) {
      amountInput.value = '';
      noteInput.value = '';
      amountInput.focus();
    }
  });

  memberName.addEventListener('input', () => { memberError.textContent = ''; });
  amountInput.addEventListener('input', () => { paymentError.textContent = ''; });

  // Keep multiple open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      state = load();
      render();
    }
  });

  render();
})();
