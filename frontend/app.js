// =============================================================================
// Alarme de Incêndio IoT — Simulador (grid redesign)
// =============================================================================

(() => {
  "use strict";

  // ---------- Constantes (espelho do codigo.ino) -----------------------------
  const LIMIAR_SEGURO = 700;
  const LIMIAR_ALERTA = 300;
  const HISTERESE = 30;
  const CONTAGEM_REGRESSIVA = 10;
  const INTERVALO_LEITURA_MS = 150;
  const MAX_HISTORICO = 200;

  // ---------- Estados --------------------------------------------------------
  const ESTADO = { SEGURO: "SEGURO", ALERTA: "ALERTA", PERIGO: "PERIGO", SILENCIADO: "SILENCIADO" };

  // ---------- Tabela de segmentos (igual ao .ino) ----------------------------
  //                       A  B  C  D  E  F  G
  const DIGITOS = [
    [1, 1, 1, 1, 1, 1, 0], // 0
    [0, 1, 1, 0, 0, 0, 0], // 1
    [1, 1, 0, 1, 1, 0, 1], // 2
    [1, 1, 1, 1, 0, 0, 1], // 3
    [0, 1, 1, 0, 0, 1, 1], // 4
    [1, 0, 1, 1, 0, 1, 1], // 5
    [1, 0, 1, 1, 1, 1, 1], // 6
    [1, 1, 1, 0, 0, 0, 0], // 7
    [1, 1, 1, 1, 1, 1, 1], // 8
    [1, 1, 1, 1, 0, 1, 1], // 9
  ];

  const SEG_IDS = ["segA", "segB", "segC", "segD", "segE", "segF", "segG"];

  // ---------- DOM refs -------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  // Status
  const statusCell = $("statusCell");
  const statusIcon = $("statusIcon");
  const statusText = $("statusText");
  const statusDesc = $("statusDesc");

  // LEDs
  const ledGreen1 = $("ledGreen1");
  const ledGreen2 = $("ledGreen2");
  const ledYellow1 = $("ledYellow1");
  const ledYellow2 = $("ledYellow2");
  const ledRed1 = $("ledRed1");
  const ledRed2 = $("ledRed2");

  // Gauge
  const gaugeCanvas = $("gaugeCanvas");
  const gaugeCtx = gaugeCanvas.getContext("2d");
  const gaugeValue = $("gaugeValue");
  const sensorMin = $("sensorMin");
  const sensorMax = $("sensorMax");
  const sensorAvg = $("sensorAvg");

  // Chart
  const chartCanvas = $("chartCanvas");
  const ctx = chartCanvas.getContext("2d");

  // Log
  const serialLog = $("serialLog");

  // Controls
  const flameSlider = $("flameSlider");
  const flameOutput = $("flameOutput");

  const btnSeguro = $("btnSeguro");
  const btnAlerta = $("btnAlerta");
  const btnPerigo = $("btnPerigo");
  const btnSilenciar = $("btnSilenciar");
  const btnClearLog = $("btnClearLog");
  const toggleAuto = $("toggleAuto");

  const display7Hint = $("display7Hint");

  // State bar
  const stateBarNodes = {
    SEGURO: $("stateBarSeguro"),
    ALERTA: $("stateBarAlerta"),
    PERIGO: $("stateBarPerigo"),
    SILENCIADO: $("stateBarSilenciado"),
  };

  // Clock
  const headerClock = $("headerClock");

  // ---------- Estado da simulação --------------------------------------------
  let estadoAtual = ESTADO.SEGURO;
  let nivelSensor = 850;
  let historico = [];
  let statsMin = Infinity;
  let statsMax = -Infinity;
  let statsSum = 0;
  let statsCount = 0;
  let silenciamentoAtivo = false;
  let contagemRegressiva = 0;
  let silenciamentoInterval = null;

  // ---------- Audio context (buzzer simulado) --------------------------------
  let audioCtx = null;
  let oscillator = null;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function playTone(freq, durationMs) {
    try {
      initAudio();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); }, durationMs);
    } catch (_) {
      // audio may not be available
    }
  }

  function startAlarmTone() {
    try {
      initAudio();
      if (oscillator) return;
      oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = 2500;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(audioCtx.destination);
      oscillator.start();
    } catch (_) {}
  }

  function stopAlarmTone() {
    if (oscillator) {
      try { oscillator.stop(); } catch (_) {}
      oscillator = null;
    }
  }

  // ---------- Cálculo de estado (com histerese) ------------------------------
  function calcularEstado(leitura) {
    switch (estadoAtual) {
      case ESTADO.SEGURO:
        if (leitura <= LIMIAR_ALERTA - HISTERESE) return ESTADO.PERIGO;
        if (leitura <= LIMIAR_SEGURO - HISTERESE) return ESTADO.ALERTA;
        return ESTADO.SEGURO;
      case ESTADO.ALERTA:
        if (leitura > LIMIAR_SEGURO + HISTERESE) return ESTADO.SEGURO;
        if (leitura <= LIMIAR_ALERTA - HISTERESE) return ESTADO.PERIGO;
        return ESTADO.ALERTA;
      case ESTADO.PERIGO:
        if (leitura > LIMIAR_SEGURO + HISTERESE) return ESTADO.SEGURO;
        if (leitura > LIMIAR_ALERTA + HISTERESE) return ESTADO.ALERTA;
        return ESTADO.PERIGO;
      default:
        return ESTADO.SEGURO;
    }
  }

  // ---------- Relógio ---------------------------------------------------------
  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    headerClock.textContent = `${h}:${m}:${s}`;
  }

  setInterval(updateClock, 1000);
  updateClock();

  // ---------- Atualização da UI ----------------------------------------------
  function setLEDs(green, yellow, red) {
    ledGreen1.classList.toggle("led--on", green);
    ledGreen2.classList.toggle("led--on", green);
    ledYellow1.classList.toggle("led--on", yellow);
    ledYellow2.classList.toggle("led--on", yellow);
    ledRed1.classList.toggle("led--on", red);
    ledRed2.classList.toggle("led--on", red);
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
        stopAlarmTone();
        break;
      case ESTADO.ALERTA:
        statusCell.classList.add("status--alerta");
        statusIcon.textContent = "⚠";
        statusText.textContent = "ALERTA";
        statusDesc.textContent = "Chama detectada";
        setLEDs(false, true, false);
        stopAlarmTone();
        break;
      case ESTADO.PERIGO:
        statusCell.classList.add("status--perigo");
        statusIcon.textContent = "🔥";
        statusText.textContent = "PERIGO";
        statusDesc.textContent = "Perigo crítico!";
        setLEDs(false, false, true);
        startAlarmTone();
        break;
      case ESTADO.SILENCIADO:
        statusCell.classList.add("status--silenciado");
        statusIcon.textContent = "◈";
        statusText.textContent = "SILENCIADO";
        statusDesc.textContent = "Alarme silenciado";
        setLEDs(false, false, false);
        stopAlarmTone();
        break;
    }
  }

  function updateStateBar(estado) {
    Object.entries(stateBarNodes).forEach(([key, node]) => {
      node.classList.toggle("active", key === estado);
    });
  }

  // ---------- Gauge (Canvas com ponteiro, faixas e ticks) --------------------
  const GAUGE_START_ANGLE = Math.PI * 0.8;
  const GAUGE_END_ANGLE   = Math.PI * 2.2;
  const GAUGE_RANGE       = GAUGE_END_ANGLE - GAUGE_START_ANGLE;
  const GAUGE_MAX         = 1023;

  const GAUGE_ZONES = [
    { from: 0,              to: LIMIAR_ALERTA, color: "#ff0033" },
    { from: LIMIAR_ALERTA,  to: LIMIAR_SEGURO, color: "#ffff00" },
    { from: LIMIAR_SEGURO,  to: GAUGE_MAX,     color: "#00ff41" },
  ];

  let needleAngle = GAUGE_START_ANGLE;

  function valToAngle(val) {
    return GAUGE_START_ANGLE + (val / GAUGE_MAX) * GAUGE_RANGE;
  }

  function drawGauge(value) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = 240;
    const cssH = 160;
    gaugeCanvas.width  = cssW * dpr;
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

    // Color zones
    GAUGE_ZONES.forEach((z) => {
      const a1 = valToAngle(z.from);
      const a2 = valToAngle(z.to);
      gaugeCtx.beginPath();
      gaugeCtx.arc(cx, cy, outerR, a1, a2);
      gaugeCtx.arc(cx, cy, innerR, a2, a1, true);
      gaugeCtx.closePath();
      gaugeCtx.fillStyle = z.color + "44";
      gaugeCtx.fill();
    });

    // Active zone highlight
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

    // Needle
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

    // Center cap
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

  // ---------- Stats ----------------------------------------------------------
  function updateStats(value) {
    statsCount++;
    statsSum += value;
    if (value < statsMin) statsMin = value;
    if (value > statsMax) statsMax = value;

    sensorMin.textContent = statsMin === Infinity ? "—" : statsMin;
    sensorMax.textContent = statsMax === -Infinity ? "—" : statsMax;
    sensorAvg.textContent = statsCount > 0 ? Math.round(statsSum / statsCount) : "—";
  }

  // ---------- Chart ----------------------------------------------------------
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

  // ---------- Display 7 segmentos -------------------------------------------
  function mostrarNumero(num) {
    if (num < 0 || num > 9) {
      desligarDisplay();
      return;
    }
    const segs = DIGITOS[num];
    SEG_IDS.forEach((id, i) => {
      const el = $(id);
      el.classList.toggle("seg--on", segs[i] === 1);
    });
    $("segDP").classList.remove("seg--on");
  }

  function desligarDisplay() {
    SEG_IDS.forEach((id) => $(id).classList.remove("seg--on"));
    $("segDP").classList.remove("seg--on");
  }

  // ---------- Serial log -----------------------------------------------------
  function logSerial(msg, type) {
    const p = document.createElement("p");
    p.className = "log-line";
    if (type) p.classList.add(`log-line--${type}`);
    
    const timestamp = new Date().toLocaleTimeString();
    p.textContent = `[${timestamp}] ${msg}`;
    
    serialLog.appendChild(p);
    serialLog.scrollTop = serialLog.scrollHeight;

    // Limitar a 100 linhas
    while (serialLog.children.length > 100) {
      serialLog.removeChild(serialLog.firstChild);
    }
  }

  // ---------- Silenciamento --------------------------------------------------
  function executarSilenciamento() {
    if (silenciamentoAtivo) return;
    silenciamentoAtivo = true;
    estadoAtual = ESTADO.SILENCIADO;
    contagemRegressiva = CONTAGEM_REGRESSIVA;

    stopAlarmTone();
    updateStatusUI(ESTADO.SILENCIADO);
    updateStateBar(ESTADO.SILENCIADO);
    logSerial(`Alarme silenciado - reiniciando em ${CONTAGEM_REGRESSIVA}s`, "info");

    mostrarNumero(contagemRegressiva - 1);
    display7Hint.textContent = `${contagemRegressiva - 1}s`;

    silenciamentoInterval = setInterval(() => {
      contagemRegressiva--;
      if (contagemRegressiva <= 0) {
        clearInterval(silenciamentoInterval);
        silenciamentoInterval = null;
        silenciamentoAtivo = false;
        desligarDisplay();
        estadoAtual = ESTADO.SEGURO;
        updateStatusUI(ESTADO.SEGURO);
        updateStateBar(ESTADO.SEGURO);
        logSerial("Monitoramento retomado.", "info");
        display7Hint.textContent = "Ativo durante silenciamento";
        return;
      }
      mostrarNumero(contagemRegressiva - 1);
      playTone(2000, 50);
      display7Hint.textContent = `${contagemRegressiva - 1}s`;
    }, 1000);
  }

  // ---------- Loop principal de simulação ------------------------------------
  function tick() {
    if (silenciamentoAtivo) return;

    const novoEstado = calcularEstado(nivelSensor);
    if (novoEstado !== estadoAtual) {
      estadoAtual = novoEstado;
      updateStatusUI(estadoAtual);
      updateStateBar(estadoAtual);

      const typeMap = {
        SEGURO: "safe",
        ALERTA: "warn",
        PERIGO: "danger",
      };
      logSerial(
        `Sensor: ${nivelSensor} | Estado: ${estadoAtual}`,
        typeMap[estadoAtual]
      );
    }

    updateGauge(nivelSensor);
    updateStats(nivelSensor);

    historico.push(nivelSensor);
    if (historico.length > MAX_HISTORICO) historico.shift();

    drawChart();
  }

  // ---------- Modo automático ------------------------------------------------
  let autoTarget = 850;
  let autoChangeTimer = 0;

  function autoTick() {
    if (!toggleAuto.checked || silenciamentoAtivo) return;

    autoChangeTimer++;
    if (autoChangeTimer > 40) {
      autoChangeTimer = 0;
      autoTarget = Math.floor(Math.random() * 1024);
    }

    // Suavizar
    const diff = autoTarget - nivelSensor;
    nivelSensor += Math.sign(diff) * Math.min(Math.abs(diff), Math.floor(Math.random() * 15) + 1);
    nivelSensor = Math.max(0, Math.min(1023, nivelSensor));

    flameSlider.value = nivelSensor;
    flameOutput.textContent = nivelSensor;
  }

  // ---------- Eventos --------------------------------------------------------
  flameSlider.addEventListener("input", () => {
    nivelSensor = parseInt(flameSlider.value, 10);
    flameOutput.textContent = nivelSensor;
  });

  btnSeguro.addEventListener("click", () => {
    nivelSensor = 850;
    flameSlider.value = nivelSensor;
    flameOutput.textContent = nivelSensor;
    toggleAuto.checked = false;
    logSerial("Simulação: SEGURO (850)", "safe");
  });

  btnAlerta.addEventListener("click", () => {
    nivelSensor = 500;
    flameSlider.value = nivelSensor;
    flameOutput.textContent = nivelSensor;
    toggleAuto.checked = false;
    logSerial("Simulação: ALERTA (500)", "warn");
  });

  btnPerigo.addEventListener("click", () => {
    nivelSensor = 150;
    flameSlider.value = nivelSensor;
    flameOutput.textContent = nivelSensor;
    toggleAuto.checked = false;
    logSerial("Simulação: PERIGO (150)", "danger");
  });

  btnSilenciar.addEventListener("click", () => {
    if (estadoAtual === ESTADO.PERIGO) {
      initAudio();
      executarSilenciamento();
    } else {
      logSerial("Alarme não está em PERIGO", "info");
    }
  });

  btnClearLog.addEventListener("click", () => {
    serialLog.innerHTML = "";
    logSerial("Log limpo.", "info");
  });

  window.addEventListener("resize", drawChart);

  // ---------- Inicialização --------------------------------------------------
  updateStatusUI(ESTADO.SEGURO);
  updateStateBar(ESTADO.SEGURO);
  updateGauge(nivelSensor);
  desligarDisplay();
  logSerial("Sistema pronto", "info");

  // Loop
  setInterval(() => {
    autoTick();
    tick();
  }, INTERVALO_LEITURA_MS);
})();
