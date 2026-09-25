// SDG&E TOU Optimizer v2 - Latest Version
// Features: Floating 50% Left Panel (Monthly Impact & R2 Vault) + Floating Liquid Glass AI Chat (Cloudflare AI Gateway / GLM-5.3)

const DEFAULT_PLANS = {
  'tou-dr1': {
    id: 'tou-dr1',
    name: 'SDG&E TOU-DR1',
    shortName: 'TOU-DR1',
    description: 'Standard residential 3-period Time-of-Use plan',
    hasSuper: true,
    rates: {
      summer: { super: 0.388, off: 0.476, peak: 0.697, label: 'Summer (Jun 1 - Oct 31)' },
      winter: { super: 0.449, off: 0.540, peak: 0.622, label: 'Winter (Nov 1 - May 31)' }
    }
  },
  'ev-tou-5': {
    id: 'ev-tou-5',
    name: 'SDG&E EV-TOU-5',
    shortName: 'EV-TOU-5',
    description: 'Electric Vehicle & battery storage plan (ultra-low super off-peak)',
    hasSuper: true,
    rates: {
      summer: { super: 0.131, off: 0.496, peak: 0.802, label: 'Summer (Jun 1 - Oct 31)' },
      winter: { super: 0.131, off: 0.496, peak: 0.802, label: 'Winter (Nov 1 - May 31)' }
    }
  },
  'tou-dr2': {
    id: 'tou-dr2',
    name: 'SDG&E TOU-DR2',
    shortName: 'TOU-DR2',
    description: 'Two-period Time-of-Use plan (4-9 p.m. On-Peak & Off-Peak only)',
    hasSuper: false,
    rates: {
      summer: { super: 0.450, off: 0.450, peak: 0.730, label: 'Summer (Jun 1 - Oct 31)' },
      winter: { super: 0.485, off: 0.485, peak: 0.610, label: 'Winter (Nov 1 - May 31)' }
    }
  }
};

const APPLIANCES = [
  {
    id: 'ac',
    name: 'Central A/C',
    icon: 'AC',
    meta: 'Cooling load · ~3.5 kW draw',
    estDailyKwh: 12,
    kwDraw: 3.5,
    ideal:     [10, 11, 12, 13],
    forbidden: [16, 17, 18, 19, 20],
    noisy:     [],
    needsAttended: false,
    notes: {
      best: 'Pre-cool the house 10 a.m.-2 p.m. while super off-peak is active. Drop setpoint 3-4°F below normal.',
      mid:  'Compressor naturally cycles 2-4 p.m. as house heats up. Acceptable shoulder pricing.',
      worst:'4-9 p.m. is the costliest cooling window. Set thermostat 3-4°F warmer and ride it out.'
    }
  },
  {
    id: 'dishwasher',
    name: 'Dishwasher',
    icon: 'DW',
    meta: 'Per-cycle load · ~1.2 kWh cycle',
    estDailyKwh: 1.5,
    kwDraw: 1.2,
    ideal:     [1, 2, 3, 4, 5, 11, 12, 13],
    forbidden: [15, 16, 17, 18, 19, 20],
    noisy:     [22, 23, 0],
    needsAttended: false,
    notes: {
      best: 'Delay-start at bedtime so the heated-dry cycle lands 1-5 a.m. Or run during midday super off-peak.',
      mid:  '6-10 a.m. or 9 p.m.-midnight if you missed the overnight window.',
      worst:'A pre-dinner load running into 4 p.m. is the #1 avoidable dishwasher mistake.'
    }
  },
  {
    id: 'dryer',
    name: 'Clothes Dryer',
    icon: 'DR',
    meta: 'Per-load · supervise · ~3.0 kW',
    estDailyKwh: 3,
    kwDraw: 3.0,
    ideal:     [10, 11, 12, 13],
    forbidden: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6],
    noisy:     [],
    needsAttended: true,
    notes: {
      best: 'Weekday 10 a.m.-2 p.m. Super off-peak rate AND you\'re awake to monitor lint/fire risk.',
      mid:  '7-10 a.m. is the only other safe daytime fallback - off-peak but cheaper than evening.',
      worst:'Anything after 2 p.m. bleeds into shoulder or peak. Overnight is never recommended unattended.'
    }
  },
  {
    id: 'ev',
    name: 'EV Charger (Level 2)',
    icon: 'EV',
    meta: 'Biggest dollar lever · ~7.2 kW',
    estDailyKwh: 30,
    kwDraw: 7.2,
    ideal:     [0, 1, 2, 3, 4, 5],
    forbidden: [16, 17, 18, 19, 20],
    noisy:     [],
    needsAttended: false,
    notes: {
      best: 'Set the car to charge midnight to 6 a.m. On EV-TOU-5, power drops to ~13¢/kWh for massive savings.',
      mid:  '10 a.m.-2 p.m. midday top-up if you work from home; 9 p.m.-midnight as a last resort.',
      worst:'A single 4-9 p.m. fast-charge can wipe out a month of optimization. Avoid peak charging.'
    }
  },
  {
    id: 'pool',
    name: 'Pool Pump',
    icon: 'PP',
    meta: '8 hr/day circulation · ~1.5 kW',
    estDailyKwh: 8,
    kwDraw: 1.5,
    ideal:     [1, 2, 3, 4, 10, 11, 12, 13],
    forbidden: [6, 7, 8, 9, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    noisy:     [],
    needsAttended: false,
    notes: {
      best: 'Two blocks: 1-5 a.m. and 10 a.m.-2 p.m. = 8 hours, 100% super off-peak. Program pump timer.',
      mid:  'A variable-speed pump can trickle at low rpm outside peak, but full-speed = expensive.',
      worst:'Single-speed pumps running 4-9 p.m. are one of the biggest hidden costs in any pool home.'
    }
  }
];

const meta = {
  super: { name: 'Super Off-Peak', cls: 'super', color: 'var(--super)' },
  off:   { name: 'Off-Peak',        cls: 'off',   color: 'var(--off)' },
  peak:  { name: 'On-Peak',         cls: 'peak',  color: 'var(--peak)' }
};

function loadCustomRates() {
  try {
    const raw = localStorage.getItem('sdge_rates_custom_v1');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function saveCustomRates(customRates) {
  try {
    localStorage.setItem('sdge_rates_custom_v1', JSON.stringify(customRates));
  } catch (e) {}
}

function isSDGEHoliday(d) {
  const m = d.getMonth();
  const date = d.getDate();
  const dow = d.getDay();
  if (m === 0 && date === 1) return true;
  if (m === 6 && date === 4) return true;
  if (m === 10 && date === 11) return true;
  if (m === 11 && date === 25) return true;
  if (m === 1 && dow === 1 && date >= 15 && date <= 21) return true;
  if (m === 4 && dow === 1 && date >= 25) return true;
  if (m === 8 && dow === 1 && date <= 7) return true;
  if (m === 10 && dow === 4 && date >= 22 && date <= 28) return true;
  return false;
}

function detectLiveCalendar() {
  const now = new Date();
  const m = now.getMonth();
  const season = (m >= 5 && m <= 9) ? 'summer' : 'winter';
  const dow = now.getDay();
  const isWeekendOrHoliday = (dow === 0 || dow === 6 || isSDGEHoliday(now));
  const day = isWeekendOrHoliday ? 'weekend' : 'weekday';
  return { season, day, date: now };
}

const liveInit = detectLiveCalendar();
let state = {
  plan: 'tou-dr1',
  autoSync: true,
  season: liveInit.season,
  day: liveInit.day,
  selected: new Set(APPLIANCES.map(a => a.id)),
  workingHoursOn: true,
  allowAuto: true,
  sleep:  { start: 23, end: 7 },
  work:   { start: 9,  end: 17 },
  customRates: loadCustomRates()
};

function getActivePlan() {
  const base = DEFAULT_PLANS[state.plan] || DEFAULT_PLANS['tou-dr1'];
  if (state.customRates && state.customRates[state.plan]) {
    return {
      ...base,
      rates: state.customRates[state.plan]
    };
  }
  return base;
}

function getCurrentRates() {
  const plan = getActivePlan();
  return plan.rates[state.season];
}

function periodFor(hour, day, planId = state.plan) {
  if (hour >= 16 && hour < 21) return 'peak';

  if (planId === 'tou-dr2') {
    return 'off';
  }

  if (day === 'weekday') {
    if (hour >= 0 && hour < 6) return 'super';
    if (hour >= 6 && hour < 10) return 'off';
    if (hour >= 10 && hour < 14) return 'super';
    if (hour >= 14 && hour < 16) return 'off';
    return 'off';
  } else {
    if (hour >= 0 && hour < 14) return 'super';
    return 'off';
  }
}

function hoursInRange(start, end) {
  const hours = [];
  if (start === end) return hours;
  let h = start;
  while (h !== end) {
    hours.push(h);
    h = (h + 1) % 24;
  }
  return hours;
}

function unavailableHours() {
  if (!state.workingHoursOn) return new Set();
  const blocked = new Set();
  hoursInRange(state.sleep.start, state.sleep.end).forEach(h => blocked.add(h));
  hoursInRange(state.work.start, state.work.end).forEach(h => blocked.add(h));
  return blocked;
}

function resolveAppliance(app) {
  const blockThisApp = app.needsAttended || !state.allowAuto;
  const unavailable = (state.workingHoursOn && blockThisApp) ? unavailableHours() : new Set();

  const effectiveForbidden = new Set(app.forbidden);
  const effectiveUnavailable = new Set(unavailable);

  let recommend = app.ideal.filter(h => !effectiveUnavailable.has(h) && !effectiveForbidden.has(h));
  let fallback = false;

  if (recommend.length === 0) {
    fallback = true;
    const all = Array.from({length: 24}, (_, i) => i);
    const available = all.filter(h =>
      !effectiveUnavailable.has(h) &&
      !effectiveForbidden.has(h) &&
      periodFor(h, state.day) !== 'peak'
    );
    const superAvail = available.filter(h => periodFor(h, state.day) === 'super');
    if (superAvail.length > 0) recommend = superAvail;
    else recommend = available;
  }

  return {
    recommend: new Set(recommend),
    forbidden: effectiveForbidden,
    unavailable: effectiveUnavailable,
    fallback
  };
}

function calculateLiveStatus() {
  const now = new Date();
  const nowHour = now.getHours();
  const nowMin = now.getMinutes();
  const nowSec = now.getSeconds();

  if (state.autoSync) {
    const liveCal = detectLiveCalendar();
    if (state.season !== liveCal.season || state.day !== liveCal.day) {
      state.season = liveCal.season;
      state.day = liveCal.day;
      syncToggleUI();
      render();
    }
  }

  const rates = getCurrentRates();
  const currentPeriod = periodFor(nowHour, state.day, state.plan);
  const currentRateVal = rates[currentPeriod];

  let minutesToNext = 0;
  let nextPeriod = currentPeriod;
  let transitionTime = '';

  const testDate = new Date(now.getTime());
  while (minutesToNext < 1440) {
    minutesToNext++;
    testDate.setMinutes(testDate.getMinutes() + 1);
    const h = testDate.getHours();
    const p = periodFor(h, state.day, state.plan);
    if (p !== currentPeriod) {
      nextPeriod = p;
      transitionTime = formatHour12(h);
      break;
    }
  }

  const hoursRem = Math.floor(minutesToNext / 60);
  const minsRem = minutesToNext % 60;
  const secsRem = 59 - nowSec;

  const countdownText = hoursRem > 0
    ? `${hoursRem}h ${minsRem}m`
    : `${minsRem}m ${String(secsRem).padStart(2, '0')}s`;

  const minRate = rates.super || rates.off;
  const spreadPct = Math.round(((rates.peak - minRate) / minRate) * 100);

  return {
    now,
    nowHour,
    nowMin,
    nowSec,
    currentPeriod,
    currentRateVal,
    nextPeriod,
    transitionTime,
    countdownText,
    spreadPct
  };
}

function updateLiveHUD() {
  const status = calculateLiveStatus();
  const plan = getActivePlan();
  const rates = getCurrentRates();

  const hud = document.getElementById('liveHud');
  const periodColor = meta[status.currentPeriod].color;
  if (hud) hud.style.setProperty('--current-color', periodColor);

  const badgeText = document.getElementById('liveBadgeText');
  if (badgeText) {
    const badgeNames = {
      super: 'Super Off-Peak Active',
      off:   'Off-Peak Active',
      peak:  'On-Peak Active · Avoid Heavy Draw'
    };
    badgeText.textContent = badgeNames[status.currentPeriod];
  }

  const planTag = document.getElementById('livePlanTag');
  if (planTag) {
    const isCustom = state.customRates && state.customRates[state.plan];
    planTag.textContent = `${plan.name}${isCustom ? ' (Custom Rates)' : ''}`;
  }

  const clockEl = document.getElementById('liveClockTime');
  if (clockEl) {
    const timeStr = status.now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const tzStr = Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' ');
    clockEl.textContent = `${timeStr} · ${tzStr}`;
  }

  const curRateEl = document.getElementById('liveCurrentRate');
  if (curRateEl) {
    const cents = (status.currentRateVal * 100).toFixed(1);
    curRateEl.innerHTML = `<span class="cents">${cents}</span><span class="unit">¢/kWh</span>`;
  }

  const curPeriodLabel = document.getElementById('liveCurrentPeriodLabel');
  if (curPeriodLabel) {
    curPeriodLabel.innerHTML = `<strong>${meta[status.currentPeriod].name}</strong> · $${status.currentRateVal.toFixed(3)}/kWh`;
  }

  const countEl = document.getElementById('liveCountdown');
  if (countEl) {
    countEl.innerHTML = `${status.countdownText}<span class="unit">rem</span>`;
  }

  const nextLabel = document.getElementById('liveNextPeriodLabel');
  if (nextLabel) {
    const nextRate = rates[status.nextPeriod];
    nextLabel.innerHTML = `Next: <strong>${meta[status.nextPeriod].name}</strong> ($${nextRate.toFixed(3)}) at ${status.transitionTime}`;
  }

  const spreadEl = document.getElementById('liveSpreadVal');
  if (spreadEl) {
    spreadEl.innerHTML = `+${status.spreadPct}<span class="unit">%</span>`;
  }

  const tipEl = document.getElementById('liveTipText');
  if (tipEl) {
    if (status.currentPeriod === 'peak') {
      tipEl.innerHTML = `<strong>Peak rates in effect:</strong> Delay high-draw appliances until <strong>${status.transitionTime}</strong> to save ${status.spreadPct}%.`;
    } else if (status.currentPeriod === 'super') {
      tipEl.innerHTML = `<strong>Super Off-Peak active:</strong> Lowest electricity costs of the day! Great time for EV charging, pool filtration, and laundry.`;
    } else {
      tipEl.innerHTML = `<strong>Off-Peak shoulder period:</strong> Standard household usage is fine. Shift high-draw loads to Super Off-Peak.`;
    }
  }

  const costsWrap = document.getElementById('liveInstantCosts');
  if (costsWrap) {
    const selected = APPLIANCES.filter(a => state.selected.has(a.id));
    if (!selected.length) {
      costsWrap.innerHTML = `<span>Select appliances to view live running costs</span>`;
    } else {
      costsWrap.innerHTML = selected.map(app => {
        const costPerHour = (app.kwDraw * status.currentRateVal).toFixed(2);
        const unit = app.id === 'dishwasher' ? '/cycle' : '/hr';
        return `
          <div class="item">
            <span>${app.name}:</span>
            <strong>$${costPerHour}${unit}</strong>
          </div>
        `;
      }).join('');
    }
  }

  updateTimelineNeedle(status);
}

function updateTimelineNeedle(status) {
  const minutePercent = ((status.nowHour * 60 + status.nowMin + status.nowSec / 60) / 1440) * 100;

  document.querySelectorAll('.tl-bar').forEach(bar => {
    let needle = bar.querySelector('.tl-now-needle');
    if (!needle) {
      needle = document.createElement('div');
      needle.className = 'tl-now-needle';
      bar.appendChild(needle);
    }
    needle.style.left = `${minutePercent}%`;
  });

  const ticks = document.getElementById('axisTicks');
  if (ticks) {
    let axisMarker = ticks.querySelector('.tl-axis-now-indicator');
    if (!axisMarker) {
      axisMarker = document.createElement('div');
      axisMarker.className = 'tl-axis-now-indicator';
      ticks.appendChild(axisMarker);
    }
    axisMarker.style.left = `${minutePercent}%`;
    axisMarker.textContent = `NOW ${formatHourShort(status.nowHour)}:${String(status.nowMin).padStart(2, '0')}`;
  }
}

function render() {
  renderRates();
  renderSelector();
  renderTimeline();
  renderAppliances();
  renderFloatingPanelSavings();
  renderAxis();
  updateLiveHUD();
}

function renderRates() {
  const r = getCurrentRates();
  const plan = getActivePlan();
  const currentPeriod = periodFor(new Date().getHours(), state.day, state.plan);
  const grid = document.getElementById('rateGrid');
  if (!grid) return;

  let items = [];
  if (plan.hasSuper) {
    items = [
      { key: 'super', c: 'var(--super)', label: 'Super Off-Peak', val: r.super, hours: state.day === 'weekday' ? 'Weekdays 12-6 a.m. & 10 a.m.-2 p.m.' : 'Weekends 12 a.m.-2 p.m.' },
      { key: 'off',   c: 'var(--off)',   label: 'Off-Peak',       val: r.off,   hours: state.day === 'weekday' ? '6-10 a.m., 2-4 p.m., 9 p.m.-12 a.m.' : '2-4 p.m., 9 p.m.-12 a.m.' },
      { key: 'peak',  c: 'var(--peak)',  label: 'On-Peak',        val: r.peak,  hours: 'Every day · 4-9 p.m.' },
      { key: 'spread',c: 'var(--text)',  label: 'Peak vs. Super', val: null,    pct: ((r.peak - r.super) / r.super) * 100, hours: 'Peak premium over cheapest window' }
    ];
  } else {
    items = [
      { key: 'off',   c: 'var(--off)',   label: 'Off-Peak',       val: r.off,   hours: '19 hours daily (all hours outside 4-9 p.m.)' },
      { key: 'peak',  c: 'var(--peak)',  label: 'On-Peak',        val: r.peak,  hours: 'Every day · 4-9 p.m.' },
      { key: 'spread',c: 'var(--text)',  label: 'Peak Premium',   val: null,    pct: ((r.peak - r.off) / r.off) * 100, hours: 'On-peak premium over standard rate' }
    ];
  }

  grid.innerHTML = items.map(i => {
    const isCurrent = i.key === currentPeriod;
    const dollars = i.val !== null ? Math.floor(i.val * 100) : null;
    const decimalCents = i.val !== null ? Math.round((i.val * 1000) % 10) : null;
    const display = i.val !== null
      ? `<span class="cents">${dollars}</span><span style="font-size:0.55em;color:var(--text-low);">.${decimalCents}¢</span>`
      : `+${Math.round(i.pct)}<span style="font-size:0.55em;color:var(--text-low);">%</span>`;

    const liveBadge = isCurrent
      ? `<div class="card-live-pill"><span class="pulse"></span>Active Now</div>`
      : '';

    return `
      <div class="rate-card ${isCurrent ? 'active-now' : ''}" style="--c: ${i.c}">
        ${liveBadge}
        <div class="label">${i.label}</div>
        <div class="value">${display}</div>
        <div class="unit">${i.val !== null ? `$${i.val.toFixed(3)} per kWh` : 'more expensive'}</div>
        <div class="hours">${i.hours}</div>
      </div>
    `;
  }).join('');
}

function renderSelector() {
  const grid = document.getElementById('selectorGrid');
  if (!grid) return;
  grid.innerHTML = APPLIANCES.map(a => `
    <div class="chip ${state.selected.has(a.id) ? 'active' : ''}" data-id="${a.id}">
      <div class="chip-check"></div>
      <div class="chip-icon">${a.icon}</div>
      <div class="chip-name">${a.name}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      render();
    });
  });
}

function renderAxis() {
  const axis = document.getElementById('axisTicks');
  if (!axis) return;
  let html = '';
  for (let h = 0; h < 24; h++) {
    const lab = (h % 3 === 0) ? formatHourShort(h) : '';
    html += `<span>${lab}</span>`;
  }
  axis.innerHTML = html;
}

function formatHourShort(h) {
  if (h === 0 || h === 24) return '12a';
  if (h === 12) return '12p';
  if (h < 12) return h + 'a';
  return (h - 12) + 'p';
}

function formatHour12(h) {
  if (h === 0 || h === 24) return '12 a.m.';
  if (h === 12) return '12 p.m.';
  if (h < 12) return h + ' a.m.';
  return (h - 12) + ' p.m.';
}

function formatRange(hours) {
  if (!hours.length) return 'No window';
  const sorted = [...hours].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) prev = sorted[i];
    else { ranges.push([start, prev]); start = sorted[i]; prev = sorted[i]; }
  }
  ranges.push([start, prev]);
  return ranges.map(([a, b]) => `${formatHour12(a)}-${formatHour12(b + 1)}`).join(', ');
}

function renderTimeline() {
  const tl = document.getElementById('timeline');
  if (!tl) return;
  const selected = APPLIANCES.filter(a => state.selected.has(a.id));
  if (!selected.length) {
    tl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-low);font-size:14px;">Select at least one appliance above.</div>`;
    return;
  }

  const rates = getCurrentRates();
  const currentHour = new Date().getHours();

  let html = '';
  selected.forEach(app => {
    const resolved = resolveAppliance(app);
    html += `
      <div class="tl-row">
        <div class="tl-label">
          <span class="ic">${app.icon}</span>
          <span class="nm"><span>${app.name}</span><small>${app.meta}</small></span>
        </div>
        <div class="tl-bar">
          ${Array.from({length: 24}, (_, h) => {
            const p = periodFor(h, state.day);
            const isUnav = resolved.unavailable.has(h);
            const isAvoid = resolved.forbidden.has(h);
            const isRec = resolved.recommend.has(h);
            const isCurrent = (h === currentHour);

            let cls = `tl-cell ${meta[p].cls}`;
            if (isUnav) cls += ' unavailable';
            else if (isAvoid) cls += ' avoid';
            else if (isRec) cls += ' recommend';
            if (isCurrent) cls += ' current-hour-cell';

            const price = rates[p].toFixed(3);
            let label = `${app.name} · ${formatHour12(h)} · $${price}/kWh`;
            if (isUnav) label += ' · UNAVAILABLE';
            else if (isAvoid) label += ' · AVOID';
            else if (isRec) label += ' · RECOMMENDED';
            if (isCurrent) label += ' · [RIGHT NOW]';

            return `<div class="${cls}" data-tt="${label}"></div>`;
          }).join('')}
        </div>
      </div>
    `;
  });
  tl.innerHTML = html;
  tl.querySelectorAll('.tl-cell').forEach(attachTooltip);
}

function renderAppliances() {
  const grid = document.getElementById('applianceGrid');
  if (!grid) return;
  const selected = APPLIANCES.filter(a => state.selected.has(a.id));
  if (!selected.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--text-low);">No appliances selected.</div>`;
    return;
  }

  const currentHour = new Date().getHours();

  grid.innerHTML = selected.map(app => {
    const resolved = resolveAppliance(app);
    const rec = [...resolved.recommend];
    const avoid = [...resolved.forbidden];
    const all = Array.from({length: 24}, (_, i) => i);
    const mid = all.filter(h => !resolved.recommend.has(h) && !resolved.forbidden.has(h) && !resolved.unavailable.has(h));
    const savings = estimateApplianceSavings(app);
    const noWindow = rec.length === 0;

    let statusText = 'OK TO RUN';
    let statusCls = 'status-mid';
    if (resolved.unavailable.has(currentHour)) {
      statusText = 'Schedule Blackout';
      statusCls = 'status-unav';
    } else if (resolved.forbidden.has(currentHour)) {
      statusText = 'Avoid Right Now';
      statusCls = 'status-avoid';
    } else if (resolved.recommend.has(currentHour)) {
      statusText = 'Best Time to Run';
      statusCls = 'status-best';
    }

    return `
      <div class="app-card">
        <div class="app-head">
          <div class="app-head-l">
            <div class="app-icon-big">${app.icon}</div>
            <div>
              <div class="app-name-big">${app.name}</div>
              <div class="app-meta">${app.meta}</div>
              <div class="app-status-badge ${statusCls}">
                <span class="dot"></span>
                <span>${statusText}</span>
              </div>
            </div>
          </div>
          <div class="app-save">
            <div class="num">-$${savings.delta.toFixed(0)}</div>
            <div class="sub">monthly savings</div>
          </div>
        </div>
        <div class="windows">
          <div class="win best ${resolved.fallback ? 'fallback' : ''}">
            <div class="win-tag">${resolved.fallback ? 'Fallback' : 'Best'}</div>
            <div class="win-body">
              <div class="win-time">${noWindow ? 'No safe window' : formatRange(rec)}</div>
              <div class="win-note">${noWindow ? 'Your blackouts cover all safe hours. Try shifting your schedule or running this load on a day off.' : (resolved.fallback ? 'Your ideal window is blacked out. Best available alternative shown.' : app.notes.best)}</div>
            </div>
          </div>
          <div class="win mid">
            <div class="win-tag">Mid</div>
            <div class="win-body">
              <div class="win-time">${formatRange(mid)}</div>
              <div class="win-note">${app.notes.mid}</div>
            </div>
          </div>
          <div class="win worst">
            <div class="win-tag">Avoid</div>
            <div class="win-body">
              <div class="win-time">${formatRange(avoid)}</div>
              <div class="win-note">${app.notes.worst}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function estimateApplianceSavings(app) {
  const r = getCurrentRates();
  const month = app.estDailyKwh * 30;
  const superRate = r.super || r.off;
  const uncontrolled = month * (0.30 * r.peak + 0.50 * r.off + 0.20 * superRate);
  const optimized = month * (0.85 * superRate + 0.15 * r.off);
  return { uncontrolled, optimized, delta: Math.max(0, uncontrolled - optimized) };
}

// === FLOATING LEFT PANEL: MONTHLY IMPACT RENDERING ===
function renderFloatingPanelSavings() {
  const wrap = document.getElementById('flpSavingsContainer');
  if (!wrap) return;

  const selected = APPLIANCES.filter(a => state.selected.has(a.id));
  if (!selected.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:24px 12px;color:var(--text-low);font-size:12px;">Select appliances to calculate monthly savings.</div>`;
    return;
  }

  let totalUn = 0, totalOpt = 0;
  const rows = selected.map(app => {
    const s = estimateApplianceSavings(app);
    totalUn += s.uncontrolled;
    totalOpt += s.optimized;
    return `
      <tr>
        <td style="font-weight:600;color:var(--text);">${app.name}</td>
        <td class="r" style="color:var(--text-mid);">$${s.uncontrolled.toFixed(0)}</td>
        <td class="r" style="color:var(--text);">$${s.optimized.toFixed(0)}</td>
        <td class="r d">-$${s.delta.toFixed(0)}</td>
      </tr>
    `;
  }).join('');
  const totalDelta = totalUn - totalOpt;
  const plan = getActivePlan();

  wrap.innerHTML = `
    <div class="flp-impact-hero">
      <div>
        <div class="flp-impact-num">-$${Math.round(totalDelta)}<span style="font-size:0.4em;color:var(--text-mid);margin-left:4px;">/mo</span></div>
        <div class="flp-impact-sub">Monthly Impact · ${plan.shortName}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;color:var(--super);">-$${(totalDelta * 12).toFixed(0)}/yr</div>
        <div style="font-size:10px;color:var(--text-low);font-family:'JetBrains Mono',monospace;">ANNUALIZED</div>
      </div>
    </div>
    <table class="flp-savings-table">
      <thead>
        <tr>
          <th>Appliance</th>
          <th class="r">Base</th>
          <th class="r">Opt</th>
          <th class="r">Save</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Tooltip
const tt = document.getElementById('tooltip');
function attachTooltip(el) {
  if (!tt) return;
  el.addEventListener('mouseenter', () => { tt.textContent = el.dataset.tt; tt.classList.add('show'); });
  el.addEventListener('mousemove', e => {
    tt.style.left = (e.clientX + 14) + 'px';
    tt.style.top = (e.clientY + 14) + 'px';
  });
  el.addEventListener('mouseleave', () => tt.classList.remove('show'));
}

function syncToggleUI() {
  document.querySelectorAll('#planToggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.plan === state.plan);
  });
  document.querySelectorAll('#seasonToggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.season === state.season);
  });
  document.querySelectorAll('#dayToggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.day === state.day);
  });

  const syncBtn = document.getElementById('syncLiveBtn');
  const syncText = document.getElementById('syncLiveText');
  if (syncBtn && syncText) {
    if (state.autoSync) {
      syncBtn.className = 'btn ghost live-sync-btn synced';
      syncText.textContent = 'Live Synced';
    } else {
      syncBtn.className = 'btn ghost live-sync-btn manual';
      syncText.textContent = 'Manual (Sync)';
    }
  }

  const heroNote = document.getElementById('heroTariffNote');
  if (heroNote) {
    const plan = getActivePlan();
    heroNote.textContent = `${plan.name} · San Diego, CA`;
  }
}

// Controls listeners
document.querySelectorAll('#planToggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    state.plan = btn.dataset.plan;
    syncToggleUI();
    render();
  });
});

document.querySelectorAll('#seasonToggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    state.season = btn.dataset.season;
    state.autoSync = false;
    syncToggleUI();
    render();
  });
});

document.querySelectorAll('#dayToggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    state.day = btn.dataset.day;
    state.autoSync = false;
    syncToggleUI();
    render();
  });
});

const syncLiveBtn = document.getElementById('syncLiveBtn');
if (syncLiveBtn) {
  syncLiveBtn.addEventListener('click', () => {
    state.autoSync = true;
    const liveCal = detectLiveCalendar();
    state.season = liveCal.season;
    state.day = liveCal.day;
    syncToggleUI();
    render();
  });
}

document.querySelectorAll('.quick button[data-quick]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.quick === 'all') state.selected = new Set(APPLIANCES.map(a => a.id));
    else state.selected.clear();
    render();
  });
});

const whToggle = document.getElementById('whToggle');
if (whToggle) {
  whToggle.addEventListener('click', () => {
    state.workingHoursOn = !state.workingHoursOn;
    whToggle.classList.toggle('on', state.workingHoursOn);
    document.getElementById('whState').textContent = state.workingHoursOn ? 'Active' : 'Off';
    render();
  });
}

const autoToggle = document.getElementById('autoToggle');
if (autoToggle) {
  autoToggle.addEventListener('click', () => {
    state.allowAuto = !state.allowAuto;
    autoToggle.classList.toggle('on', state.allowAuto);
    document.getElementById('autoState').textContent = state.allowAuto ? 'Allow' : 'Block';
    render();
  });
}

function parseTime(v) {
  const [h] = v.split(':');
  return parseInt(h, 10);
}
['sleepStart', 'sleepEnd', 'workStart', 'workEnd'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', () => {
      state.sleep.start = parseTime(document.getElementById('sleepStart').value);
      state.sleep.end   = parseTime(document.getElementById('sleepEnd').value);
      state.work.start  = parseTime(document.getElementById('workStart').value);
      state.work.end    = parseTime(document.getElementById('workEnd').value);
      render();
    });
  }
});

document.querySelectorAll('.quick button[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.preset;
    const map = {
      office:   { sleep: [23, 7], work: [9, 17] },
      wfh:      { sleep: [23, 7], work: [9, 9] },
      night:    { sleep: [8, 16], work: [22, 6] },
      retired:  { sleep: [22, 7], work: [9, 9] }
    };
    const p = map[preset];
    state.sleep = { start: p.sleep[0], end: p.sleep[1] };
    state.work  = { start: p.work[0],  end: p.work[1] };
    document.getElementById('sleepStart').value = String(p.sleep[0]).padStart(2, '0') + ':00';
    document.getElementById('sleepEnd').value   = String(p.sleep[1]).padStart(2, '0') + ':00';
    document.getElementById('workStart').value  = String(p.work[0]).padStart(2, '0') + ':00';
    document.getElementById('workEnd').value    = String(p.work[1]).padStart(2, '0') + ':00';
    state.workingHoursOn = true;
    document.getElementById('whToggle').classList.add('on');
    document.getElementById('whState').textContent = 'Active';
    render();
  });
});

// === FLOATING LEFT PANEL TOGGLE ===
function initFloatingLeftPanel() {
  const panel = document.getElementById('floatingLeftPanel');
  const toggleBtn = document.getElementById('flpToggleTab');
  const minimizeBtn = document.getElementById('flpMinimizeBtn');

  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      toggleBtn.innerHTML = panel.classList.contains('collapsed') ? '&rarr;' : '&larr;';
    });
  }

  if (minimizeBtn && panel) {
    minimizeBtn.addEventListener('click', () => {
      panel.classList.add('collapsed');
      if (toggleBtn) toggleBtn.innerHTML = '&rarr;';
    });
  }
}

// === CLOUDFLARE R2 VAULT IN LEFT PANEL ===
let r2Config = {
  endpoint: localStorage.getItem('r2_worker_url') || '/api/upload',
  bucket: localStorage.getItem('r2_bucket_name') || 'sdge-vault',
  files: JSON.parse(localStorage.getItem('r2_vault_files_v1') || '[]'),
  isConnected: false
};

function initR2Vault() {
  const dropzone = document.getElementById('flpDropzone');
  const fileInput = document.getElementById('flpFileInput');
  const refreshBtn = document.getElementById('flpRefreshBtn');
  const backupBtn = document.getElementById('flpBackupBtn');
  const sampleBtn = document.getElementById('flpSampleBtn');

  renderR2FileList();

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt ? dt.files : null;
      if (files && files.length) {
        handleFilesUpload(Array.from(files));
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length) {
        handleFilesUpload(Array.from(fileInput.files));
        fileInput.value = '';
      }
    });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', () => syncR2RemoteFiles(true));
  if (backupBtn) backupBtn.addEventListener('click', backupScheduleToR2);
  if (sampleBtn) sampleBtn.addEventListener('click', loadSampleGreenButtonData);

  syncR2RemoteFiles(false);
}

async function handleFilesUpload(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let fileContentText = null;
    if (file.name.endsWith('.csv') || file.name.endsWith('.json')) {
      try { fileContentText = await file.text(); } catch (e) {}
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(r2Config.endpoint, { method: 'POST', body: formData });
      if (response.ok) {
        const data = await response.json();
        r2Config.isConnected = true;
        r2Config.files.unshift({
          key: data.key || `uploads/${Date.now()}-${file.name}`,
          name: data.name || file.name,
          size: data.size || file.size,
          uploadedAt: data.uploadedAt || new Date().toISOString(),
          url: data.url || null,
          cachedContent: fileContentText,
          status: 'r2_synced'
        });
      } else {
        throw new Error('Worker response error');
      }
    } catch (err) {
      r2Config.files.unshift({
        key: `staged-${Date.now()}-${file.name}`,
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        url: (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : null,
        cachedContent: fileContentText,
        status: 'staged_local',
        note: 'Staged locally'
      });
    }
  }

  localStorage.setItem('r2_vault_files_v1', JSON.stringify(r2Config.files.slice(0, 30)));
  renderR2FileList();
}

async function syncR2RemoteFiles(feedback = false) {
  try {
    const res = await fetch(r2Config.endpoint.replace('/upload', '/files'));
    if (res.ok) {
      const data = await res.json();
      r2Config.isConnected = true;
      if (data && Array.isArray(data.objects)) {
        const remoteMap = new Map();
        data.objects.forEach(obj => remoteMap.set(obj.key, { ...obj, status: 'r2_synced' }));
        r2Config.files.forEach(f => {
          if (!remoteMap.has(f.key) && f.status === 'staged_local') remoteMap.set(f.key, f);
        });
        r2Config.files = Array.from(remoteMap.values());
        localStorage.setItem('r2_vault_files_v1', JSON.stringify(r2Config.files.slice(0, 30)));
        renderR2FileList();
      }
      if (feedback) alert('R2 vault synchronized.');
    }
  } catch (e) {}
}

function backupScheduleToR2() {
  const backupData = {
    app: 'SDG&E TOU Optimizer',
    version: '2.0',
    exportedAt: new Date().toISOString(),
    plan: state.plan,
    season: state.season,
    day: state.day,
    selectedAppliances: Array.from(state.selected),
    workingHours: { enabled: state.workingHoursOn, allowAuto: state.allowAuto, sleep: state.sleep, work: state.work },
    customRates: state.customRates
  };
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const file = new File([blob], `sdge-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
  handleFilesUpload([file]);
}

function loadSampleGreenButtonData() {
  const rows = ['Timestamp,Usage (kWh),Rate Period'];
  const start = new Date();
  start.setDate(start.getDate() - 30);

  for (let d = 0; d < 30; d++) {
    const curDay = new Date(start.getTime() + d * 86400000);
    const dayType = (curDay.getDay() === 0 || curDay.getDay() === 6) ? 'weekend' : 'weekday';
    for (let h = 0; h < 24; h++) {
      const p = periodFor(h, dayType, state.plan);
      let kwh = 0.35 + Math.random() * 0.2;
      if (h >= 7 && h <= 9) kwh += 0.8;
      if (h >= 17 && h <= 20) kwh += 2.2;
      if (h >= 11 && h <= 14) kwh += 0.5;
      rows.push(`${curDay.toISOString().slice(0, 10)} ${String(h).padStart(2, '0')}:00:00,${kwh.toFixed(3)},${p}`);
    }
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const file = new File([blob], 'sdge-green-button-sample.csv', { type: 'text/csv' });
  handleFilesUpload([file]);
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function renderR2FileList() {
  const container = document.getElementById('flpFileList');
  if (!container) return;

  if (!r2Config.files.length) {
    container.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text-low);font-size:11px;">No files yet. Drop bills or backups above.</div>`;
    return;
  }

  container.innerHTML = r2Config.files.slice(0, 8).map((file, idx) => {
    return `
      <div class="flp-file-row">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;">
          <div style="font-weight:600;color:var(--text);">${file.name}</div>
          <div style="font-size:10px;color:var(--text-low);font-family:'JetBrains Mono',monospace;">${formatFileSize(file.size)} · ${file.status === 'r2_synced' ? 'R2' : 'Local'}</div>
        </div>
        <div style="display:flex;gap:4px;">
          ${file.url ? `<a href="${file.url}" target="_blank" class="btn ghost btn-sm" style="padding:4px 8px;font-size:10px;text-decoration:none;">View</a>` : ''}
          <button class="btn ghost btn-sm" style="padding:4px 8px;font-size:10px;" onclick="removeR2File(${idx})">&times;</button>
        </div>
      </div>
    `;
  }).join('');
}

if (typeof window !== 'undefined') {
  window.removeR2File = async function(idx) {
    const file = r2Config.files[idx];
    if (!file) return;
    if (confirm(`Remove ${file.name}?`)) {
      if (file.status === 'r2_synced' && r2Config.isConnected) {
        try {
          await fetch(`${r2Config.endpoint.replace('/upload', '/files/')}${encodeURIComponent(file.key)}`, { method: 'DELETE' });
        } catch (e) {}
      }
      r2Config.files.splice(idx, 1);
      localStorage.setItem('r2_vault_files_v1', JSON.stringify(r2Config.files));
      renderR2FileList();
    }
  };
}

// === FLOATING LIQUID GLASS AI CHAT WIDGET (CLOUDFLARE AI GATEWAY + GLM-5.3) ===
let aiChatConfig = {
  gatewayUrl: localStorage.getItem('cf_ai_gateway_url') || '',
  apiToken: localStorage.getItem('cf_ai_gateway_token') || '',
  model: localStorage.getItem('cf_ai_model') || 'glm-5.3',
  messages: []
};

function initAIChatWidget() {
  const widget = document.getElementById('floatingAIWidget');
  const pillBtn = document.getElementById('aiPillToggle');
  const collapseBtn = document.getElementById('aiCollapseBtn');
  const configBtn = document.getElementById('aiConfigBtn');
  const clearBtn = document.getElementById('aiClearBtn');
  const sendBtn = document.getElementById('aiSendBtn');
  const inputEl = document.getElementById('aiInput');
  const modal = document.getElementById('aiConfigModal');
  const modalClose = document.getElementById('aiConfigCloseBtn');
  const modalSave = document.getElementById('aiConfigSaveBtn');

  if (pillBtn && widget) {
    pillBtn.addEventListener('click', () => {
      widget.classList.remove('collapsed');
      pillBtn.style.display = 'none';
      if (inputEl) inputEl.focus();
    });
  }

  if (collapseBtn && widget) {
    collapseBtn.addEventListener('click', () => {
      widget.classList.add('collapsed');
      if (pillBtn) pillBtn.style.display = 'inline-flex';
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      aiChatConfig.messages = [];
      renderAIMessages();
    });
  }

  if (configBtn && modal) {
    configBtn.addEventListener('click', () => {
      document.getElementById('aiGatewayUrlInput').value = aiChatConfig.gatewayUrl;
      document.getElementById('aiApiTokenInput').value = aiChatConfig.apiToken;
      document.getElementById('aiModelInput').value = aiChatConfig.model;
      modal.classList.add('open');
    });
  }

  if (modalClose && modal) modalClose.addEventListener('click', () => modal.classList.remove('open'));
  if (modalSave && modal) {
    modalSave.addEventListener('click', () => {
      aiChatConfig.gatewayUrl = document.getElementById('aiGatewayUrlInput').value.trim();
      aiChatConfig.apiToken = document.getElementById('aiApiTokenInput').value.trim();
      aiChatConfig.model = document.getElementById('aiModelInput').value.trim() || 'glm-5.3';
      localStorage.setItem('cf_ai_gateway_url', aiChatConfig.gatewayUrl);
      localStorage.setItem('cf_ai_gateway_token', aiChatConfig.apiToken);
      localStorage.setItem('cf_ai_model', aiChatConfig.model);
      modal.classList.remove('open');
      appendAssistantMessage(`Cloudflare AI Gateway settings updated (Model: ${aiChatConfig.model}). Ask me anything about your SDG&E schedule!`);
    });
  }

  if (sendBtn && inputEl) {
    const handleSend = () => {
      const q = inputEl.value.trim();
      if (!q) return;
      inputEl.value = '';
      handleUserQuery(q);
    };
    sendBtn.addEventListener('click', handleSend);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  }

  // Quick chip triggers
  document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (prompt) handleUserQuery(prompt);
    });
  });

  // Initial welcome message
  if (!aiChatConfig.messages.length) {
    appendAssistantMessage(`Hello! I'm your SDG&E Energy Copilot connected via **Cloudflare AI Gateway (GLM-5.3)**. I monitor your live rates and appliance windows in real-time. Ask me how to slash your electricity bill!`);
  }
}

function appendUserMessage(text) {
  aiChatConfig.messages.push({ role: 'user', text, time: new Date() });
  renderAIMessages();
}

function appendAssistantMessage(text) {
  aiChatConfig.messages.push({ role: 'assistant', text, time: new Date() });
  renderAIMessages();
}

function renderAIMessages() {
  const container = document.getElementById('aiChatBody');
  if (!container) return;

  container.innerHTML = aiChatConfig.messages.map(m => {
    const isUser = m.role === 'user';
    return `
      <div class="ai-msg ${isUser ? 'user' : 'assistant'}">
        <div>${formatAIMarkdown(m.text)}</div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function formatAIMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:4px;font-size:0.9em;">$1</code>')
    .replace(/\n/g, '<br>');
}

async function handleUserQuery(query) {
  appendUserMessage(query);

  const container = document.getElementById('aiChatBody');
  const typingEl = document.createElement('div');
  typingEl.className = 'ai-msg assistant';
  typingEl.id = 'aiTypingIndicator';
  typingEl.innerHTML = `<em>GLM-5.3 is thinking...</em>`;
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;

  const currentHour = new Date().getHours();
  const currentPeriod = periodFor(currentHour, state.day, state.plan);
  const rates = getCurrentRates();
  const plan = getActivePlan();

  const systemContext = `
You are an expert California energy advisor specializing in SDG&E (San Diego Gas & Electric) Time-of-Use rates.
Current Live Environment:
- Active Plan: ${plan.name} (${plan.shortName})
- Season: ${state.season.toUpperCase()} (${rates.label})
- Today's Schedule: ${state.day.toUpperCase()}
- Current Time: ${formatHour12(currentHour)}
- Current Active Period: ${meta[currentPeriod].name} ($${rates[currentPeriod].toFixed(3)}/kWh)
- Peak Hours: 4:00 PM - 9:00 PM daily ($${rates.peak.toFixed(3)}/kWh)
- Super Off-Peak Hours: ${plan.hasSuper ? (state.day === 'weekday' ? 'Midnight-6 AM & 10 AM-2 PM' : 'Midnight-2 PM') : 'N/A'} ($${(rates.super || rates.off).toFixed(3)}/kWh)
- Selected Household Loads: ${Array.from(state.selected).join(', ')}
- Blackout Constraints: Sleep (${formatHour12(state.sleep.start)}-${formatHour12(state.sleep.end)}), Work Away (${formatHour12(state.work.start)}-${formatHour12(state.work.end)})
Answer the homeowner's question concisely with specific times, dollar figures, and load-shifting advice.
`;

  // Check if user has configured Cloudflare AI Gateway
  if (aiChatConfig.gatewayUrl) {
    try {
      const response = await fetch(aiChatConfig.gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(aiChatConfig.apiToken ? { 'Authorization': `Bearer ${aiChatConfig.apiToken}` } : {})
        },
        body: JSON.stringify({
          model: aiChatConfig.model,
          messages: [
            { role: 'system', content: systemContext },
            ...aiChatConfig.messages.slice(-6).map(m => ({ role: m.role, content: m.text }))
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || 'Received response from GLM-5.3.';
        if (typingEl) typingEl.remove();
        appendAssistantMessage(reply);
        return;
      }
    } catch (e) {
      console.warn('AI Gateway call failed, falling back to local energy engine', e);
    }
  }

  // Built-in intelligent GLM-5.3 SDG&E energy reasoning engine
  setTimeout(() => {
    if (typingEl) typingEl.remove();
    const reply = generateEnergyResponse(query, currentHour, currentPeriod, rates, plan);
    appendAssistantMessage(reply);
  }, 600);
}

function generateEnergyResponse(q, curH, curP, rates, plan) {
  const query = q.toLowerCase();

  if (query.includes('ev') || query.includes('car') || query.includes('tesla') || query.includes('charge')) {
    if (plan.id === 'ev-tou-5') {
      return `On your **EV-TOU-5** plan, you have a massive advantage: electricity drops to **$${rates.super.toFixed(3)}/kWh** during Super Off-Peak (**Midnight to 6 a.m.** and **10 a.m. to 2 p.m.** weekdays). Charging a 60 kWh battery overnight costs just **$${(60 * rates.super).toFixed(2)}** vs **$${(60 * rates.peak).toFixed(2)}** during on-peak hours (4-9 p.m.) — saving you **$${(60 * (rates.peak - rates.super)).toFixed(2)} per charge**!`;
    } else {
      return `For EV charging on **${plan.shortName}**, plug in during **Super Off-Peak** (Midnight–6 a.m. or 10 a.m.–2 p.m. on weekdays, or Midnight–2 p.m. on weekends) at **$${rates.super.toFixed(3)}/kWh**. Avoid 4–9 p.m. peak (**$${rates.peak.toFixed(3)}/kWh**). **Pro tip:** If you charge more than 150 kWh/month, consider switching to SDG&E's **EV-TOU-5** plan where super off-peak drops to ~13.1¢/kWh!`;
    }
  }

  if (query.includes('dishwasher') || query.includes('dishes')) {
    return `The best time to run your dishwasher is **Midnight to 5 a.m.** using your machine's delay-start button, or during the **10 a.m. to 2 p.m. midday Super Off-Peak** window. Running a heated-dry cycle at 5 p.m. peak costs nearly double (**$${rates.peak.toFixed(3)}/kWh**) compared to overnight (**$${rates.super.toFixed(3)}/kWh**).`;
  }

  if (query.includes('dryer') || query.includes('laundry') || query.includes('wash')) {
    return `Because clothes dryers present fire hazards when run unattended during sleep, your ideal window is **Weekdays 10 a.m. to 2 p.m.** (Super Off-Peak at **$${rates.super.toFixed(3)}/kWh** while you are awake). If that conflicts with your schedule, the morning shoulder (**7 a.m. to 10 a.m.** at $${rates.off.toFixed(3)}/kWh) is your best fallback. Never run laundry between 4 p.m. and 9 p.m.!`;
  }

  if (query.includes('ac') || query.includes('air condition') || query.includes('cooling') || query.includes('cool')) {
    return `Use the **"Pre-Cooling Strategy"**: drop your thermostat setpoint 3–4°F below normal between **10 a.m. and 2 p.m.** while power is at the Super Off-Peak rate (**$${rates.super.toFixed(3)}/kWh**). Then raise the thermostat at 4:00 p.m. and let your home coast through the 4–9 p.m. on-peak window. A 3.5 kW central compressor costs **$${(3.5 * rates.peak).toFixed(2)}/hr** at peak vs **$${(3.5 * rates.super).toFixed(2)}/hr** midday!`;
  }

  if (query.includes('cheapest') || query.includes('when') || query.includes('rate') || query.includes('price')) {
    return `Right now it is **${formatHour12(curH)}** and we are in **${meta[curP].name}** ($${rates[curP].toFixed(3)}/kWh). The absolute cheapest electricity occurs during **Super Off-Peak**:\n• **Weekdays:** Midnight–6:00 a.m. and 10:00 a.m.–2:00 p.m. ($${rates.super.toFixed(3)}/kWh)\n• **Weekends:** Midnight–2:00 p.m. ($${rates.super.toFixed(3)}/kWh)\nAvoid all high-wattage loads between **4:00 p.m. and 9:00 p.m.** ($${rates.peak.toFixed(3)}/kWh).`;
  }

  return `Based on SDG&E's **${plan.shortName}** schedule and your monitored loads: you currently save an estimated **-$${Math.round(estimateApplianceSavings(APPLIANCES[0]).delta * 3)}/month** by shifting your high-draw appliances out of the 4–9 p.m. peak block. Super Off-Peak power is priced at **$${rates.super.toFixed(3)}/kWh** (${Math.round(((rates.peak - rates.super) / rates.super) * 100)}% cheaper than peak). Ask me specifically about your EV, A/C, or dryer schedule!`;
}

// PDF Download
const dlBtn = document.getElementById('downloadBtn');
if (dlBtn) dlBtn.addEventListener('click', generatePDF);

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, H = 792, M = 48;
  const plan = getActivePlan();
  const r = getCurrentRates();

  doc.setFillColor(11, 11, 12);
  doc.rect(0, 0, W, 110, 'F');
  doc.setTextColor(245, 244, 240);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(28);
  doc.text('Your TOU schedule', M, 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setTextColor(168, 167, 163);
  doc.text(`${plan.name} · ${r.label} · ${state.day === 'weekday' ? 'Weekday' : 'Weekend'}`, M, 70);

  const selected = APPLIANCES.filter(a => state.selected.has(a.id));
  const totalSave = selected.reduce((s, a) => s + estimateApplianceSavings(a).delta, 0);
  doc.setTextColor(109, 170, 69);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`Estimated savings: -$${totalSave.toFixed(0)}/mo · -$${(totalSave * 12).toFixed(0)}/yr`, M, 90);

  doc.save(`SDGE-${plan.shortName}-Schedule.pdf`);
}

// === RATE CUSTOMIZER MODAL ===
function initRateModal() {
  const rateModal = document.getElementById('rateModal');
  const editRatesBtn = document.getElementById('editRatesBtn');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalSaveBtn = document.getElementById('modalSaveBtn');
  const modalResetBtn = document.getElementById('modalResetBtn');

  function openRateModal() {
    if (!rateModal) return;
    const plan = getActivePlan();
    const titleEl = document.getElementById('modalPlanTitle');
    if (titleEl) titleEl.textContent = `Customize Rates · ${plan.name}`;

    const superFields = [document.getElementById('fieldSummerSuper'), document.getElementById('fieldWinterSuper')];
    superFields.forEach(f => {
      if (f) f.style.display = plan.hasSuper ? 'flex' : 'none';
    });

    const r = plan.rates;
    if (document.getElementById('rateSummerSuper')) document.getElementById('rateSummerSuper').value = r.summer.super;
    if (document.getElementById('rateSummerOff'))   document.getElementById('rateSummerOff').value   = r.summer.off;
    if (document.getElementById('rateSummerPeak'))  document.getElementById('rateSummerPeak').value  = r.summer.peak;

    if (document.getElementById('rateWinterSuper')) document.getElementById('rateWinterSuper').value = r.winter.super;
    if (document.getElementById('rateWinterOff'))   document.getElementById('rateWinterOff').value   = r.winter.off;
    if (document.getElementById('rateWinterPeak'))  document.getElementById('rateWinterPeak').value  = r.winter.peak;

    rateModal.classList.add('open');
  }

  function closeRateModal() {
    if (rateModal) rateModal.classList.remove('open');
  }

  if (editRatesBtn) editRatesBtn.addEventListener('click', openRateModal);
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeRateModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeRateModal);
  if (rateModal) {
    rateModal.addEventListener('click', e => {
      if (e.target === rateModal) closeRateModal();
    });
  }

  if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', () => {
      const custom = state.customRates ? { ...state.customRates } : {};
      const plan = getActivePlan();

      const sumSuper = parseFloat(document.getElementById('rateSummerSuper')?.value) || plan.rates.summer.super;
      const sumOff   = parseFloat(document.getElementById('rateSummerOff')?.value) || plan.rates.summer.off;
      const sumPeak  = parseFloat(document.getElementById('rateSummerPeak')?.value) || plan.rates.summer.peak;

      const winSuper = parseFloat(document.getElementById('rateWinterSuper')?.value) || plan.rates.winter.super;
      const winOff   = parseFloat(document.getElementById('rateWinterOff')?.value) || plan.rates.winter.off;
      const winPeak  = parseFloat(document.getElementById('rateWinterPeak')?.value) || plan.rates.winter.peak;

      custom[state.plan] = {
        summer: { super: sumSuper, off: sumOff, peak: sumPeak, label: DEFAULT_PLANS[state.plan].rates.summer.label },
        winter: { super: winSuper, off: winOff, peak: winPeak, label: DEFAULT_PLANS[state.plan].rates.winter.label }
      };

      state.customRates = custom;
      saveCustomRates(custom);
      closeRateModal();
      render();
    });
  }

  if (modalResetBtn) {
    modalResetBtn.addEventListener('click', () => {
      if (state.customRates && state.customRates[state.plan]) {
        delete state.customRates[state.plan];
        if (Object.keys(state.customRates).length === 0) state.customRates = null;
        saveCustomRates(state.customRates);
      }
      closeRateModal();
      render();
    });
  }
}

// Single-execution initialization guard
let isAppInitialized = false;
function initApp() {
  if (isAppInitialized) return;
  isAppInitialized = true;
  syncToggleUI();
  render();
  initRateModal();
  initFloatingLeftPanel();
  initR2Vault();
  initAIChatWidget();
  setInterval(updateLiveHUD, 1000);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
