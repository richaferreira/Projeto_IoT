// =============================================================================
// Alarme de Incêndio IoT — Industrial/Cyber Dashboard
// Com Web Serial API, localStorage, timestamps, sons e notificações
// =============================================================================

(() => {
  "use strict";

  // ---------- CONSTANTES -------------------------------------------------------
  const LIMIAR_SEGURO = 700;
  const LIMIAR_ALERTA = 300;
  const MAX_HISTORICO = 200;
  
  const ESTADO = { 
    SEGURO: "SEGURO", 
    ALERTA: "ALERTA", 
    PERIGO: "PERIGO", 
    SILENCIADO: "SILENCIADO" 
  };

  // Tabela 7 segmentos
  const DIGITOS = [
    [1, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 0, 0, 0, 0],
    [1, 1, 0, 1, 1, 0, 1],
    [1, 1, 1, 1, 0, 0, 1],
    [0, 1, 1, 0, 0, 1, 1],
    [1, 0, 1, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1],
  ];
  const SEG_IDS = ["segA", "segB", "segC", "segD", "segE", "segF", "segG"];

  // ---------- DOM REFS ---------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  // Status
  const statusCell = $("statusCell");
  const statusIcon = $("statusIcon");
  const statusText = $("statusText");
  const statusDesc = $("statusDesc");

  // Serial
  const btnConnect = $("btnConnect");
  const btnExport = $("btnExport");
  const baudRate = $("baudRate");
  const serialDot = $("serialDot");
  const serialStatusText = $("serialStatusText");
  const serialStatus = $("serialStatus");

  // Gauge
  const gaugeCanvas = $("gaugeCanvas");
  const gaugeCtx = gaugeCanvas.getContext("2d");
  const gaugeValue = $("gaugeValue");

  // Stats
  const sensorMin = $("sensorMin");
  const sensorMax = $("sensorMax");
  const sensorAvg = $("sensorAvg");

  // LEDs
  const leds = {
    green1: $("ledGreen1"),
    green2: $("ledGreen2"),
    yellow1: $("ledYellow1"),
    yellow2: $("ledYellow2"),
    red1: $("ledRed1"),
    red2: $("ledRed2"),
  };

  // Display 7-seg
  const display7Hint = $("display7Hint");

  // Gráfico
  const chartCanvas = $("chartCanvas");
  const ctx = chartCanvas.getContext("2d");

  // Log
  const serialLog = $("serialLog");
  const btnClearLog = $("btnClearLog");

  // Settings
  const soundToggle = $("soundToggle");
  const notifToggle = $("notifToggle");
  const themeToggle = $("themeToggle");

  // State bar
  const stateBarNodes = {
    SEGURO: $("stateBarSeguro"),
    ALERTA: $("stateBarAlerta"),
    PERIGO: $("stateBarPerigo"),
    SILENCIADO: $("stateBarSilenciado"),
  };

  // Clock
  const headerClock = $("headerClock");

  // ---------- ESTADO GLOBAL ---------------------------------------------------
  let estadoAtual = null;
  let nivelSensor = 0;
  let historico = [];
  let statsMin = Infinity;
  let statsMax = -Infinity;
  let statsSum = 0;
  let statsCount = 0;

  let contagemTimer = null;
  let contagemAtual = -1;

  // ---------- WEB SERIAL -------------------------------------------------------
  let port = null;
  let reader = null;
  let readableStreamClosed = null;
  let buffer = "";

  // ---------- STORAGE & SETTINGS -----------------------------------------------
  const STORAGE_KEY = "iot_dashboard_settings";
  const LOG_STORAGE_KEY = "iot_dashboard_log";

  function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const settings = JSON.parse(saved);
      soundToggle.checked = settings.sound !== false;
      notifToggle.checked = settings.notif !== false;
      themeToggle.checked = settings.theme === "light";
      if (settings.theme === "light") {
        document.body.classList.add("light-theme");
      }
    }
  }

  function saveSettings() {
    const settings = {
      sound: soundToggle.checked,
      notif: notifToggle.checked,
      theme: themeToggle.checked ? "light" : "dark",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function saveLogToStorage() {
    const logContent = Array.from(serialLog.children)
      .map(el => el.textContent)
      .join("\n");
    localStorage.setItem(LOG_STORAGE_KEY, logContent);
  }

  // ---------- RELÓGIO ---------------------------------------------------------
  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    headerClock.textContent = `${h}:${m}:${s}`;
  }

  setInterval(updateClock, 1000);
  updateClock();

  // ---------- SONS & NOTIFICAÇÕES -----------------------------------------------
  function playSound(type) {
    if (!soundToggle.checked) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;

    if (type === "beep_short") {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === "beep_alarm") {
      for (let i = 0; i < 3; i++) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(1000, now + i * 0.3);
        osc.frequency.setValueAtTime(1200, now + i * 0.3 + 0.1);
        gain.gain.setValueAtTime(0.3, now + i * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.3 + 0.2);
        osc.start(now + i * 0.3);
        osc.stop(now + i * 0.3 + 0.2);
      }
    } else if (type === "beep_warning") {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.setValueAtTime(800, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  }

  function showNotification(title, options = {}) {
    if (!notifToggle.checked) return;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23ff0033'/><text x='50' y='60' font-size='60' fill='white' text-anchor='middle'>!</text></svg>",
        ...options,
      });
    }
  }

  // ---------- CONTAGEM REGRESSIVA -----------------------------------------------
  function iniciarContagem(segundos) {
    pararContagem();
    contagemAtual = segundos - 1;
    mostrarNumero(contagemAtual);
    display7Hint.textContent = `${contagemAtual}s`;

    contagemTimer = setInterval(() => {
      contagemAtual--;
      if (contagemAtual < 0) {
        pararContagem();
        desligarDisplay();
        display7Hint.textContent = "—";
        return;
      }
      mostrarNumero(contagemAtual);
      display7Hint.textContent = `${contagemAtual}s`;
    }, 1000);
  }

  function pararContagem() {
    if (contagemTimer !== null) {
      clearInterval(contagemTimer);
      contagemTimer = null;
    }
    contagemAtual = -1;
  }

  // ---------- WEB SERIAL CONNECTION -------------------------------------------
  async function conectar() {
    if (!("serial" in navigator)) {
      logSerial("Erro: Web Serial API não suportada.", "danger");
      return;
    }

    try {
      port = await navigator.serial.requestPort();
      const baud = parseInt(baudRate.value, 10);
      await port.open({ baudRate: baud });

      serialDot.style.background = "var(--green)";
      serialStatusText.textContent = `CONECTADO (${baud})`;
      serialStatus.classList.add("connected");
      btnConnect.textContent = "DESCONECTAR";

      logSerial(`[SYS] Conectado (${baud} baud)`, "info");
      playSound("beep_short");

      lerDados();
    } catch (err) {
      if (err.name !== "NotFoundError") {
        logSerial(`[ERR] ${err.message}`, "danger");
        playSound("beep_warning");
      }
    }
  }

  async function desconectar() {
    pararContagem();

    try {
      if (reader) {
        await reader.cancel();
        reader.releaseLock();
        reader = null;
      }
      if (readableStreamClosed) {
        await readableStreamClosed.catch(() => {});
        readableStreamClosed = null;
      }
      if (port) {
        await port.close();
        port = null;
      }
    } catch (_) {}

    serialDot.style.background = "var(--red)";
    serialStatusText.textContent = "DESCONECTADO";
    serialStatus.classList.remove("connected");
    btnConnect.textContent = "CONECTAR";

    logSerial("[SYS] Desconectado", "info");
  }

  async function lerDados() {
    const decoder = new TextDecoderStream();
    readableStreamClosed = port.readable.pipeTo(decoder.writable);
    const localReader = decoder.readable.getReader();
    reader = localReader;

    try {
      while (true) {
        const { value, done } = await localReader.read();
        if (done) break;
        if (value) {
          buffer += value;
          processarBuffer();
        }
      }
    } catch (err) {
      if (err.name !== "TypeError") {
        logSerial(`[ERR] ${err.message}`, "danger");
      }
    }
  }

  function processarBuffer() {
    const linhas = buffer.split("\n");
    buffer = linhas.pop();

    linhas.forEach((linha) => {
      linha = linha.trim();
      if (!linha) return;
      logSerial(linha, classificarLinha(linha));
      parsearLinha(linha);
    });
  }

  // ---------- PARSER SERIAL ---------------------------------------------------
  function parsearLinha(linha) {
    const matchSensor = linha.match(/Sensor:\s*(\d+)/i);
    const matchEstado = linha.match(/Estado:\s*(\w+)/i);

    if (matchSensor) {
      nivelSensor = parseInt(matchSensor[1], 10);
      updateGauge(nivelSensor);
      updateStats(nivelSensor);
      historico.push(nivelSensor);
      if (historico.length > MAX_HISTORICO) historico.shift();
      drawChart();
    }

    if (matchEstado) {
      const novoEstado = matchEstado[1].toUpperCase();
      if (ESTADO[novoEstado] && novoEstado !== estadoAtual) {
        estadoAtual = novoEstado;
        updateStatusUI(estadoAtual);
        updateStateBar(estadoAtual);

        // Emitir sons de alerta
        if (novoEstado === ESTADO.PERIGO) {
          playSound("beep_alarm");
          showNotification("🔥 PERIGO!", {
            body: "Chama intensa detectada! Alarme ativo.",
            tag: "fire-alert",
          });
        } else if (novoEstado === ESTADO.ALERTA) {
          playSound("beep_warning");
          showNotification("⚠️ ALERTA", {
            body: "Chama detectada nas proximidades.",
            tag: "fire-alert",
          });
        }
      }
    }

    if (/silenciado/i.test(linha)) {
      estadoAtual = ESTADO.SILENCIADO;
      updateStatusUI(ESTADO.SILENCIADO);
      updateStateBar(ESTADO.SILENCIADO);
    }

    const matchContagem = linha.match(/reiniciando em (\d+)s/i);
    if (matchContagem) {
      const segundos = parseInt(matchContagem[1], 10);
      iniciarContagem(segundos);
    }

    if (/retomado/i.test(linha)) {
      pararContagem();
      desligarDisplay();
      display7Hint.textContent = "—";
      estadoAtual = ESTADO.SEGURO;
      updateStatusUI(ESTADO.SEGURO);
      updateStateBar(ESTADO.SEGURO);
    }
  }

  function classificarLinha(linha) {
    if (/SEGURO|verde/i.test(linha)) return "safe";
    if (/ALERTA|amarelo/i.test(linha)) return "warn";
    if (/PERIGO|vermelho|buzzer/i.test(linha)) return "danger";
    if (/silenciado|retomado|===|pronto/i.test(linha)) return "info";
    return "";
  }

  // ---------- UI UPDATES -------------------------------------------------------
  function getTimestamp() {
    const now = new Date();
    return `[${now.toLocaleTimeString()}]`;
  }

  function setLEDs(green, yellow, red) {
    leds.green1.classList.toggle("led--on", green);
    leds.green2.classList.toggle("led--on", green);
    leds.yellow1.classList.toggle("led--on", yellow);
    leds.yellow2.classList.toggle("led--on", yellow);
    leds.red1.classList.toggle("led--on", red);
    leds.red2.classList.toggle("led--on", red);
  }

  function updateStatusUI(estado) {
    statusCell.className = "cell cell--status";

    switch (estado) {
      case ESTADO.SEGURO:
        statusCell.classList.add("status--seguro");
        statusIcon.textContent = "✔";
        statusText.textContent = "SEGURO";
        statusDesc.textContent = "Nenhuma chama detectada";
        setLEDs(true, false, false);
        break;
      case ESTADO.ALERTA:
        statusCell.classList.add("status--alerta");
        statusIcon.textContent = "⚠";
        statusText.textContent = "ALERTA";
        statusDesc.textContent = "Chama detectada";
        setLEDs(false, true, false);
        break;
      case ESTADO.PERIGO:
        statusCell.classList.add("status--perigo");
        statusIcon.textContent = "🔥";
        statusText.textContent = "PERIGO";
        statusDesc.textContent = "Perigo crítico!";
        setLEDs(false, false, true);
        break;
      case ESTADO.SILENCIADO:
        statusCell.classList.add("status--silenciado");
        statusIcon.textContent = "◈";
        statusText.textContent = "SILENCIADO";
        statusDesc.textContent = "Alarme silenciado";
        setLEDs(false, false, false);
        break;
    }
  }

  function updateStateBar(estado) {
    Object.entries(stateBarNodes).forEach(([key, node]) => {
      node.classList.toggle("active", key === estado);
    });
  }

  // ---------- GAUGE --------------------------------------------------
  const GAUGE_START_ANGLE = Math.PI * 0.8;
  const GAUGE_END_ANGLE = Math.PI * 2.2;
  const GAUGE_RANGE = GAUGE_END_ANGLE - GAUGE_START_ANGLE;
  const GAUGE_MAX = 1023;

  let needleAngle = GAUGE_START_ANGLE;

  function valToAngle(val) {
    return GAUGE_START_ANGLE + (val / GAUGE_MAX) * GAUGE_RANGE;
  }

  function drawGauge(value) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = 240;
    const cssH = 160;
    gaugeCanvas.width = cssW * dpr;
    gaugeCanvas.height = cssH * dpr;
    gaugeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = cssW / 2;
    const cy = cssH - 25;
    const outerR = 90;
    const innerR = 70;

    gaugeCtx.clearRect(0, 0, cssW, cssH);

    // Background arc
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, outerR, GAUGE_START_ANGLE, GAUGE_END_ANGLE);
    gaugeCtx.arc(cx, cy, innerR, GAUGE_END_ANGLE, GAUGE_START_ANGLE, true);
    gaugeCtx.closePath();
    gaugeCtx.fillStyle = "#1a1f35";
    gaugeCtx.fill();

    // Zonas coloridas
    const zones = [
      { from: 0, to: LIMIAR_ALERTA, color: "#ff0033" },
      { from: LIMIAR_ALERTA, to: LIMIAR_SEGURO, color: "#ffff00" },
      { from: LIMIAR_SEGURO, to: GAUGE_MAX, color: "#00ff41" },
    ];

    zones.forEach((z) => {
      const a1 = valToAngle(z.from);
      const a2 = valToAngle(z.to);
      gaugeCtx.beginPath();
      gaugeCtx.arc(cx, cy, outerR, a1, a2);
      gaugeCtx.arc(cx, cy, innerR, a2, a1, true);
      gaugeCtx.closePath();
      gaugeCtx.fillStyle = z.color + "44";
      gaugeCtx.fill();
    });

    // Zona ativa
    let activeColor = "#00ff41";
    if (value <= LIMIAR_ALERTA) activeColor = "#ff0033";
    else if (value <= LIMIAR_SEGURO) activeColor = "#ffff00";

    const activeEnd = valToAngle(value);
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, outerR, GAUGE_START_ANGLE, activeEnd);
    gaugeCtx.arc(cx, cy, innerR, activeEnd, GAUGE_START_ANGLE, true);
    gaugeCtx.closePath();
    gaugeCtx.fillStyle = activeColor + "aa";
    gaugeCtx.fill();

    // Ticks
    gaugeCtx.font = "bold 9px monospace";
    gaugeCtx.textAlign = "center";
    gaugeCtx.textBaseline = "middle";
    gaugeCtx.fillStyle = "#6b7595";

    for (let v = 0; v <= GAUGE_MAX; v += 200) {
      const a = valToAngle(v);
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);

      gaugeCtx.beginPath();
      gaugeCtx.moveTo(cx + innerR * cosA, cy + innerR * sinA);
      gaugeCtx.lineTo(cx + (innerR - 8) * cosA, cy + (innerR - 8) * sinA);
      gaugeCtx.strokeStyle = "#8b90a0";
      gaugeCtx.lineWidth = 1.5;
      gaugeCtx.stroke();

      const labelR = innerR - 18;
      gaugeCtx.fillText(String(v), cx + labelR * cosA, cy + labelR * sinA);
    }

    // Agulha
    const targetAngle = valToAngle(value);
    needleAngle += (targetAngle - needleAngle) * 0.15;

    const needleLen = outerR + 2;
    const needleBaseW = 3;
    const nCos = Math.cos(needleAngle);
    const nSin = Math.sin(needleAngle);
    const perpCos = Math.cos(needleAngle + Math.PI / 2);
    const perpSin = Math.sin(needleAngle + Math.PI / 2);

    gaugeCtx.beginPath();
    gaugeCtx.moveTo(cx + needleLen * nCos, cy + needleLen * nSin);
    gaugeCtx.lineTo(cx + needleBaseW * perpCos, cy + needleBaseW * perpSin);
    gaugeCtx.lineTo(cx - 8 * nCos, cy - 8 * nSin);
    gaugeCtx.lineTo(cx - needleBaseW * perpCos, cy - needleBaseW * perpSin);
    gaugeCtx.closePath();
    gaugeCtx.fillStyle = "#e4f0ff";
    gaugeCtx.fill();

    // Centro
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    gaugeCtx.fillStyle = "#3d4260";
    gaugeCtx.fill();
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, 3, 0, Math.PI * 2);
    gaugeCtx.fillStyle = activeColor;
    gaugeCtx.fill();

    gaugeValue.textContent = value;
  }

  function updateGauge(value) {
    drawGauge(value);
  }

  // ---------- STATS -----------------------------------------------------------
  function updateStats(value) {
    statsCount++;
    statsSum += value;
    if (value < statsMin) statsMin = value;
    if (value > statsMax) statsMax = value;

    sensorMin.textContent = statsMin === Infinity ? "—" : statsMin;
    sensorMax.textContent = statsMax === -Infinity ? "—" : statsMax;
    sensorAvg.textContent = statsCount > 0 ? Math.round(statsSum / statsCount) : "—";
  }

  // ---------- CHART -----------------------------------------------------------
  function resizeCanvas() {
    const container = chartCanvas.parentElement;
    chartCanvas.width = container.clientWidth;
    chartCanvas.height = container.clientHeight;
  }

  function drawChart() {
    resizeCanvas();
    const w = chartCanvas.width;
    const h = chartCanvas.height;
    const padding = { top: 10, right: 10, bottom: 20, left: 40 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    const yForVal = (v) => padding.top + plotH * (1 - v / 1023);

    // Zonas de cor
    ctx.fillStyle = "rgba(0, 255, 65, 0.08)";
    ctx.fillRect(padding.left, yForVal(1023), plotW, yForVal(LIMIAR_SEGURO) - yForVal(1023));
    ctx.fillStyle = "rgba(255, 255, 0, 0.08)";
    ctx.fillRect(padding.left, yForVal(LIMIAR_SEGURO), plotW, yForVal(LIMIAR_ALERTA) - yForVal(LIMIAR_SEGURO));
    ctx.fillStyle = "rgba(255, 0, 51, 0.08)";
    ctx.fillRect(padding.left, yForVal(LIMIAR_ALERTA), plotW, yForVal(0) - yForVal(LIMIAR_ALERTA));

    // Linhas de limiar
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0, 255, 65, 0.4)";
    ctx.beginPath();
    ctx.moveTo(padding.left, yForVal(LIMIAR_SEGURO));
    ctx.lineTo(w - padding.right, yForVal(LIMIAR_SEGURO));
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 0, 51, 0.4)";
    ctx.beginPath();
    ctx.moveTo(padding.left, yForVal(LIMIAR_ALERTA));
    ctx.lineTo(w - padding.right, yForVal(LIMIAR_ALERTA));
    ctx.stroke();

    ctx.setLineDash([]);

    // Labels
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(0, 255, 65, 0.6)";
    ctx.fillText("700", 4, yForVal(LIMIAR_SEGURO) + 4);
    ctx.fillStyle = "rgba(255, 0, 51, 0.6)";
    ctx.fillText("300", 4, yForVal(LIMIAR_ALERTA) + 4);

    if (historico.length < 2) return;

    // Linha do gráfico
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    historico.forEach((val, i) => {
      const x = padding.left + (i / (MAX_HISTORICO - 1)) * plotW;
      const y = yForVal(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    gradient.addColorStop(0, "#00ff41");
    gradient.addColorStop(0.5, "#ffff00");
    gradient.addColorStop(1, "#ff0033");
    ctx.strokeStyle = gradient;
    ctx.stroke();

    // Preenchimento
    const lastX = padding.left + ((historico.length - 1) / (MAX_HISTORICO - 1)) * plotW;
    ctx.lineTo(lastX, h - padding.bottom);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.closePath();

    const fillGradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    fillGradient.addColorStop(0, "rgba(0, 255, 65, 0.12)");
    fillGradient.addColorStop(0.5, "rgba(255, 255, 0, 0.12)");
    fillGradient.addColorStop(1, "rgba(255, 0, 51, 0.12)");
    ctx.fillStyle = fillGradient;
    ctx.fill();
  }

  // ---------- DISPLAY 7 SEGMENTOS -----------------------------------------------
  function mostrarNumero(num) {
    if (num < 0 || num > 9) {
      desligarDisplay();
      return;
    }
    const segs = DIGITOS[num];
    SEG_IDS.forEach((id, i) => $(id).classList.toggle("seg--on", segs[i] === 1));
    $("segDP").classList.remove("seg--on");
  }

  function desligarDisplay() {
    SEG_IDS.forEach((id) => $(id).classList.remove("seg--on"));
    $("segDP").classList.remove("seg--on");
  }

  // ---------- LOG SERIAL -------------------------------------------------------
  function logSerial(msg, type) {
    const p = document.createElement("p");
    p.className = "log-line";

    // Adicionar timestamp
    const timestamp = getTimestamp();
    const fullMsg = `${timestamp} ${msg}`;

    if (type) p.classList.add(`log-line--${type}`);
    p.textContent = fullMsg;
    serialLog.appendChild(p);
    serialLog.scrollTop = serialLog.scrollHeight;

    // Limitar a 200 linhas
    while (serialLog.children.length > 200) {
      serialLog.removeChild(serialLog.firstChild);
    }

    // Salvar no localStorage a cada log
    saveLogToStorage();
  }

  // ---------- EXPORTAR DADOS ---------------------------------------------------
  function exportData() {
    const data = {
      timestamp: new Date().toISOString(),
      estado: estadoAtual,
      nivelAtual: nivelSensor,
      stats: {
        minimo: statsMin,
        maximo: statsMax,
        media: Math.round(statsSum / statsCount),
        total: statsCount,
      },
      historico: historico,
      log: Array.from(serialLog.children).map(el => el.textContent).join("\n"),
    };

    const csv = `Timestamp,Valor Sensor,Estado\n${historico.map((val, i) => `${i},${val},${estadoAtual}`).join("\n")}`;
    const jsonStr = JSON.stringify(data, null, 2);

    // Download JSON
    const jsonBlob = new Blob([jsonStr], { type: "application/json" });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement("a");
    jsonLink.href = jsonUrl;
    jsonLink.download = `iot_data_${Date.now()}.json`;
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);

    // Download CSV
    const csvBlob = new Blob([csv], { type: "text/csv" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const csvLink = document.createElement("a");
    csvLink.href = csvUrl;
    csvLink.download = `iot_data_${Date.now()}.csv`;
    csvLink.click();
    URL.revokeObjectURL(csvUrl);

    logSerial("[SYS] Dados exportados (JSON e CSV)", "info");
    playSound("beep_short");
  }

  // ---------- EVENTOS -------------------------------------------------------
  btnConnect.addEventListener("click", () => {
    if (port) desconectar();
    else conectar();
  });

  btnExport.addEventListener("click", exportData);

  btnClearLog.addEventListener("click", () => {
    serialLog.innerHTML = "";
    logSerial("[SYS] Log limpo", "info");
  });

  themeToggle.addEventListener("change", () => {
    document.body.classList.toggle("light-theme");
    saveSettings();
  });

  soundToggle.addEventListener("change", saveSettings);
  notifToggle.addEventListener("change", saveSettings);

  window.addEventListener("resize", drawChart);

  // ---------- INICIALIZAÇÃO ---------------------------------------------------
  if (!("serial" in navigator)) {
    btnConnect.disabled = true;
    btnConnect.textContent = "NÃO SUPORTADO";
    logSerial("[ERR] Web Serial API não disponível (Chrome 89+ / Edge 89+)", "danger");
  }

  // Pedir permissão para notificações
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  // Carregar settings
  loadSettings();

  // Desenho inicial
  drawGauge(0);
  desligarDisplay();
  updateStatusUI(ESTADO.SEGURO);
  updateStateBar(ESTADO.SEGURO);

  logSerial("[SYS] Sistema pronto", "info");
})();
