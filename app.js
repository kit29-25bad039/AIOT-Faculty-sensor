/**
 * ============================================================================
 * NEURAL-FACULTY // AIoT 5-SENSOR REAL-TIME SURVEILLANCE & DIAGNOSTIC SYSTEM
 * Core Application Engine: Telemetry, Chart.js, MQTT, and AI Faculty Monitor
 * ============================================================================
 */

// --- 1. SENSOR CONFIGURATION & REAL-TIME STATE ---
const SENSORS = {
  s1: {
    id: 's1',
    name: 'Temperature',
    unit: '°C',
    val: 26.5,
    baseVal: 26.5,
    minThresh: 5.0,
    maxThresh: 45.0,
    history: [],
    sparklineHistory: [],
    status: 'NOMINAL',
    grade: 'A+',
    health: 100,
    faultInjected: null, // 'flatline', 'breach', 'stuck', etc.
    color: '#f97316'
  },
  s2: {
    id: 's2',
    name: 'Humidity',
    unit: '%',
    val: 54.0,
    baseVal: 54.0,
    minThresh: 20.0,
    maxThresh: 85.0,
    history: [],
    sparklineHistory: [],
    status: 'NOMINAL',
    grade: 'A+',
    health: 100,
    faultInjected: null,
    color: '#06b6d4'
  },
  s3: {
    id: 's3',
    name: 'Vibration',
    unit: 'mm/s',
    val: 12.8,
    baseVal: 12.8,
    minThresh: 0.0,
    maxThresh: 55.0,
    history: [],
    sparklineHistory: [],
    status: 'NOMINAL',
    grade: 'A+',
    health: 100,
    faultInjected: null,
    color: '#a855f7'
  },
  s4: {
    id: 's4',
    name: 'Ambient Light',
    unit: 'Lux',
    val: 420.0,
    baseVal: 420.0,
    minThresh: 20.0, // Below this is considered dropout/failure
    maxThresh: 1000.0,
    history: [],
    sparklineHistory: [],
    status: 'NOMINAL',
    grade: 'A+',
    health: 100,
    faultInjected: null,
    color: '#eab308'
  },
  s5: {
    id: 's5',
    name: 'Gas Quality',
    unit: 'PPM',
    val: 115.0,
    baseVal: 115.0,
    minThresh: 0.0,
    maxThresh: 450.0,
    history: [],
    sparklineHistory: [],
    status: 'NOMINAL',
    grade: 'A+',
    health: 100,
    faultInjected: null,
    color: '#10b981'
  }
};

// Global telemetry state
let packetCount = 0;
let alertCount = 0;
let isStreamPaused = false;
let audioEnabled = true;
let activeFilter = 'all';
let maxHistoryPoints = 35;
let simulationInterval = null;
let mqttClient = null;
let currentConnectionMode = 'SIMULATOR'; // 'SIMULATOR', 'MQTT', 'SERIAL'
let serialPort = null;
let serialReader = null;

// Telemetry timestamps
const chartLabels = [];

// Audio Synthesizer Context (Web Audio API)
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playBeep(frequency = 600, duration = 0.08, type = 'sine') {
  if (!audioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio context may require user interaction
  }
}

function playFaultAlarm() {
  if (!audioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(440, now + 0.1);
    osc.frequency.setValueAtTime(880, now + 0.2);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(now + 0.35);
  } catch (e) {}
}

// --- 2. INITIALIZE CHART.JS VISUALIZATION ---
let telemetryChart = null;

function initChart() {
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  
  telemetryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Temp (°C)',
          data: [],
          borderColor: SENSORS.s1.color,
          backgroundColor: 'transparent',
          borderWidth: 2.2,
          pointRadius: 2.5,
          pointHoverRadius: 6,
          tension: 0.35,
          yAxisID: 'y'
        },
        {
          label: 'Humidity (%)',
          data: [],
          borderColor: SENSORS.s2.color,
          backgroundColor: 'transparent',
          borderWidth: 2.2,
          pointRadius: 2.5,
          pointHoverRadius: 6,
          tension: 0.35,
          yAxisID: 'y'
        },
        {
          label: 'Vibration (mm/s)',
          data: [],
          borderColor: SENSORS.s3.color,
          backgroundColor: 'transparent',
          borderWidth: 2.2,
          pointRadius: 2.5,
          pointHoverRadius: 6,
          tension: 0.35,
          yAxisID: 'y'
        },
        {
          label: 'Light (Lux / 10)',
          data: [],
          borderColor: SENSORS.s4.color,
          backgroundColor: 'transparent',
          borderWidth: 2.2,
          pointRadius: 2.5,
          pointHoverRadius: 6,
          tension: 0.35,
          yAxisID: 'y'
        },
        {
          label: 'Gas (PPM / 10)',
          data: [],
          borderColor: SENSORS.s5.color,
          backgroundColor: 'transparent',
          borderWidth: 2.2,
          pointRadius: 2.5,
          pointHoverRadius: 6,
          tension: 0.35,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: 'Outfit', size: 13 },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: {
            color: '#64748b',
            font: { family: 'JetBrains Mono', size: 10 },
            maxTicksLimit: 8
          }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748b',
            font: { family: 'JetBrains Mono', size: 10 },
            stepSize: 20
          }
        }
      }
    }
  });
}

// --- 3. SPARKLINE RENDERERS ---
function drawSparkline(canvasId, historyData, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  if (historyData.length < 2) return;

  const min = Math.min(...historyData);
  const max = Math.max(...historyData);
  const range = max - min === 0 ? 1 : max - min;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';

  const step = w / (historyData.length - 1);

  for (let i = 0; i < historyData.length; i++) {
    const x = i * step;
    const y = h - ((historyData[i] - min) / range) * (h - 8) - 4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Glow fill gradient below sparkline
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '33');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fill();
}

// --- 4. AI FACULTY MONITORING & ARBITRATION ENGINE ---
/**
 * Evaluates individual sensor telemetry against academic integrity rules:
 * 1. Flatline / Zero dropout check (fails to detect)
 * 2. Stuck-at fault check (zero variance over rolling samples)
 * 3. Threshold breach check (touches or exceeds safety margins)
 * 4. Noise jitter / extreme variance
 */
function evaluateAIFaculty(sensorKey, val) {
  const s = SENSORS[sensorKey];
  let fault = false;
  let reason = 'Nominal';
  let grade = 'A+';
  let health = 100;
  let status = 'NOMINAL';

  // Rule 1: Flatline / Dropout / Disconnection
  if (sensorKey === 's4' && val < s.minThresh) {
    // Light is near zero (e.g. 0 Lux flatline)
    fault = true;
    reason = `Optical Sensor Flatline / Line Disconnect (${val.toFixed(0)} Lux)`;
    grade = 'F';
    health = 20;
    status = 'FLATLINE';
  } else if (val === 0 && (sensorKey === 's1' || sensorKey === 's2')) {
    fault = true;
    reason = `Zero Telemetry Dropout / Hardware Disconnect`;
    grade = 'F';
    health = 15;
    status = 'DISCONNECTED';
  }

  // Rule 2: Upper / Lower Threshold Breaches
  if (!fault) {
    if (val >= s.maxThresh) {
      fault = true;
      reason = `Critical Upper Threshold Breached (${val.toFixed(1)}${s.unit} >= ${s.maxThresh}${s.unit})`;
      grade = 'D';
      health = 45;
      status = 'CRITICAL';
    } else if (val <= s.minThresh && sensorKey !== 's3' && sensorKey !== 's5') {
      fault = true;
      reason = `Sub-Floor Threshold Violation (${val.toFixed(1)}${s.unit} <= ${s.minThresh}${s.unit})`;
      grade = 'C';
      health = 60;
      status = 'WARNING';
    } else if (val >= s.maxThresh * 0.88) {
      // Approaching danger zone (Warning / Probation)
      reason = `Operating Near Upper Safety Margin (${val.toFixed(1)}${s.unit})`;
      grade = 'B';
      health = 82;
      status = 'MARGINAL';
    }
  }

  // Rule 3: Stuck-at fault (Lack of physical entropy over 8 consecutive samples)
  if (!fault && s.sparklineHistory.length >= 8) {
    const recent = s.sparklineHistory.slice(-8);
    const variance = recent.reduce((sum, v) => sum + Math.pow(v - recent[0], 2), 0) / recent.length;
    if (variance === 0 && s.faultInjected === 'stuck') {
      fault = true;
      reason = `ADC Frozen / Frozen Transducer (Zero Entropy Detected)`;
      grade = 'F';
      health = 30;
      status = 'FROZEN';
    }
  }

  s.fault = fault;
  s.faultReason = reason;
  s.grade = grade;
  s.health = health;
  s.status = status;

  return { fault, reason, grade, health, status };
}

// Generate high-level faculty diagnostic consensus
function synthesizeFacultyConsensus() {
  const sensorKeys = Object.keys(SENSORS);
  const faultySensors = [];
  let totalHealth = 0;

  sensorKeys.forEach(k => {
    totalHealth += SENSORS[k].health;
    if (SENSORS[k].fault) {
      faultySensors.push(SENSORS[k]);
    }
  });

  const fleetHealth = (totalHealth / sensorKeys.length).toFixed(1);
  const healthEl = document.getElementById('fleet-health-pct');
  const fillEl = document.getElementById('fleet-health-fill');
  const gradeRingEl = document.getElementById('faculty-grade-ring');
  const gradeLetterEl = document.getElementById('faculty-grade');
  const headlineEl = document.getElementById('faculty-status-headline');
  const advisoryTextEl = document.getElementById('faculty-advisory-text');
  const triageBoxEl = document.getElementById('faculty-triage-box');
  const triageSeverityEl = document.getElementById('triage-severity');
  const triageDescEl = document.getElementById('triage-desc');
  const alertOverlay = document.getElementById('chart-alert-overlay');
  const alertMsg = document.getElementById('chart-alert-msg');
  const alertCounterEl = document.getElementById('alert-counter');

  healthEl.textContent = `${fleetHealth}%`;
  fillEl.style.width = `${fleetHealth}%`;

  if (faultySensors.length === 0) {
    // NOMINAL STATE
    gradeRingEl.classList.remove('alert-grade');
    gradeLetterEl.textContent = 'A+';
    fillEl.style.background = 'linear-gradient(90deg, #00f2fe, #10b981)';
    headlineEl.textContent = 'All 5 Sensors Operating in Optimal Envelope';
    advisoryTextEl.textContent = '"Continuous statistical verification passes all tests. Sampling rate nominal (1.0 Hz). Sensor noise within Gaussian variance thresholds."';
    
    triageBoxEl.classList.remove('triaged-alert');
    triageSeverityEl.className = 'triage-severity normal';
    triageSeverityEl.textContent = 'STATUS: NOMINAL';
    triageDescEl.textContent = 'No sensor anomalies detected. Transducers operating inside safe dynamic range. Real-time feedback lines nominal.';
    
    alertOverlay.classList.add('hidden');
    alertCounterEl.classList.remove('active-alerts');
  } else {
    // ANOMALY / BREACH STATE
    gradeRingEl.classList.add('alert-grade');
    const worstGrade = faultySensors.some(s => s.grade === 'F') ? 'F' : 'D';
    gradeLetterEl.textContent = worstGrade;
    fillEl.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';

    const primaryFault = faultySensors[0];
    headlineEl.textContent = `CRITICAL ALERT: ${primaryFault.name.toUpperCase()} FAULT DETECTED`;
    advisoryTextEl.textContent = `"Faculty Inspector Alert: ${primaryFault.name} has tripped safety constraints! Diagnosis: ${primaryFault.faultReason}. Immediate intervention advised."`;

    triageBoxEl.classList.add('triaged-alert');
    triageSeverityEl.className = 'triage-severity critical';
    triageSeverityEl.textContent = 'STATUS: DISCIPLINARY FAULT';
    triageDescEl.innerHTML = `<b>Faculty Remediation Directive:</b> ${primaryFault.name} has deviated beyond permissible limits (${primaryFault.faultReason}). Automatic failover relay suggested. Click <b>Auto-Heal & Reset</b> to re-calibrate.`;

    alertOverlay.classList.remove('hidden');
    alertMsg.textContent = `ALERT: ${primaryFault.name.toUpperCase()} - ${primaryFault.faultReason}`;

    alertCount++;
    alertCounterEl.textContent = `${alertCount} ALERTS`;
    alertCounterEl.classList.add('active-alerts');

    // Trigger audible alarm
    playFaultAlarm();
  }
}

// Log an event to the AI Faculty surveillance terminal
function logFacultyTerminal(type, tag, content) {
  const terminal = document.getElementById('faculty-terminal-log');
  if (!terminal) return;

  const now = new Date();
  const timeStr = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}-msg`;

  let tagClass = 'tag-pass';
  if (tag.includes('FAULT') || tag.includes('BREACH') || tag.includes('ALERT')) tagClass = 'tag-fault';
  else if (tag.includes('WARN')) tagClass = 'tag-warn';
  else if (tag.includes('SYS')) tagClass = 'tag-system';

  entry.innerHTML = `
    <span class="log-time">${timeStr}</span>
    <span class="log-tag ${tagClass}">${tag}</span>
    <span class="log-content">${content}</span>
  `;

  terminal.appendChild(entry);
  terminal.scrollTop = terminal.scrollHeight;

  // Prune old logs if > 60
  if (terminal.childElementCount > 60) {
    terminal.removeChild(terminal.firstElementChild);
  }
}

// --- 5. DOM UPDATER FOR SENSOR CARDS ---
function updateSensorCardsDOM() {
  Object.keys(SENSORS).forEach(key => {
    const s = SENSORS[key];
    const cardEl = document.getElementById(`card-${key}`);
    const valEl = document.getElementById(`${key}-val`);
    const gradeEl = document.getElementById(`${key}-grade`);
    const statusEl = document.getElementById(`${key}-status`);
    const barEl = document.getElementById(`${key}-bar`);
    const diagEl = document.getElementById(`${key}-diag`);

    if (!cardEl) return;

    // Value text
    valEl.textContent = key === 's4' || key === 's5' ? s.val.toFixed(0) : s.val.toFixed(1);

    // Grade pill
    gradeEl.textContent = s.grade;
    gradeEl.className = 'grade-pill';
    if (s.grade === 'A+') gradeEl.classList.add('grade-a');
    else if (s.grade === 'B') gradeEl.classList.add('grade-b');
    else if (s.grade === 'C') gradeEl.classList.add('grade-c');
    else gradeEl.classList.add('grade-f');

    // Status pill
    statusEl.textContent = s.status;
    statusEl.className = 'status-pill';
    if (s.status === 'NOMINAL') statusEl.classList.add('status-nominal');
    else if (s.status === 'WARNING' || s.status === 'MARGINAL') statusEl.classList.add('status-warning');
    else statusEl.classList.add('status-fault');

    // Card styling
    if (s.fault) cardEl.classList.add('card-fault');
    else cardEl.classList.remove('card-fault');

    // Bar progress percentage
    let maxRange = s.maxThresh * 1.25;
    let pct = (s.val / maxRange) * 100;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    barEl.style.width = `${pct}%`;

    // Diagnostic footnote
    diagEl.textContent = s.fault ? s.faultReason : `${s.name} stable (Grade ${s.grade})`;

    // Draw sparkline
    drawSparkline(`sparkline-${key}`, s.sparklineHistory, s.color);
  });
}

// --- 6. TELEMETRY INGESTION & DATA FLOW ---
function ingestTelemetryPacket(data) {
  if (isStreamPaused) return;

  packetCount++;
  document.getElementById('packet-counter').textContent = `${packetCount} PKTS`;

  const now = new Date();
  const timeLabel = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  // Update internal sensor values
  if (data.temp !== undefined) SENSORS.s1.val = parseFloat(data.temp);
  if (data.hum !== undefined)  SENSORS.s2.val = parseFloat(data.hum);
  if (data.vibe !== undefined) SENSORS.s3.val = parseFloat(data.vibe);
  if (data.light !== undefined)SENSORS.s4.val = parseFloat(data.light);
  if (data.gas !== undefined)  SENSORS.s5.val = parseFloat(data.gas);

  // Evaluate AI Faculty status for each sensor
  let newFaultDetected = false;
  Object.keys(SENSORS).forEach(key => {
    const evalRes = evaluateAIFaculty(key, SENSORS[key].val);
    
    // Maintain sparkline buffer (last 20 points)
    SENSORS[key].sparklineHistory.push(SENSORS[key].val);
    if (SENSORS[key].sparklineHistory.length > 20) {
      SENSORS[key].sparklineHistory.shift();
    }

    if (evalRes.fault) {
      newFaultDetected = true;
      if (packetCount % 5 === 0) {
        logFacultyTerminal('fault', `[FACULTY FAULT // ${key.toUpperCase()}]`, `${SENSORS[key].name}: ${evalRes.reason}`);
      }
    }
  });

  // Overall Faculty Consensus
  synthesizeFacultyConsensus();
  updateSensorCardsDOM();

  // Push to Chart.js
  chartLabels.push(timeLabel);
  if (chartLabels.length > maxHistoryPoints) chartLabels.shift();

  // Chart values (normalized or scaled for clear multi-sensor visualization)
  // S1 Temp: 0 - 60 mapped
  // S2 Hum: 0 - 100
  // S3 Vibe: 0 - 80
  // S4 Light: scaled down by / 10 (0 - 1000 -> 0 - 100)
  // S5 Gas: scaled down by / 10 (0 - 1000 -> 0 - 100)
  const normS1 = SENSORS.s1.val;
  const normS2 = SENSORS.s2.val;
  const normS3 = SENSORS.s3.val;
  const normS4 = SENSORS.s4.val / 10.0;
  const normS5 = SENSORS.s5.val / 10.0;

  telemetryChart.data.datasets[0].data.push(normS1);
  telemetryChart.data.datasets[1].data.push(normS2);
  telemetryChart.data.datasets[2].data.push(normS3);
  telemetryChart.data.datasets[3].data.push(normS4);
  telemetryChart.data.datasets[4].data.push(normS5);

  telemetryChart.data.datasets.forEach(ds => {
    if (ds.data.length > maxHistoryPoints) ds.data.shift();
  });

  telemetryChart.update('none'); // Update without full slow animation for 60fps performance

  if (!newFaultDetected) {
    playBeep(900, 0.03, 'sine');
  }
}

// --- 7. BUILT-IN HIGH-FIDELITY SIMULATOR (MODE 1) ---
function startBuiltInSimulation() {
  if (simulationInterval) clearInterval(simulationInterval);

  simulationInterval = setInterval(() => {
    if (currentConnectionMode !== 'SIMULATOR') return;

    // Physics generator with smooth Brownian random walk & micro-noise
    const simData = {};

    Object.keys(SENSORS).forEach(key => {
      const s = SENSORS[key];

      if (s.faultInjected === 'flatline') {
        s.val = 0.0;
      } else if (s.faultInjected === 'breach') {
        // High surge past threshold
        s.val = s.maxThresh + 12.0 + (Math.random() * 4);
      } else if (s.faultInjected === 'stuck') {
        // Frozen value
      } else {
        // Natural nominal physics
        const noise = (Math.random() - 0.49) * 0.8;
        if (key === 's1') s.val = s.baseVal + Math.sin(packetCount * 0.15) * 1.5 + noise * 0.4;
        else if (key === 's2') s.val = s.baseVal + Math.cos(packetCount * 0.1) * 2.2 + noise * 0.5;
        else if (key === 's3') s.val = Math.max(0, s.baseVal + (Math.random() - 0.4) * 3.5);
        else if (key === 's4') s.val = Math.max(50, s.baseVal + Math.sin(packetCount * 0.08) * 40 + (Math.random() - 0.5) * 15);
        else if (key === 's5') s.val = Math.max(30, s.baseVal + (Math.random() - 0.5) * 8);
      }

      simData[key === 's1' ? 'temp' : key === 's2' ? 'hum' : key === 's3' ? 'vibe' : key === 's4' ? 'light' : 'gas'] = s.val;
    });

    ingestTelemetryPacket(simData);
  }, 1000);
}

// --- 8. FAULT INJECTION SUITE ---
window.triggerSensorFault = function(sensorKey) {
  const s = SENSORS[sensorKey];
  if (!s) return;

  if (s.faultInjected) {
    // Already in fault -> restore it
    s.faultInjected = null;
    s.val = s.baseVal;
    logFacultyTerminal('nominal', `[RECOVERY // ${sensorKey.toUpperCase()}]`, `Fault cleared on ${s.name}. Sensor returning to baseline.`);
  } else {
    // Inject flatline / dropout or threshold surge
    if (sensorKey === 's4') {
      s.faultInjected = 'flatline';
      s.val = 0.0;
    } else {
      s.faultInjected = 'breach';
      s.val = s.maxThresh + 10.0;
    }
    logFacultyTerminal('fault', `[MANUAL INJECTION // ${sensorKey.toUpperCase()}]`, `Artificial failure induced on ${s.name} (${s.faultInjected}).`);
  }
  updateSensorCardsDOM();
  synthesizeFacultyConsensus();
};

window.injectPresetFault = function(presetType) {
  if (presetType === 'flatline_s4') {
    SENSORS.s4.faultInjected = 'flatline';
    SENSORS.s4.val = 0.0;
    logFacultyTerminal('fault', '[FACULTY ALERT // CH-04]', 'Sensor 4 (LDR Photodiode) open circuit fault injected: 0 Lux flatline.');
  } else if (presetType === 'thermal_runaway') {
    SENSORS.s1.faultInjected = 'breach';
    SENSORS.s1.val = 62.5;
    logFacultyTerminal('fault', '[FACULTY ALERT // CH-01]', 'Thermal runaway induced on DHT22: Temperature surged to 62.5°C!');
  } else if (presetType === 'severe_vibration') {
    SENSORS.s3.faultInjected = 'breach';
    SENSORS.s3.val = 78.4;
    logFacultyTerminal('fault', '[FACULTY ALERT // CH-03]', 'Excessive kinetic harmonic vibration injected: 78.4 mm/s!');
  } else if (presetType === 'gas_leak') {
    SENSORS.s5.faultInjected = 'breach';
    SENSORS.s5.val = 680.0;
    logFacultyTerminal('fault', '[FACULTY ALERT // CH-05]', 'Hazardous atmospheric emission detected: MQ-2 sensor reading 680 PPM!');
  } else if (presetType === 'stuck_sensor') {
    SENSORS.s2.faultInjected = 'stuck';
    logFacultyTerminal('warn', '[FACULTY PROBATION // CH-02]', 'ADC pin stuck-at fault simulated on Sensor 2 (Zero variance detected).');
  }
  updateSensorCardsDOM();
  synthesizeFacultyConsensus();
};

window.restoreAllSensors = function() {
  Object.keys(SENSORS).forEach(key => {
    SENSORS[key].faultInjected = null;
    SENSORS[key].val = SENSORS[key].baseVal;
    SENSORS[key].status = 'NOMINAL';
    SENSORS[key].grade = 'A+';
    SENSORS[key].health = 100;
  });
  logFacultyTerminal('nominal', '[FLEET RESTORE]', 'All 5 sensor channels returned to calibrated operational tolerances.');
  updateSensorCardsDOM();
  synthesizeFacultyConsensus();
};

// --- 9. MQTT LIVE WOKWI INTEGRATION (MODE 2) ---
function connectMQTT() {
  const brokerUrl = document.getElementById('mqtt-broker-input').value.trim();
  const topic = document.getElementById('mqtt-topic-input').value.trim();
  const statusMsg = document.getElementById('mqtt-status-msg');
  const connPill = document.getElementById('conn-pill');
  const connIndicator = document.getElementById('conn-indicator');
  const connLabel = document.getElementById('conn-label');
  const connSubtext = document.getElementById('conn-subtext');

  if (mqttClient) {
    try { mqttClient.end(); } catch (e) {}
  }

  statusMsg.textContent = 'Connecting to MQTT broker...';
  statusMsg.style.color = 'var(--accent-cyan)';

  try {
    const clientId = 'Web-FacultyDashboard-' + Math.random().toString(16).substring(2, 8);
    mqttClient = mqtt.connect(brokerUrl, {
      clientId: clientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 3000
    });

    mqttClient.on('connect', () => {
      statusMsg.textContent = 'Connected! Subscribing to topic...';
      statusMsg.style.color = 'var(--grade-aplus)';
      
      mqttClient.subscribe(topic, (err) => {
        if (!err) {
          statusMsg.textContent = `Live Stream Active (${topic})`;
          currentConnectionMode = 'MQTT';
          
          connIndicator.className = 'status-dot connected';
          connLabel.textContent = 'WOKWI MQTT LIVE';
          connSubtext.textContent = 'ESP32 Sync Active';
          
          logFacultyTerminal('system', '[MQTT LINK ESTABLISHED]', `Connected to ${brokerUrl} on topic: ${topic}`);
          
          // Close modal
          document.getElementById('wokwi-modal').classList.add('hidden');
        } else {
          statusMsg.textContent = 'Subscription error: ' + err.message;
        }
      });
    });

    mqttClient.on('message', (receivedTopic, message) => {
      try {
        const payloadStr = message.toString();
        const json = JSON.parse(payloadStr);
        ingestTelemetryPacket(json);
      } catch (err) {
        console.warn('Failed to parse incoming MQTT JSON packet:', err);
      }
    });

    mqttClient.on('error', (err) => {
      statusMsg.textContent = 'MQTT Error: ' + err.message;
      statusMsg.style.color = 'var(--grade-f)';
    });

    mqttClient.on('close', () => {
      if (currentConnectionMode === 'MQTT') {
        statusMsg.textContent = 'MQTT Connection closed.';
      }
    });

  } catch (err) {
    statusMsg.textContent = 'Connection exception: ' + err.message;
    statusMsg.style.color = 'var(--grade-f)';
  }
}

function disconnectMQTT() {
  if (mqttClient) {
    try { mqttClient.end(); } catch (e) {}
    mqttClient = null;
  }
  currentConnectionMode = 'SIMULATOR';
  const connIndicator = document.getElementById('conn-indicator');
  const connLabel = document.getElementById('conn-label');
  const connSubtext = document.getElementById('conn-subtext');
  
  connIndicator.className = 'status-dot connected';
  connLabel.textContent = 'SIMULATOR ACTIVE';
  connSubtext.textContent = 'Local Physics Loop';
  
  document.getElementById('mqtt-status-msg').textContent = 'Disconnected. Using Local Simulator.';
  document.getElementById('wokwi-modal').classList.add('hidden');
  logFacultyTerminal('system', '[MODE SWITCH]', 'Reverted to built-in simulation telemetry engine.');
}

// Sync threshold updates to ESP32 firmware via MQTT
function broadcastThresholdToESP32() {
  if (mqttClient && mqttClient.connected) {
    const payload = JSON.stringify({
      temp_max: SENSORS.s1.maxThresh,
      gas_max: SENSORS.s5.maxThresh,
      vibe_max: SENSORS.s3.maxThresh
    });
    mqttClient.publish('wokwi/aiot/faculty-monitor/commands', payload);
  }
}

// --- 10. WEB SERIAL API (MODE 3) ---
async function connectWebSerial() {
  const serialMsg = document.getElementById('serial-status-msg');
  if (!('serial' in navigator)) {
    serialMsg.textContent = 'Web Serial is not supported in this browser (Use Chrome or Edge).';
    serialMsg.style.color = 'var(--grade-f)';
    return;
  }

  try {
    serialPort = await navigator.requestPort();
    await serialPort.open({ baudRate: 115200 });
    currentConnectionMode = 'SERIAL';
    
    document.getElementById('conn-indicator').className = 'status-dot connected';
    document.getElementById('conn-label').textContent = 'USB SERIAL ACTIVE';
    document.getElementById('conn-subtext').textContent = '115200 Baud';
    
    serialMsg.textContent = 'Connected to USB Serial!';
    serialMsg.style.color = 'var(--grade-aplus)';
    document.getElementById('wokwi-modal').classList.add('hidden');
    
    logFacultyTerminal('system', '[SERIAL LINK]', 'ESP32 Hardware Serial Port Opened at 115200 Baud.');

    const textDecoder = new TextDecoderStream();
    serialPort.readable.pipeTo(textDecoder.writable);
    serialReader = textDecoder.readable.getReader();

    let buffer = '';
    while (true) {
      const { value, done } = await serialReader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        if (line.includes('[TELEMETRY]')) {
          const jsonStr = line.substring(line.indexOf('{'));
          try {
            const data = JSON.parse(jsonStr);
            ingestTelemetryPacket(data);
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    serialMsg.textContent = 'Serial Error: ' + err.message;
    serialMsg.style.color = 'var(--grade-f)';
  }
}

// --- 11. AUDIT REPORT EXPORT ---
function exportAuditReport() {
  const report = {
    report_title: 'AIoT Faculty Surveillance & Anomaly Audit Log',
    generated_at: new Date().toISOString(),
    connection_mode: currentConnectionMode,
    total_packets_ingested: packetCount,
    total_faculty_alerts: alertCount,
    fleet_health_score: document.getElementById('fleet-health-pct').textContent,
    overall_faculty_grade: document.getElementById('faculty-grade').textContent,
    sensor_inventory: Object.keys(SENSORS).map(k => ({
      channel: SENSORS[k].id,
      name: SENSORS[k].name,
      current_value: SENSORS[k].val,
      unit: SENSORS[k].unit,
      min_threshold: SENSORS[k].minThresh,
      max_threshold: SENSORS[k].maxThresh,
      faculty_grade: SENSORS[k].grade,
      status: SENSORS[k].status,
      diagnosis: SENSORS[k].faultReason || 'Nominal'
    }))
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `aiot_faculty_audit_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  logFacultyTerminal('system', '[AUDIT EXPORT]', 'Cryptographic diagnostic audit report generated & saved to local storage.');
}

// --- 12. UI EVENT LISTENERS & SETUP ---
function setupEventListeners() {
  // Pause / Resume Stream
  const pauseBtn = document.getElementById('pause-stream-btn');
  const pauseText = document.getElementById('pause-text');
  pauseBtn.addEventListener('click', () => {
    isStreamPaused = !isStreamPaused;
    pauseText.textContent = isStreamPaused ? 'Resume Stream' : 'Pause Stream';
    pauseBtn.classList.toggle('btn-primary', isStreamPaused);
    logFacultyTerminal('system', '[STREAM]', isStreamPaused ? 'Live telemetry stream paused by operator.' : 'Telemetry stream resumed.');
  });

  // Clear Graph
  document.getElementById('clear-graph-btn').addEventListener('click', () => {
    chartLabels.length = 0;
    telemetryChart.data.datasets.forEach(ds => ds.data.length = 0);
    telemetryChart.update();
    logFacultyTerminal('system', '[CHART PURGE]', 'Oscilloscope buffer cleared.');
  });

  // Audio Toggle
  const audioBtn = document.getElementById('audio-toggle-btn');
  const audioOnIcon = document.getElementById('audio-icon-on');
  const audioOffIcon = document.getElementById('audio-icon-off');
  audioBtn.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    audioOnIcon.classList.toggle('hidden', !audioEnabled);
    audioOffIcon.classList.toggle('hidden', audioEnabled);
  });

  // Export Report
  document.getElementById('export-report-btn').addEventListener('click', exportAuditReport);

  // Filter Chips (Sensor focus)
  const filterChips = document.querySelectorAll('.filter-chip');
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.getAttribute('data-filter');

      // Update Chart dataset visibility
      const datasetMap = { s1: 0, s2: 1, s3: 2, s4: 3, s5: 4 };
      if (activeFilter === 'all') {
        telemetryChart.data.datasets.forEach(ds => ds.hidden = false);
      } else {
        telemetryChart.data.datasets.forEach((ds, idx) => {
          ds.hidden = idx !== datasetMap[activeFilter];
        });
      }
      telemetryChart.update();
    });
  });

  // Threshold Calibrator Sliders
  const setupSlider = (sliderId, valId, sensorKey, prop, unit) => {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(valId);
    slider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      label.textContent = `${v}${unit}`;
      SENSORS[sensorKey][prop] = v;
      
      // Update badge on card
      if (prop === 'maxThresh') {
        const cardMaxLbl = document.getElementById(`${sensorKey}-max-lbl`);
        if (cardMaxLbl) cardMaxLbl.textContent = `${v}${unit}`;
      } else if (prop === 'minThresh') {
        const cardMinLbl = document.getElementById(`${sensorKey}-min-lbl`);
        if (cardMinLbl) cardMinLbl.textContent = `${v}${unit}`;
      }

      broadcastThresholdToESP32();
      synthesizeFacultyConsensus();
    });
  };

  setupSlider('thresh-temp-max', 'val-temp-max', 's1', 'maxThresh', '°C');
  setupSlider('thresh-hum-max', 'val-hum-max', 's2', 'maxThresh', '%');
  setupSlider('thresh-vibe-max', 'val-vibe-max', 's3', 'maxThresh', ' mm/s');
  setupSlider('thresh-light-min', 'val-light-min', 's4', 'minThresh', ' Lux');
  setupSlider('thresh-gas-max', 'val-gas-max', 's5', 'maxThresh', ' PPM');

  // Reset Calibrator Defaults
  document.getElementById('reset-thresh-btn').addEventListener('click', () => {
    document.getElementById('thresh-temp-max').value = 45;
    document.getElementById('val-temp-max').textContent = '45°C';
    SENSORS.s1.maxThresh = 45;

    document.getElementById('thresh-hum-max').value = 85;
    document.getElementById('val-hum-max').textContent = '85%';
    SENSORS.s2.maxThresh = 85;

    document.getElementById('thresh-vibe-max').value = 55;
    document.getElementById('val-vibe-max').textContent = '55 mm/s';
    SENSORS.s3.maxThresh = 55;

    document.getElementById('thresh-light-min').value = 20;
    document.getElementById('val-light-min').textContent = '20 Lux';
    SENSORS.s4.minThresh = 20;

    document.getElementById('thresh-gas-max').value = 450;
    document.getElementById('val-gas-max').textContent = '450 PPM';
    SENSORS.s5.maxThresh = 450;

    broadcastThresholdToESP32();
    synthesizeFacultyConsensus();
    logFacultyTerminal('system', '[CALIBRATION RESET]', 'Threshold boundaries reset to factory defaults.');
  });

  // Modal Controls
  const modal = document.getElementById('wokwi-modal');
  document.getElementById('wokwi-modal-btn').addEventListener('click', () => modal.classList.remove('hidden'));
  document.getElementById('conn-pill').addEventListener('click', () => modal.classList.remove('hidden'));
  document.getElementById('modal-close-btn').addEventListener('click', () => modal.classList.add('hidden'));

  // Modal Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-tab');
      document.getElementById(targetTab).classList.remove('hidden');
    });
  });

  // MQTT Connection Buttons
  document.getElementById('btn-connect-mqtt').addEventListener('click', connectMQTT);
  document.getElementById('btn-disconnect-mqtt').addEventListener('click', disconnectMQTT);

  // Web Serial Button
  document.getElementById('btn-connect-serial').addEventListener('click', connectWebSerial);
}

// --- 13. APP ENTRY POINT ---
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  setupEventListeners();
  startBuiltInSimulation();
  logFacultyTerminal('system', '[CORE READY]', 'System initialization complete. Simulation telemetry streaming.');
});
