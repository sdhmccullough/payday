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
  const STORAGE_KEY = 'nannyPay';

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
  let isSyncing = false;  // Flag to prevent echo writes

  // --- State ---
  let state = loadState();

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

  function dateKey(index) {
    const sat = getCurrentWeekSaturday();
    const d = new Date(sat);
    d.setDate(sat.getDate() + index);
    return d.toISOString().slice(0, 10);
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

  // ============================
  //  PERSISTENCE (localStorage + Firebase)
  // ============================

  function defaultState() {
    const cash = {};
    BILLS.forEach(b => cash[b] = 0);
    return {
      hourlyRate: 22,
      fuelRate: 10,
      weekStart: getCurrentWeekSaturday().toISOString().slice(0, 10),
      days: {},
      cash: cash,
      cashTransactions: [],
      history: [],
      carryover: 0,
      bonus: 0
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const currentWeek = getCurrentWeekSaturday().toISOString().slice(0, 10);
        if (parsed.weekStart !== currentWeek) {
          parsed.days = {};
          parsed.weekStart = currentWeek;
        }
        if (!parsed.days) parsed.days = {};
        if (!parsed.cash) parsed.cash = {};
        if (!parsed.cashTransactions) parsed.cashTransactions = [];
        if (!parsed.history) parsed.history = [];
        if (parsed.carryover === undefined) parsed.carryover = 0;
        if (parsed.bonus === undefined) parsed.bonus = 0;
        BILLS.forEach(b => { if (parsed.cash[b] === undefined) parsed.cash[b] = 0; });
        return parsed;
      }
    } catch (_) { /* ignore */ }
    return defaultState();
  }

  function saveState() {
    // Always save to localStorage as offline cache
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    // Sync to Firebase if connected
    if (stateRef && !isSyncing) {
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
    if (unsubscribe) unsubscribe();
    if (!stateRef) return;

    const callback = stateRef.on('value', (snapshot) => {
      const remoteState = snapshot.val();
      if (!remoteState) {
        // No data in Firebase yet — push our local state
        stateRef.set(state);
        setSyncStatus('synced');
        return;
      }

      // Ensure week is current
      const currentWeek = getCurrentWeekSaturday().toISOString().slice(0, 10);
      if (remoteState.weekStart !== currentWeek) {
        remoteState.days = {};
        remoteState.weekStart = currentWeek;
      }

      // Ensure all fields (Firebase strips empty objects/arrays)
      if (!remoteState.days) remoteState.days = {};
      if (!remoteState.cash) remoteState.cash = {};
      if (!remoteState.cashTransactions) remoteState.cashTransactions = [];
      if (!remoteState.history) remoteState.history = [];
      if (remoteState.carryover === undefined) remoteState.carryover = 0;
      if (remoteState.bonus === undefined) remoteState.bonus = 0;
      BILLS.forEach(b => { if (remoteState.cash[b] === undefined) remoteState.cash[b] = 0; });

      // Update local state
      isSyncing = true;
      state = remoteState;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      // Re-render everything
      refreshUI();
      setSyncStatus('synced');
      isSyncing = false;
    }, () => {
      setSyncStatus('offline');
    });

    unsubscribe = () => stateRef.off('value', callback);
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

    // Look up household
    let hid = await getHouseholdId(user.uid);
    if (!hid) {
      // First time — create a household
      await createHousehold(user.uid, user.email);
      hid = user.uid;
    }
    householdId = hid;
    householdCodeEl.textContent = householdId;

    // Set up Firebase state reference
    stateRef = getStateRef(householdId);

    // Start listening for real-time updates
    startFirebaseListener();

    showApp();
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
      const breakdownHtml = txn.breakdown ? `<span class="txn-breakdown">${formatBreakdown(txn.breakdown)}</span>` : '';
      div.innerHTML = `
        <div class="txn-info">
          <span class="txn-label">${txn.label}</span>
          <span class="txn-date">${txn.date}</span>
          ${breakdownHtml}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="txn-amount ${isDeposit ? 'deposit' : 'withdrawal'}">
            ${isDeposit ? '+' : '−'}$${Math.abs(txn.amount).toFixed(2)}
          </span>
          <button class="txn-delete" data-id="${txn.id}" title="Delete">
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
          <span class="history-week">${entry.weekLabel}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="history-amount">$${entry.total.toFixed(2)}</span>
            <button class="history-delete" data-id="${entry.id}" title="Delete">
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
          <span class="history-detail">Paid: <span>${entry.paidDate}</span></span>
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
      weekStart: sat.toISOString().slice(0, 10),
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

    // Sign in button
    googleSignInBtn.addEventListener('click', () => {
      signInWithGoogle().catch(err => {
        console.error('Sign-in failed:', err);
        alert('Sign-in failed. Please try again.');
      });
    });

    // Sign out button
    signOutBtn.addEventListener('click', () => {
      if (unsubscribe) unsubscribe();
      stateRef = null;
      householdId = null;
      currentUser = null;
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
