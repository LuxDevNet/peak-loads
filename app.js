// SDG&E TOU Optimizer & Live Rates
// Real-time time-of-use tracking, dynamic pricing, and appliance load optimization.

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

// === APPLIANCES ===
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

// === STORAGE & CUSTOM RATES ===
function loadCustomRates() {
  try {
    const raw = localStorage.getItem('sdge_rates_custom_v1');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed reading custom rates from localStorage', e);
  }
  return null;
}

function saveCustomRates(customRates) {
  try {
    localStorage.setItem('sdge_rates_custom_v1', JSON.stringify(customRates));
  } catch (e) {
    console.warn('Failed saving custom rates to localStorage', e);
  }
}

// === HOLIDAYS & CALENDAR ===
function isSDGEHoliday(d) {
  const m = d.getMonth();
  const date = d.getDate();
  const dow = d.getDay(); // 0 Sun, 1 Mon ...

  // Fixed holidays
  if (m === 0 && date === 1) return true; // New Year's Day
  if (m === 6 && date === 4) return true; // Independence Day
  if (m === 10 && date === 11) return true; // Veterans Day
  if (m === 11 && date === 25) return true; // Christmas Day

  // Floating holidays
  if (m === 1 && dow === 1 && date >= 15 && date <= 21) return true; // Presidents' Day (3rd Mon in Feb)
  if (m === 4 && dow === 1 && date >= 25) return true; // Memorial Day (last Mon in May)
  if (m === 8 && dow === 1 && date <= 7) return true; // Labor Day (1st Mon in Sep)
  if (m === 10 && dow === 4 && date >= 22 && date <= 28) return true; // Thanksgiving (4th Thu in Nov)

  return false;
}

function detectLiveCalendar() {
  const now = new Date();
  const m = now.getMonth();
  // Summer: June 1 to October 31 (months 5,6,7,8,9)
  const season = (m >= 5 && m <= 9) ? 'summer' : 'winter';
  const dow = now.getDay();
  const isWeekendOrHoliday = (dow === 0 || dow === 6 || isSDGEHoliday(now));
  const day = isWeekendOrHoliday ? 'weekend' : 'weekday';
  return { season, day, date: now };
}

// === APPLICATION STATE ===
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

// Determines the period ('super', 'off', 'peak') for an hour (0..23)
function periodFor(hour, day, planId = state.plan) {
  if (hour >= 16 && hour < 21) return 'peak';

  if (planId === 'tou-dr2') {
    return 'off'; // TOU-DR2 is a 2-period plan (no super off-peak)
  }

  // TOU-DR1 and EV-TOU-5:
  if (day === 'weekday') {
    if (hour >= 0 && hour < 6) return 'super';
    if (hour >= 6 && hour < 10) return 'off';
    if (hour >= 10 && hour < 14) return 'super'; // Extended daytime super off-peak
    if (hour >= 14 && hour < 16) return 'off';
    return 'off';
  } else {
    // Weekend / Holiday: midnight to 2 p.m. is super off-peak
    if (hour >= 0 && hour < 14) return 'super';
    return 'off';
  }
}

// === HOUR UTILITIES ===
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

// Returns the resolved set of hours for an appliance given user blackouts
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

// === LIVE RATE STATUS ENGINE ===
function calculateLiveStatus() {
  const now = new Date();
  const nowHour = now.getHours();
  const nowMin = now.getMinutes();
  const nowSec = now.getSeconds();

  // If live auto-sync is on, sync season & day
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

  // Calculate countdown to next period transition
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

  // Spread
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

  // Live HUD container accent color
  const hud = document.getElementById('liveHud');
  const periodColor = meta[status.currentPeriod].color;
  if (hud) hud.style.setProperty('--current-color', periodColor);

  // Badge text
  const badgeText = document.getElementById('liveBadgeText');
  if (badgeText) {
    const badgeNames = {
      super: 'Super Off-Peak Active',
      off:   'Off-Peak Active',
      peak:  'On-Peak Active · Avoid Heavy Draw'
    };
    badgeText.textContent = badgeNames[status.currentPeriod];
  }

  // Plan tag
  const planTag = document.getElementById('livePlanTag');
  if (planTag) {
    const isCustom = state.customRates && state.customRates[state.plan];
    planTag.textContent = `${plan.name}${isCustom ? ' (Custom Rates)' : ''}`;
  }

  // Live clock
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

  // Current rate value
  const curRateEl = document.getElementById('liveCurrentRate');
  if (curRateEl) {
    const cents = (status.currentRateVal * 100).toFixed(1);
    curRateEl.innerHTML = `<span class="cents">${cents}</span><span class="unit">¢/kWh</span>`;
  }

  // Current period label
  const curPeriodLabel = document.getElementById('liveCurrentPeriodLabel');
  if (curPeriodLabel) {
    curPeriodLabel.innerHTML = `<strong>${meta[status.currentPeriod].name}</strong> · $${status.currentRateVal.toFixed(3)}/kWh`;
  }

  // Countdown value & next label
  const countEl = document.getElementById('liveCountdown');
  if (countEl) {
    countEl.innerHTML = `${status.countdownText}<span class="unit">rem</span>`;
  }

  const nextLabel = document.getElementById('liveNextPeriodLabel');
  if (nextLabel) {
    const nextRate = rates[status.nextPeriod];
    nextLabel.innerHTML = `Next: <strong>${meta[status.nextPeriod].name}</strong> ($${nextRate.toFixed(3)}) at ${status.transitionTime}`;
  }

  // Spread
  const spreadEl = document.getElementById('liveSpreadVal');
  if (spreadEl) {
    spreadEl.innerHTML = `+${status.spreadPct}<span class="unit">%</span>`;
  }

  // Actionable tip
  const tipEl = document.getElementById('liveTipText');
  if (tipEl) {
    if (status.currentPeriod === 'peak') {
      tipEl.innerHTML = `<strong>Peak rates in effect:</strong> Delay high-draw appliances (dryer, dishwasher, EV charging) until <strong>${status.transitionTime}</strong> to save ${status.spreadPct}%.`;
    } else if (status.currentPeriod === 'super') {
      tipEl.innerHTML = `<strong>Super Off-Peak active:</strong> Lowest electricity costs of the day! Great time for EV charging, pool filtration, running the dryer, or pre-cooling.`;
    } else {
      tipEl.innerHTML = `<strong>Off-Peak shoulder period:</strong> Standard household usage is fine. For maximum savings, schedule heavy loads for Super Off-Peak (${plan.hasSuper ? (state.day === 'weekday' ? '12-6 a.m. & 10 a.m.-2 p.m.' : '12-2 p.m.') : 'off-peak'}).`;
    }
  }

  // Live instant running costs for selected appliances
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

  // Update needle on timeline
  updateTimelineNeedle(status);
}

function updateTimelineNeedle(status) {
  const minutePercent = ((status.nowHour * 60 + status.nowMin + status.nowSec / 60) / 1440) * 100;

  // Needles inside bars
  document.querySelectorAll('.tl-bar').forEach(bar => {
    let needle = bar.querySelector('.tl-now-needle');
    if (!needle) {
      needle = document.createElement('div');
      needle.className = 'tl-now-needle';
      bar.appendChild(needle);
    }
    needle.style.left = `${minutePercent}%`;
  });

  // Needle indicator on ticks
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

// === RENDER FUNCTIONS ===
function render() {
  renderRates();
  renderSelector();
  renderTimeline();
  renderAppliances();
  renderSavings();
  renderAxis();
  updateLiveHUD();
}

function renderRates() {
  const r = getCurrentRates();
  const plan = getActivePlan();
  const currentPeriod = periodFor(new Date().getHours(), state.day, state.plan);
  const grid = document.getElementById('rateGrid');

  let items = [];
  if (plan.hasSuper) {
    items = [
      { key: 'super', c: 'var(--super)', label: 'Super Off-Peak', val: r.super, hours: state.day === 'weekday' ? 'Weekdays 12-6 a.m. & 10 a.m.-2 p.m.' : 'Weekends 12 a.m.-2 p.m.' },
      { key: 'off',   c: 'var(--off)',   label: 'Off-Peak',       val: r.off,   hours: state.day === 'weekday' ? '6-10 a.m., 2-4 p.m., 9 p.m.-12 a.m.' : '2-4 p.m., 9 p.m.-12 a.m.' },
      { key: 'peak',  c: 'var(--peak)',  label: 'On-Peak',        val: r.peak,  hours: 'Every day · 4-9 p.m.' },
      { key: 'spread',c: 'var(--text)',  label: 'Peak vs. Super', val: null,    pct: ((r.peak - r.super) / r.super) * 100, hours: 'Peak premium over cheapest window' }
    ];
  } else {
    // 2-tier plan (TOU-DR2)
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
            if (isUnav) label += ' · UNAVAILABLE (your schedule)';
            else if (isAvoid) label += ' · AVOID (peak / high wear)';
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

    // Determine current live status for this appliance
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
              <div class="win-note">${noWindow ? 'Your blackouts cover all safe hours. Try shifting your schedule or running this load on a day off.' : (resolved.fallback ? 'Your ideal window is blacked out. Best available alternative shown - still cheaper than peak.' : app.notes.best)}</div>
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
  // Uncontrolled baseline: 30% peak, 50% off, 20% super
  const uncontrolled = month * (0.30 * r.peak + 0.50 * r.off + 0.20 * superRate);
  // Optimized schedule: 85% super, 15% off, 0% peak
  const optimized = month * (0.85 * superRate + 0.15 * r.off);
  return { uncontrolled, optimized, delta: Math.max(0, uncontrolled - optimized) };
}

function renderSavings() {
  const wrap = document.getElementById('savings');
  const selected = APPLIANCES.filter(a => state.selected.has(a.id));
  if (!selected.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-low);">Select appliances above to see savings.</div>`;
    return;
  }

  let totalUn = 0, totalOpt = 0;
  const rows = selected.map(app => {
    const s = estimateApplianceSavings(app);
    totalUn += s.uncontrolled;
    totalOpt += s.optimized;
    return `
      <tr>
        <td class="name">${app.name}</td>
        <td class="r">$${s.uncontrolled.toFixed(2)}</td>
        <td class="r">$${s.optimized.toFixed(2)}</td>
        <td class="r d">-$${s.delta.toFixed(2)}</td>
      </tr>
    `;
  }).join('');
  const totalDelta = totalUn - totalOpt;
  const plan = getActivePlan();

  wrap.innerHTML = `
    <div class="savings-hero">
      <div>
        <div class="savings-num"><span class="sm">-$</span>${Math.round(totalDelta)}</div>
        <div class="savings-label">Per month · ${plan.shortName} · ${plan.rates[state.season].label}</div>
      </div>
      <div class="savings-side">
        <div class="row"><span class="k">Uncontrolled</span><span class="v">$${totalUn.toFixed(0)}</span></div>
        <div class="row"><span class="k">Optimized</span><span class="v">$${totalOpt.toFixed(0)}</span></div>
        <div class="row"><span class="k">Annualized</span><span class="v" style="color:var(--super);">-$${(totalDelta * 12).toFixed(0)}</span></div>
      </div>
    </div>
    <table class="savings-table">
      <thead>
        <tr>
          <th>Appliance</th>
          <th class="r">Uncontrolled</th>
          <th class="r">Optimized</th>
          <th class="r">Monthly Savings</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// === TOOLTIP ===
const tt = document.getElementById('tooltip');
function attachTooltip(el) {
  el.addEventListener('mouseenter', () => { tt.textContent = el.dataset.tt; tt.classList.add('show'); });
  el.addEventListener('mousemove', e => {
    tt.style.left = (e.clientX + 14) + 'px';
    tt.style.top = (e.clientY + 14) + 'px';
  });
  el.addEventListener('mouseleave', () => tt.classList.remove('show'));
}

// === CONTROLS & INTERACTION ===
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

// Plan selection
document.querySelectorAll('#planToggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    state.plan = btn.dataset.plan;
    syncToggleUI();
    render();
  });
});

// Season toggle
document.querySelectorAll('#seasonToggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    state.season = btn.dataset.season;
    state.autoSync = false;
    syncToggleUI();
    render();
  });
});

// Day toggle
document.querySelectorAll('#dayToggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    state.day = btn.dataset.day;
    state.autoSync = false;
    syncToggleUI();
    render();
  });
});

// Live Sync button
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

// Quick select buttons
document.querySelectorAll('.quick button[data-quick]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.quick === 'all') state.selected = new Set(APPLIANCES.map(a => a.id));
    else state.selected.clear();
    render();
  });
});

// Working hours toggle
document.getElementById('whToggle').addEventListener('click', () => {
  state.workingHoursOn = !state.workingHoursOn;
  const el = document.getElementById('whToggle');
  el.classList.toggle('on', state.workingHoursOn);
  document.getElementById('whState').textContent = state.workingHoursOn ? 'Active' : 'Off';
  render();
});

// Auto-loads toggle
document.getElementById('autoToggle').addEventListener('click', () => {
  state.allowAuto = !state.allowAuto;
  const el = document.getElementById('autoToggle');
  el.classList.toggle('on', state.allowAuto);
  document.getElementById('autoState').textContent = state.allowAuto ? 'Allow' : 'Block';
  render();
});

// Time inputs
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

// Schedule presets
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

// === RATE CUSTOMIZER MODAL ===
const rateModal = document.getElementById('rateModal');
const editRatesBtn = document.getElementById('editRatesBtn');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalSaveBtn = document.getElementById('modalSaveBtn');
const modalResetBtn = document.getElementById('modalResetBtn');

function openRateModal() {
  const plan = getActivePlan();
  document.getElementById('modalPlanTitle').textContent = `Customize Rates · ${plan.name}`;

  const superFields = [document.getElementById('fieldSummerSuper'), document.getElementById('fieldWinterSuper')];
  superFields.forEach(f => {
    if (f) f.style.display = plan.hasSuper ? 'flex' : 'none';
  });

  const r = plan.rates;
  document.getElementById('rateSummerSuper').value = r.summer.super;
  document.getElementById('rateSummerOff').value   = r.summer.off;
  document.getElementById('rateSummerPeak').value  = r.summer.peak;

  document.getElementById('rateWinterSuper').value = r.winter.super;
  document.getElementById('rateWinterOff').value   = r.winter.off;
  document.getElementById('rateWinterPeak').value  = r.winter.peak;

  rateModal.classList.add('open');
}

function closeRateModal() {
  rateModal.classList.remove('open');
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

    const sumSuper = parseFloat(document.getElementById('rateSummerSuper').value) || plan.rates.summer.super;
    const sumOff   = parseFloat(document.getElementById('rateSummerOff').value) || plan.rates.summer.off;
    const sumPeak  = parseFloat(document.getElementById('rateSummerPeak').value) || plan.rates.summer.peak;

    const winSuper = parseFloat(document.getElementById('rateWinterSuper').value) || plan.rates.winter.super;
    const winOff   = parseFloat(document.getElementById('rateWinterOff').value) || plan.rates.winter.off;
    const winPeak  = parseFloat(document.getElementById('rateWinterPeak').value) || plan.rates.winter.peak;

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

// === PDF DOWNLOAD ===
document.getElementById('downloadBtn').addEventListener('click', generatePDF);

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, H = 792, M = 48;
  let y = M;

  const SUPER = [109, 170, 69];
  const OFF   = [232, 175, 52];
  const PEAK  = [221, 105, 116];
  const DARK  = [11, 11, 12];
  const TEXT  = [40, 40, 45];
  const DIM   = [120, 120, 128];

  const plan = getActivePlan();
  const r = getCurrentRates();

  // Hero header
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 110, 'F');
  doc.setTextColor(245, 244, 240);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(28);
  doc.text('Your TOU schedule', M, 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setTextColor(168, 167, 163);
  doc.text(`${plan.name}  ·  ${r.label}  ·  ${state.day === 'weekday' ? 'Weekday' : 'Weekend'} schedule`, M, 70);
  doc.setTextColor(109, 170, 69);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);

  const selected = APPLIANCES.filter(a => state.selected.has(a.id));
  const totalSave = selected.reduce((s, a) => s + estimateApplianceSavings(a).delta, 0);
  doc.text(`Estimated savings: -$${totalSave.toFixed(0)}/mo  ·  -$${(totalSave * 12).toFixed(0)}/yr`, M, 90);

  y = 140;

  // Rate strip
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`Active Rates · ${plan.shortName}`, M, y);
  y += 14;

  const numCards = plan.hasSuper ? 3 : 2;
  const cardW = (W - M * 2 - (numCards - 1) * 12) / numCards;

  const drawRateCard = (x, color, label, val, hours) => {
    doc.setFillColor(248, 248, 246);
    doc.setDrawColor(220, 220, 215);
    doc.roundedRect(x, y, cardW, 64, 8, 8, 'FD');
    doc.setFillColor(...color);
    doc.rect(x + 12, y + 12, 4, 16, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...DIM);
    doc.text(label.toUpperCase(), x + 22, y + 22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...TEXT);
    doc.text(`$${val.toFixed(3)}`, x + 22, y + 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...DIM);
    doc.text(hours, x + 22, y + 56, { maxWidth: cardW - 30 });
  };

  if (plan.hasSuper) {
    drawRateCard(M, SUPER, 'Super Off-Peak', r.super, '12-6 a.m. + 10 a.m.-2 p.m.');
    drawRateCard(M + cardW + 12, OFF, 'Off-Peak', r.off, '6-10 a.m., 2-4 p.m., 9 p.m.-12 a.m.');
    drawRateCard(M + (cardW + 12) * 2, PEAK, 'On-Peak', r.peak, 'Every day 4-9 p.m.');
  } else {
    drawRateCard(M, OFF, 'Off-Peak', r.off, 'All hours except 4-9 p.m.');
    drawRateCard(M + cardW + 12, PEAK, 'On-Peak', r.peak, 'Every day 4-9 p.m.');
  }
  y += 84;

  // Working hours summary
  if (state.workingHoursOn) {
    doc.setFillColor(244, 246, 244);
    doc.roundedRect(M, y, W - M * 2, 36, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...TEXT);
    doc.text('YOUR BLACKOUT WINDOWS', M + 14, y + 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DIM);
    doc.text(`Sleep: ${formatHour12(state.sleep.start)} - ${formatHour12(state.sleep.end)}   ·   Away: ${formatHour12(state.work.start)} - ${formatHour12(state.work.end)}`, M + 14, y + 28);
    y += 50;
  }

  // Appliance schedule cards
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...TEXT);
  doc.text('Recommended operating windows', M, y);
  y += 22;

  selected.forEach(app => {
    if (y > H - 140) { doc.addPage(); y = M; }
    const resolved = resolveAppliance(app);
    const rec = [...resolved.recommend];
    const avoid = [...resolved.forbidden];
    const all = Array.from({length: 24}, (_, i) => i);
    const mid = all.filter(h => !resolved.recommend.has(h) && !resolved.forbidden.has(h) && !resolved.unavailable.has(h));
    const sav = estimateApplianceSavings(app);

    doc.setFillColor(250, 250, 248);
    doc.setDrawColor(220, 220, 215);
    doc.roundedRect(M, y, W - M * 2, 130, 10, 10, 'FD');

    // Name
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...TEXT);
    doc.text(app.name, M + 16, y + 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...DIM);
    doc.text(app.meta, M + 16, y + 34);

    // Savings badge
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...SUPER);
    const saveText = `-$${sav.delta.toFixed(0)}/mo`;
    const stw = doc.getTextWidth(saveText);
    doc.text(saveText, W - M - 16 - stw, y + 22);

    // Best / Mid / Avoid rows
    drawPillRow(doc, M + 16, y + 54, 'BEST',  SUPER, rec.length ? `Run: ${formatRange(rec)}` : 'No window - widen your schedule', W - M * 2 - 32);
    drawPillRow(doc, M + 16, y + 78, 'MID',   OFF,   `OK: ${formatRange(mid)}`, W - M * 2 - 32);
    drawPillRow(doc, M + 16, y + 102, 'AVOID', PEAK, formatRange(avoid), W - M * 2 - 32);

    y += 144;
  });

  // Action checklist
  if (y > H - 200) { doc.addPage(); y = M; } else { y += 8; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...TEXT);
  doc.text('Quick action checklist', M, y);
  y += 22;

  const actions = [];
  selected.forEach(app => {
    actions.push(`${app.name}: ${app.notes.best}`);
  });
  actions.push(`Confirm you are on ${plan.shortName} at sdge.com.`);
  actions.push('Review next bill - check the "Time of Use" usage chart to verify the load shifting worked.');

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TEXT);
  actions.forEach(a => {
    if (y > H - 50) { doc.addPage(); y = M; }
    doc.setDrawColor(...TEXT); doc.setLineWidth(0.7);
    doc.rect(M, y - 9, 10, 10);
    const wrapped = doc.splitTextToSize(a, W - M * 2 - 22);
    doc.text(wrapped, M + 18, y);
    y += wrapped.length * 12 + 8;
  });

  // Footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...DIM);
    doc.text(`Generated ${new Date().toLocaleDateString()} · ${plan.name} · sdge.com · ${i}/${totalPages}`, M, H - 22);
  }

  doc.save(`SDGE-${plan.shortName}-Schedule.pdf`);
}

function drawPillRow(doc, x, y, label, color, text, maxWidth) {
  doc.setDrawColor(40, 40, 45); doc.setLineWidth(0.6);
  doc.rect(x, y - 8, 10, 10);
  doc.setFillColor(...color);
  doc.roundedRect(x + 18, y - 8, 48, 11, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
  const w = doc.getTextWidth(label);
  doc.text(label, x + 18 + (48 - w) / 2, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 40, 45);
  doc.text(text, x + 72, y, { maxWidth: maxWidth - 80 });
}

// Initial render
syncToggleUI();
render();

// Real-time ticking loop every 1 second
setInterval(updateLiveHUD, 1000);
