// ===== PayDay — app.js =====

(function () {
  'use strict';

  // --- Constants ---
  const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const WEEKDAY_INDICES = [2, 3, 4, 5, 6];
  const DEFAULT_START = '08:00';
  const DEFAULT_END   = '17:00';
  const MINUTES = ['00', '15', '30', '45'];
  const BILLS = [100, 50, 20, 10, 5];
  const LEGACY_STORAGE_KEY = 'nannyPay';

  // --- DOM refs ---
  const signInOverlay     = document.getElementById('sign-in-overlay');
  const appContainer      = document.getElementById('app-container');
  const googleSignInBtn   = document.getElementById('google-sign-in-btn');
  const signOutBtn        = document.getElementById('sign-out-btn');
  const userEmailEl       = document.getElementById('user-email');
  const syncIndicator     = document.getElementById('sync-indicator');
  const householdCodeEl   = document.getElementById('household-code');
  const copyHouseholdBtn  = document.getElementById('copy-household-code');
  const joinHouseholdInput = document.getElementById('join-household-input');
  const joinHouseholdBtn  = document.getElementById('join-household-btn');
  const timesheetEl       = document.getElementById('timesheet');
  const settingsToggle    = document.getElementById('settings-toggle');
  const settingsPanel     = document.getElementById('settings-panel');
  const hourlyRateInput   = document.getElementById('hourly-rate');
  const fuelRateInput     = document.getElementById('fuel-rate');
  const totalHoursEl      = document.getElementById('total-hours');
  const totalWagesEl      = document.getElementById('total-wages');
  const totalFuelEl       = document.getElementById('total-fuel');
  const totalPayEl        = document.getElementById('total-pay');
  const weekLabelEl       = document.getElementById('week-label');
  const resetBtn          = document.getElementById('reset-btn');
  const fillDefaultsBtn   = document.getElementById('fill-defaults');
  const savePayBtn        = document.getElementById('save-pay-btn');
  const tabBar            = document.getElementById('tab-bar');
  const cashGridEl        = document.getElementById('cash-grid');
  const cashTotalEl       = document.getElementById('cash-total');
  const cashTransactionsEl = document.getElementById('cash-transactions');
  const historyListEl     = document.getElementById('history-list');
  const historyTotalsEl   = document.getElementById('history-totals');
  const historyGrandTotal = document.getElementById('history-grand-total');
  const bonusInput        = document.getElementById('bonus-input');
  const carryoverRowEl    = document.getElementById('carryover-row');
  const totalCarryoverEl  = document.getElementById('total-carryover');
  const clearCarryoverBtn = document.getElementById('clear-carryover');

  // --- Firebase state ---
  let currentUser = null;
  let householdId = null;
  let stateRef = null;
  let unsubscribe = null; // Firebase listener cleanup
  let storageKey = null;  // per-uid localStorage key, set once signed in

  // --- State ---
  let state = defaultState();

  // ============================
  //  HELPERS
  // ============================

  function getCurrentWeekSaturday() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 6 ? 0 : -(day + 1);
    const sat = new Date(now);
    sat.setDate(now.getDate() + diff);
    sat.setHours(0, 0, 0, 0);
    return sat;
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatDateFull(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Local-calendar date key. Never toISOString() here: that converts to UTC
  // first, which shifts the date across midnight for UTC+ timezones and makes
  // two household members in different zones fight over weekStart.
  function toLocalDateKey(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function dateKey(index) {
    const sat = getCurrentWeekSaturday();
    const d = new Date(sat);
    d.setDate(sat.getDate() + index);
    return toLocalDateKey(d);
  }

  function calcHours(start, end) {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    return diff / 60;
  }

  function to12h(timeStr) {
    if (!timeStr) return { h12: '', min: '', period: 'AM' };
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return { h12: String(h12), min: String(m).padStart(2, '0'), period };
  }

  function to24h(h12, min, period) {
    if (!h12 || min === '') return '';
    let h = parseInt(h12, 10);
    if (period === 'AM' && h === 12) h = 0;
    if (period === 'PM' && h !== 12) h += 12;
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }

  function hourOptions(selected) {
    let html = '<option value="">--</option>';
    for (let i = 1; i <= 12; i++) {
      html += `<option value="${i}" ${String(i) === selected ? 'selected' : ''}>${i}</option>`;
    }
    return html;
  }

  function minuteOptions(selected) {
    let html = '<option value="">--</option>';
    MINUTES.forEach(m => {
      html += `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`;
    });
    return html;
  }

  function periodOptions(selected) {
    return `<option value="AM" ${selected === 'AM' ? 'selected' : ''}>AM</option>` +
           `<option value="PM" ${selected === 'PM' ? 'selected' : ''}>PM</option>`;
  }

  function calcWeekTotal() {
    if (!state.days) state.days = {};
    let totalHours = 0;
    let fuelDays = 0;
    DAYS.forEach((_, i) => {
      const key = dateKey(i);
      const dayData = state.days[key];
      if (dayData) {
        totalHours += calcHours(dayData.start, dayData.end);
        if (dayData.fuel) fuelDays++;
      }
    });
    const wages = totalHours * state.hourlyRate;
    const fuel = fuelDays * state.fuelRate;
    const bonus = state.bonus || 0;
    const carryover = state.carryover || 0;
    const total = wages + fuel + bonus + carryover;
    return { totalHours, fuelDays, wages, fuel, bonus, carryover, total };
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // HTML-escape for strings interpolated into innerHTML templates. Household
  // state is written by every member, so anything read from it is untrusted.
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ============================
  //  PERSISTENCE (localStorage + Firebase)
  // ============================

  function defaultState() {
    const cash = {};
    BILLS.forEach(b => cash[b] = 0);
    return {
      hourlyRate: 22,
      fuelRate: 10,
      weekStart: toLocalDateKey(getCurrentWeekSaturday()),
      days: {},
      cash: cash,
      cashTransactions: [],
      history: [],
      archivedWeeks: {},
      carryover: 0,
      bonus: 0
    };
  }

  // Backfill fields Firebase strips (empty objects/arrays) or old caches lack.
  function normalizeState(s) {
    if (!s.days) s.days = {};
    if (!s.cash) s.cash = {};
    if (!s.cashTransactions) s.cashTransactions = [];
    if (!s.history) s.history = [];
    if (!s.archivedWeeks) s.archivedWeeks = {};
    if (s.carryover === undefined) s.carryover = 0;
    if (s.bonus === undefined) s.bonus = 0;
    BILLS.forEach(b => { if (s.cash[b] === undefined) s.cash[b] = 0; });
    return s;
  }

  // Roll the week forward if weekStart is stale. Unpaid entries are archived,
  // never deleted — Save & Pay already clears days/bonus, so anything still
  // here at rollover is money the household hasn't settled yet.
  function reconcileWeek(s) {
    const currentWeek = toLocalDateKey(getCurrentWeekSaturday());
    if (s.weekStart && s.weekStart !== currentWeek) {
      if (Object.keys(s.days).length > 0 || (s.bonus || 0) > 0) {
        s.archivedWeeks[s.weekStart] = { days: s.days, bonus: s.bonus || 0 };
      }
      s.days = {};
      s.bonus = 0;
    }
    s.weekStart = currentWeek;
    return s;
  }

  // Per-uid cache; envelope ties the snapshot to the household it came from
  // so one account's data can never seed another account's household.
  function loadCachedState(hid) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const envelope = JSON.parse(raw);
      if (envelope.householdId !== hid || !envelope.state) return null;
      return envelope.state;
    } catch (_) {
      return null;
    }
  }

  function persistLocal() {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ householdId: householdId, state: state }));
    } catch (_) { /* quota exceeded / private mode — Firebase remains source of truth */ }
  }

  function saveState() {
    persistLocal();
    if (stateRef) {
      setSyncStatus('syncing');
      stateRef.set(state)
        .then(() => setSyncStatus('synced'))
        .catch(() => setSyncStatus('offline'));
    }
  }

  function setSyncStatus(status) {
    if (!syncIndicator) return;
    switch (status) {
      case 'synced':
        syncIndicator.textContent = '🟢';
        syncIndicator.title = 'Synced';
        break;
      case 'syncing':
        syncIndicator.textContent = '🔵';
        syncIndicator.title = 'Syncing…';
        break;
      case 'offline':
        syncIndicator.textContent = '🔴';
        syncIndicator.title = 'Offline — changes saved locally';
        break;
      default:
        syncIndicator.textContent = '⚪';
        syncIndicator.title = 'Not connected';
    }
  }

  // Listen for real-time updates from Firebase
  function startFirebaseListener() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (!stateRef) return;

    // Capture the ref: stateRef is reassigned when switching households, and
    // the teardown must detach from the ref it attached to, not the new one.
    const ref = stateRef;

    const callback = ref.on('value', (snapshot) => {
      const remoteState = snapshot.val();
      if (!remoteState) {
        // No data in Firebase yet — seed it with our local state
        ref.set(state);
        setSyncStatus('synced');
        return;
      }

      state = reconcileWeek(normalizeState(remoteState));
      persistLocal();
      refreshUI();
      setSyncStatus('synced');
    }, () => {
      setSyncStatus('offline');
    });

    unsubscribe = () => ref.off('value', callback);
  }

  function refreshUI() {
    hourlyRateInput.value = state.hourlyRate;
    fuelRateInput.value = state.fuelRate;
    bonusInput.value = state.bonus || 0;
    renderWeekLabel();
    renderTimesheet();
    renderTotals();
    renderCash();
    renderCashTransactions();
    renderHistory();
  }

  // ============================
  //  AUTH & HOUSEHOLD
  // ============================

  function showSignIn() {
    signInOverlay.style.display = '';
    appContainer.style.display = 'none';
  }

  function showApp() {
    signInOverlay.style.display = 'none';
    appContainer.style.display = '';
  }

  async function onAuthReady(user) {
    if (!user) {
      showSignIn();
      return;
    }

    currentUser = user;
    userEmailEl.textContent = user.email;
    storageKey = 'payday:' + user.uid;
    localStorage.removeItem(LEGACY_STORAGE_KEY); // pre-namespacing cache

    try {
      // Look up household
      let hid = await getHouseholdId(user.uid);
      if (!hid) {
        // First time — create a household
        await createHousehold(user.uid, user.email);
        hid = user.uid;
      }
      householdId = hid;
      householdCodeEl.textContent = householdId;

      // Offline-first: render this household's cached snapshot (if any) until
      // the live listener delivers fresh data.
      state = reconcileWeek(normalizeState(loadCachedState(hid) || defaultState()));
      refreshUI();

      // Set up Firebase state reference
      stateRef = getStateRef(householdId);

      // Start listening for real-time updates
      startFirebaseListener();

      showApp();
    } catch (err) {
      // Without this, a failed household lookup strands an authenticated
      // user on the sign-in overlay with no explanation.
      console.error('Household setup failed:', err);
      setSyncStatus('offline');
      alert('Signed in, but your household could not be loaded' +
        (err && err.code ? ' (' + err.code + ')' : '') +
        '. Check your connection and reopen the app.');
    }
  }

  // ============================
  //  TAB NAVIGATION
  // ============================

  function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    tabBar.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    const fillBtn = document.getElementById('fill-defaults');
    fillBtn.style.display = tabName === 'timesheet' ? '' : 'none';
  }

  // ============================
  //  TIMESHEET TAB
  // ============================

  function renderWeekLabel() {
    const sat = getCurrentWeekSaturday();
    const fri = new Date(sat);
    fri.setDate(sat.getDate() + 6);
    weekLabelEl.textContent = `Week of ${formatDate(sat)} – ${formatDate(fri)}`;
  }

  function buildTimePicker(prefix, key, timeStr) {
    const { h12, min, period } = to12h(timeStr);
    return `
      <div class="time-picker" data-key="${key}" data-field="${prefix}">
        <select class="tp-select tp-hour" data-part="hour" aria-label="${prefix} hour">
          ${hourOptions(h12)}
        </select>
        <span class="tp-colon">:</span>
        <select class="tp-select tp-min" data-part="min" aria-label="${prefix} minutes">
          ${minuteOptions(min)}
        </select>
        <select class="tp-select tp-period" data-part="period" aria-label="${prefix} AM/PM">
          ${periodOptions(period)}
        </select>
      </div>
    `;
  }

  function renderTimesheet() {
    if (!state.days) state.days = {};
    timesheetEl.innerHTML = '';
    const sat = getCurrentWeekSaturday();

    DAYS.forEach((dayName, i) => {
      const d = new Date(sat);
      d.setDate(sat.getDate() + i);
      const key = dateKey(i);
      const dayData = state.days[key] || { start: '', end: '', fuel: false };
      const hours = calcHours(dayData.start, dayData.end);

      const card = document.createElement('div');
      card.className = 'day-card' + (hours > 0 ? ' has-hours' : '');
      card.innerHTML = `
        <div class="day-header">
          <div>
            <span class="day-name">${dayName}</span>
            <span class="day-date">${formatDate(d)}</span>
          </div>
          <div class="day-header-right">
            <span class="day-hours">${hours > 0 ? hours.toFixed(2) + ' hrs' : '—'}</span>
            <button class="clear-day-btn" data-key="${key}" aria-label="Clear ${dayName}" title="Clear day">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="day-inputs">
          <div class="time-group">
            <span class="time-label">Start</span>
            ${buildTimePicker('start', key, dayData.start)}
          </div>
          <span class="time-sep">→</span>
          <div class="time-group">
            <span class="time-label">End</span>
            ${buildTimePicker('end', key, dayData.end)}
          </div>
        </div>
        <label class="fuel-toggle" for="fuel-${key}">
          <input type="checkbox" id="fuel-${key}" ${dayData.fuel ? 'checked' : ''} data-key="${key}" data-field="fuel">
          <span class="fuel-switch"></span>
          <span class="fuel-label">Fuel reimbursement</span>
        </label>
      `;
      timesheetEl.appendChild(card);
    });

    timesheetEl.querySelectorAll('.time-picker select').forEach(sel => {
      sel.addEventListener('change', onTimePickerChange);
    });
    timesheetEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', onFuelChange);
    });
    timesheetEl.querySelectorAll('.clear-day-btn').forEach(btn => {
      btn.addEventListener('click', onClearDay);
    });
  }

  function renderTotals() {
    const { totalHours, wages, fuel, bonus, carryover, total } = calcWeekTotal();
    totalHoursEl.textContent = totalHours.toFixed(2);
    totalWagesEl.textContent = '$' + wages.toFixed(2);
    totalFuelEl.textContent = '$' + fuel.toFixed(2);
    totalPayEl.textContent = '$' + total.toFixed(2);

    if (carryover > 0) {
      carryoverRowEl.style.display = '';
      totalCarryoverEl.textContent = '$' + carryover.toFixed(2);
    } else {
      carryoverRowEl.style.display = 'none';
    }
  }

  // ============================
  //  CASH TAB
  // ============================

  function getCashTotal() {
    let total = 0;
    BILLS.forEach(b => { total += (state.cash[b] || 0) * b; });
    return total;
  }

  // Calculate which bills would be used for a given amount
  // Returns { breakdown: {100: 5, 20: 2, ...}, actualAmount: 540, remainder: 0 }
  function calculateBillBreakdown(amount) {
    const breakdown = {};
    let remaining = amount;
    for (const bill of BILLS) {
      const available = state.cash[bill] || 0;
      const needed = Math.floor(remaining / bill);
      const used = Math.min(needed, available);
      if (used > 0) {
        breakdown[bill] = used;
        remaining -= used * bill;
      }
    }
    return { breakdown, actualAmount: amount - remaining, remainder: remaining };
  }

  // Format a bill breakdown for display
  function formatBreakdown(breakdown) {
    return BILLS
      .filter(b => breakdown[b] > 0)
      .map(b => `${breakdown[b]}×$${b}`)
      .join(' + ');
  }

  function renderCash() {
    cashGridEl.innerHTML = '';
    BILLS.forEach(bill => {
      const count = state.cash[bill] || 0;
      const subtotal = count * bill;
      const row = document.createElement('div');
      row.className = 'bill-card';
      row.innerHTML = `
        <span class="bill-label">$${bill}</span>
        <div class="bill-controls">
          <button class="bill-btn" data-bill="${bill}" data-action="minus">−</button>
          <span class="bill-count" id="count-${bill}">${count}</span>
          <button class="bill-btn" data-bill="${bill}" data-action="plus">+</button>
        </div>
        <span class="bill-subtotal">$${subtotal.toFixed(2)}</span>
      `;
      cashGridEl.appendChild(row);
    });

    cashTotalEl.textContent = '$' + getCashTotal().toFixed(2);

    cashGridEl.querySelectorAll('.bill-btn').forEach(btn => {
      btn.addEventListener('click', onBillChange);
    });
  }

  function renderCashTransactions() {
    if (!state.cashTransactions || state.cashTransactions.length === 0) {
      cashTransactionsEl.innerHTML = '<div class="empty-state">No transactions yet</div>';
      return;
    }
    cashTransactionsEl.innerHTML = '';
    [...state.cashTransactions].reverse().forEach(txn => {
      const div = document.createElement('div');
      div.className = 'txn-card';
      const isDeposit = txn.type === 'deposit';
      const breakdownHtml = txn.breakdown ? `<span class="txn-breakdown">${esc(formatBreakdown(txn.breakdown))}</span>` : '';
      div.innerHTML = `
        <div class="txn-info">
          <span class="txn-label">${esc(txn.label)}</span>
          <span class="txn-date">${esc(txn.date)}</span>
          ${breakdownHtml}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="txn-amount ${isDeposit ? 'deposit' : 'withdrawal'}">
            ${isDeposit ? '+' : '−'}$${Math.abs(txn.amount).toFixed(2)}
          </span>
          <button class="txn-delete" data-id="${esc(txn.id)}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;
      cashTransactionsEl.appendChild(div);
    });

    cashTransactionsEl.querySelectorAll('.txn-delete').forEach(btn => {
      btn.addEventListener('click', onDeleteTransaction);
    });
  }

  // ============================
  //  HISTORY TAB
  // ============================

  function renderHistory() {
    if (!state.history || state.history.length === 0) {
      historyListEl.innerHTML = '<div class="empty-state">No payments recorded yet.<br>Use "Save & Pay" on the Timesheet tab.</div>';
      historyTotalsEl.style.display = 'none';
      return;
    }

    historyListEl.innerHTML = '';
    let grandTotal = 0;

    [...state.history].reverse().forEach(entry => {
      grandTotal += entry.total;
      const card = document.createElement('div');
      card.className = 'history-card';
      card.innerHTML = `
        <div class="history-header">
          <span class="history-week">${esc(entry.weekLabel)}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="history-amount">$${entry.total.toFixed(2)}</span>
            <button class="history-delete" data-id="${esc(entry.id)}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="history-details">
          <span class="history-detail">Hours: <span>${entry.hours.toFixed(2)}</span></span>
          <span class="history-detail">Wages: <span>$${entry.wages.toFixed(2)}</span></span>
          <span class="history-detail">Fuel: <span>$${entry.fuel.toFixed(2)}</span></span>
          ${(entry.bonus || 0) > 0 ? `<span class="history-detail">Bonus: <span>$${entry.bonus.toFixed(2)}</span></span>` : ''}
          ${(entry.carryover || 0) > 0 ? `<span class="history-detail" style="color:#fb923c">Carryover: <span>$${entry.carryover.toFixed(2)}</span></span>` : ''}
          <span class="history-detail">Paid: <span>${esc(entry.paidDate)}</span></span>
          ${(entry.shortfall || 0) > 0 ? `<span class="history-detail" style="color:var(--danger)">Short: <span>$${entry.shortfall.toFixed(2)}</span></span>` : ''}
        </div>
      `;
      historyListEl.appendChild(card);
    });

    historyTotalsEl.style.display = '';
    historyGrandTotal.textContent = '$' + grandTotal.toFixed(2);

    historyListEl.querySelectorAll('.history-delete').forEach(btn => {
      btn.addEventListener('click', onDeleteHistory);
    });
  }

  // ============================
  //  EVENT HANDLERS
  // ============================

  function onTimePickerChange(e) {
    const picker = e.target.closest('.time-picker');
    const key = picker.dataset.key;
    const field = picker.dataset.field;
    const h12 = picker.querySelector('[data-part="hour"]').value;
    const min = picker.querySelector('[data-part="min"]').value;
    const period = picker.querySelector('[data-part="period"]').value;
    const time24 = to24h(h12, min, period);

    if (!state.days[key]) state.days[key] = { start: '', end: '', fuel: false };
    state.days[key][field] = time24;
    saveState();

    const card = picker.closest('.day-card');
    const dayData = state.days[key];
    const hours = calcHours(dayData.start, dayData.end);
    card.querySelector('.day-hours').textContent = hours > 0 ? hours.toFixed(2) + ' hrs' : '—';
    card.classList.toggle('has-hours', hours > 0);
    renderTotals();
  }

  function onFuelChange(e) {
    const { key } = e.target.dataset;
    if (!state.days[key]) state.days[key] = { start: '', end: '', fuel: false };
    state.days[key].fuel = e.target.checked;
    saveState();
    renderTotals();
  }

  function onSettingsChange() {
    state.hourlyRate = parseFloat(hourlyRateInput.value) || 0;
    state.fuelRate = parseFloat(fuelRateInput.value) || 0;
    saveState();
    renderTotals();
  }

  function onClearDay(e) {
    const key = e.currentTarget.dataset.key;
    delete state.days[key];
    saveState();
    renderTimesheet();
    renderTotals();
  }

  function onReset() {
    if (!confirm('Reset all times and fuel for this week?')) return;
    state.days = {};
    saveState();
    renderTimesheet();
    renderTotals();
  }

  function onFillDefaults() {
    WEEKDAY_INDICES.forEach(i => {
      const key = dateKey(i);
      if (!state.days[key]) state.days[key] = { start: '', end: '', fuel: false };
      state.days[key].start = DEFAULT_START;
      state.days[key].end = DEFAULT_END;
      state.days[key].fuel = true;
    });
    saveState();
    renderTimesheet();
    renderTotals();
  }

  function onClearCarryover() {
    state.carryover = 0;
    saveState();
    renderTotals();
  }

  function onSavePay() {
    const { totalHours, wages, fuel, bonus, carryover, total } = calcWeekTotal();
    if (total <= 0) {
      alert('Nothing to save — enter some hours first.');
      return;
    }

    const sat = getCurrentWeekSaturday();
    const fri = new Date(sat);
    fri.setDate(sat.getDate() + 6);

    // Calculate exactly which bills we can use
    const { breakdown, actualAmount, remainder } = calculateBillBreakdown(total);
    const shortfall = total - actualAmount;

    // If we can't make the full amount, confirm with user
    if (shortfall > 0) {
      const breakdownStr = actualAmount > 0 ? formatBreakdown(breakdown) : 'none';
      const proceed = confirm(
        `Can't make exact change for $${total.toFixed(2)}.\n\n` +
        `Bills available: ${breakdownStr} = $${actualAmount.toFixed(2)}\n` +
        `Short: $${shortfall.toFixed(2)} (will carry over)\n\n` +
        `Proceed with $${actualAmount.toFixed(2)} payment?`
      );
      if (!proceed) return;
    }

    const entry = {
      id: generateId(),
      weekStart: toLocalDateKey(sat),
      weekLabel: `${formatDate(sat)} – ${formatDate(fri)}`,
      hours: totalHours,
      wages: wages,
      fuel: fuel,
      bonus: bonus,
      carryover: carryover,
      total: total,
      amountPaid: actualAmount,
      shortfall: shortfall,
      paidDate: formatDateFull(new Date())
    };

    state.history.push(entry);

    if (actualAmount > 0) {
      state.cashTransactions.push({
        id: generateId(),
        type: 'withdrawal',
        label: `Payment: ${entry.weekLabel}`,
        amount: actualAmount,
        breakdown: breakdown,
        date: entry.paidDate
      });
    }

    // Deduct the actual bills used
    for (const bill of BILLS) {
      if (breakdown[bill]) {
        state.cash[bill] -= breakdown[bill];
      }
    }

    state.carryover = shortfall;
    state.days = {};
    state.bonus = 0;
    saveState();

    bonusInput.value = 0;

    renderTimesheet();
    renderTotals();
    renderCash();
    renderCashTransactions();
    renderHistory();

    let msg = `Saved! $${actualAmount.toFixed(2)} paid from cash.`;
    if (actualAmount > 0) {
      msg += `\n\nBills used: ${formatBreakdown(breakdown)}`;
    }
    if (shortfall > 0) {
      msg += `\n\nShort $${shortfall.toFixed(2)} — this will carry over to next week.`;
    }
    alert(msg);
  }

  function onBonusChange() {
    state.bonus = parseFloat(bonusInput.value) || 0;
    saveState();
    renderTotals();
  }

  function onBillChange(e) {
    const bill = parseInt(e.currentTarget.dataset.bill, 10);
    const action = e.currentTarget.dataset.action;
    if (action === 'plus') {
      state.cash[bill] = (state.cash[bill] || 0) + 1;
    } else {
      state.cash[bill] = Math.max(0, (state.cash[bill] || 0) - 1);
    }
    saveState();

    const countEl = document.getElementById('count-' + bill);
    countEl.textContent = state.cash[bill];
    const card = countEl.closest('.bill-card');
    card.querySelector('.bill-subtotal').textContent = '$' + (state.cash[bill] * bill).toFixed(2);
    cashTotalEl.textContent = '$' + getCashTotal().toFixed(2);
  }

  function onDeleteTransaction(e) {
    const id = e.currentTarget.dataset.id;
    state.cashTransactions = state.cashTransactions.filter(t => t.id !== id);
    saveState();
    renderCashTransactions();
  }

  function onDeleteHistory(e) {
    const id = e.currentTarget.dataset.id;
    state.history = state.history.filter(h => h.id !== id);
    saveState();
    renderHistory();
  }

  // ============================
  //  HOUSEHOLD MANAGEMENT
  // ============================

  function onCopyHouseholdCode() {
    if (householdId) {
      navigator.clipboard.writeText(householdId).then(() => {
        const original = copyHouseholdBtn.innerHTML;
        copyHouseholdBtn.innerHTML = '✓';
        setTimeout(() => { copyHouseholdBtn.innerHTML = original; }, 1500);
      }).catch(() => {
        // Fallback: select text
        const range = document.createRange();
        range.selectNode(householdCodeEl);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      });
    }
  }

  async function onJoinHousehold() {
    const code = joinHouseholdInput.value.trim();
    if (!code) {
      alert('Please paste a household code.');
      return;
    }
    if (!currentUser) return;

    try {
      await joinHousehold(currentUser.uid, currentUser.email, code);

      // Detach from the old household BEFORE repointing, so its listener
      // can't keep overwriting local state with the old household's data.
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }

      householdId = code;
      householdCodeEl.textContent = householdId;

      // Switch Firebase listener to the new household
      stateRef = getStateRef(householdId);
      startFirebaseListener();

      joinHouseholdInput.value = '';
      alert('Joined household! Data will now sync.');
    } catch (err) {
      alert(err.message || 'Failed to join household.');
    }
  }

  // ============================
  //  INIT
  // ============================

  function init() {
    // Auth state listener
    auth.onAuthStateChanged(onAuthReady);

    // Complete a redirect-based sign-in if we're returning from one
    // (the fallback path in signInWithGoogle). Success flows through
    // onAuthStateChanged; only failures need surfacing here.
    auth.getRedirectResult().catch(err => {
      console.error('Redirect sign-in failed:', err);
      alert('Sign-in failed' + (err && err.code ? ' (' + err.code + ')' : '') + '. Please try again.');
    });

    // Sign in button
    googleSignInBtn.addEventListener('click', () => {
      signInWithGoogle().catch(err => {
        // Closing the popup or double-tapping the button isn't an error.
        if (err && (err.code === 'auth/popup-closed-by-user' ||
                    err.code === 'auth/cancelled-popup-request')) return;
        console.error('Sign-in failed:', err);
        alert('Sign-in failed' + (err && err.code ? ' (' + err.code + ')' : '') + '. Please try again.');
      });
    });

    // Sign out button
    signOutBtn.addEventListener('click', () => {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      stateRef = null;
      householdId = null;
      currentUser = null;
      storageKey = null;
      state = defaultState();
      signOutUser();
    });

    // Household management
    copyHouseholdBtn.addEventListener('click', onCopyHouseholdCode);
    joinHouseholdBtn.addEventListener('click', onJoinHousehold);

    // Settings input
    hourlyRateInput.addEventListener('input', onSettingsChange);
    fuelRateInput.addEventListener('input', onSettingsChange);
    bonusInput.addEventListener('input', onBonusChange);

    // Tab switching
    tabBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (btn) switchTab(btn.dataset.tab);
    });

    // Settings toggle
    settingsToggle.addEventListener('click', () => {
      settingsPanel.classList.toggle('open');
      settingsToggle.classList.toggle('active');
    });

    // Timesheet actions
    fillDefaultsBtn.addEventListener('click', onFillDefaults);
    resetBtn.addEventListener('click', onReset);
    savePayBtn.addEventListener('click', onSavePay);
    clearCarryoverBtn.addEventListener('click', onClearCarryover);

    // Initial render (may be overridden by Firebase data)
    refreshUI();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  init();
})();
