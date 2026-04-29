// =============================================================================
// Alarme de Incêndio IoT — Dashboard (simulação)
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

  const statusCard = $("statusCard");
  const statusBadge = $("statusBadge");
  const statusIcon = $("statusIcon");
  const statusLabel = $("statusLabel");
  const statusDesc = $("statusDesc");

  const ledGreen1 = $("ledGreen1");
  const ledGreen2 = $("ledGreen2");
  const ledYellow1 = $("ledYellow1");
  const ledYellow2 = $("ledYellow2");
  const ledRed1 = $("ledRed1");
  const ledRed2 = $("ledRed2");

  const gaugeCanvas = $("gaugeCanvas");
  const gaugeCtx = gaugeCanvas.getContext("2d");
  const gaugeValue = $("gaugeValue");
  const sensorMin = $("sensorMin");
  const sensorMax = $("sensorMax");
  const sensorAvg = $("sensorAvg");

  const chartCanvas = $("chartCanvas");
  const ctx = chartCanvas.getContext("2d");

  const serialLog = $("serialLog");

  const flameSlider = $("flameSlider");
  const flameOutput = $("flameOutput");

  const btnSeguro = $("btnSeguro");
  const btnAlerta = $("btnAlerta");
  const btnPerigo = $("btnPerigo");
  const btnSilenciar = $("btnSilenciar");
  const btnClearLog = $("btnClearLog");
  const toggleAuto = $("toggleAuto");

  const display7Hint = $("display7Hint");

  const stateNodes = {
    SEGURO: $("stateSeguro"),
    ALERTA: $("stateAlerta"),
    PERIGO: $("statePerigo"),
    SILENCIADO: $("stateSilenciado"),
  };

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
    statusBadge.className = "status-badge";
    switch (estado) {
      case ESTADO.SEGURO:
        statusBadge.classList.add("status-badge--seguro");
        statusIcon.textContent = "\u2714";
        statusLabel.textContent = "SEGURO";
        statusDesc.textContent = "Nenhuma chama detectada. Ambiente seguro.";
        setLEDs(true, false, false);
        stopAlarmTone();
        break;
      case ESTADO.ALERTA:
        statusBadge.classList.add("status-badge--alerta");
        statusIcon.textContent = "\u26A0";
        statusLabel.textContent = "ALERTA";
        statusDesc.textContent = "Chama detectada nas proximidades. Atenção!";
        setLEDs(false, true, false);
        stopAlarmTone();
        break;
      case ESTADO.PERIGO:
        statusBadge.classList.add("status-badge--perigo");
        statusIcon.textContent = "\uD83D\uDD25";
        statusLabel.textContent = "PERIGO";
        statusDesc.textContent = "Perigo crítico! Chama intensa detectada. Buzzer ativo.";
        setLEDs(false, false, true);
        startAlarmTone();
        break;
      case ESTADO.SILENCIADO:
        statusBadge.classList.add("status-badge--silenciado");
        statusIcon.textContent = "\uD83D\uDD07";
        statusLabel.textContent = "SILENCIADO";
        statusDesc.textContent = `Alarme silenciado. Retomando em ${contagemRegressiva}s...`;
        setLEDs(false, false, false);
        stopAlarmTone();
        break;
    }
  }

  function updateStateDiagram(estado) {
    Object.entries(stateNodes).forEach(([key, node]) => {
      node.classList.toggle("state-node--active", key === estado);
    });
  }

  // ---------- Gauge (Canvas com ponteiro, faixas e ticks) --------------------
  const GAUGE_START_ANGLE = Math.PI * 0.8;
  const GAUGE_END_ANGLE   = Math.PI * 2.2;
  const GAUGE_RANGE       = GAUGE_END_ANGLE - GAUGE_START_ANGLE;
  const GAUGE_MAX         = 1023;

  const GAUGE_ZONES = [
    { from: 0,              to: LIMIAR_ALERTA, color: "#ef4444" },
    { from: LIMIAR_ALERTA,  to: LIMIAR_SEGURO, color: "#eab308" },
    { from: LIMIAR_SEGURO,  to: GAUGE_MAX,     color: "#22c55e" },
  ];

  let needleAngle = GAUGE_START_ANGLE;

  function valToAngle(val) {
    return GAUGE_START_ANGLE + (val / GAUGE_MAX) * GAUGE_RANGE;
  }

  function drawGauge(value) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = 340;
    const cssH = 220;
    gaugeCanvas.width  = cssW * dpr;
    gaugeCanvas.height = cssH * dpr;
    gaugeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = cssW / 2;
    const cy = cssH - 38;
    const outerR = 130;
    const innerR = 100;
    const tickOuterR = outerR + 6;

    gaugeCtx.clearRect(0, 0, cssW, cssH);

    // Background arc
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, outerR, GAUGE_START_ANGLE, GAUGE_END_ANGLE);
    gaugeCtx.arc(cx, cy, innerR, GAUGE_END_ANGLE, GAUGE_START_ANGLE, true);
    gaugeCtx.closePath();
    gaugeCtx.fillStyle = "#1e2130";
    gaugeCtx.fill();

    // Color zones
    GAUGE_ZONES.forEach((z) => {
      const a1 = valToAngle(z.from);
      const a2 = valToAngle(z.to);
      gaugeCtx.beginPath();
      gaugeCtx.arc(cx, cy, outerR, a1, a2);
      gaugeCtx.arc(cx, cy, innerR, a2, a1, true);
      gaugeCtx.closePath();
      gaugeCtx.fillStyle = z.color + "55";
      gaugeCtx.fill();
    });

    // Active zone highlight
    let activeColor = "#22c55e";
    if (value <= LIMIAR_ALERTA) activeColor = "#ef4444";
    else if (value <= LIMIAR_SEGURO) activeColor = "#eab308";

    const activeEnd = valToAngle(value);
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, outerR, GAUGE_START_ANGLE, activeEnd);
    gaugeCtx.arc(cx, cy, innerR, activeEnd, GAUGE_START_ANGLE, true);
    gaugeCtx.closePath();
    gaugeCtx.fillStyle = activeColor + "aa";
    gaugeCtx.fill();

    // Glow on active arc
    gaugeCtx.save();
    gaugeCtx.shadowColor = activeColor;
    gaugeCtx.shadowBlur = 12;
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, outerR - 1, GAUGE_START_ANGLE, activeEnd);
    gaugeCtx.strokeStyle = activeColor;
    gaugeCtx.lineWidth = 2;
    gaugeCtx.stroke();
    gaugeCtx.restore();

    // Major ticks + labels
    const majorStep = 100;
    gaugeCtx.font = "bold 11px sans-serif";
    gaugeCtx.textAlign = "center";
    gaugeCtx.textBaseline = "middle";

    for (let v = 0; v <= GAUGE_MAX; v += majorStep) {
      const a = valToAngle(v);
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);

      // Tick line
      gaugeCtx.beginPath();
      gaugeCtx.moveTo(cx + innerR * cosA, cy + innerR * sinA);
      gaugeCtx.lineTo(cx + (innerR - 10) * cosA, cy + (innerR - 10) * sinA);
      gaugeCtx.strokeStyle = "#8b90a0";
      gaugeCtx.lineWidth = 2;
      gaugeCtx.stroke();

      // Label
      const labelR = innerR - 22;
      gaugeCtx.fillStyle = "#8b90a0";
      gaugeCtx.fillText(String(v), cx + labelR * cosA, cy + labelR * sinA);
    }

    // Minor ticks
    const minorStep = 50;
    for (let v = 0; v <= GAUGE_MAX; v += minorStep) {
      if (v % majorStep === 0) continue;
      const a = valToAngle(v);
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      gaugeCtx.beginPath();
      gaugeCtx.moveTo(cx + innerR * cosA, cy + innerR * sinA);
      gaugeCtx.lineTo(cx + (innerR - 5) * cosA, cy + (innerR - 5) * sinA);
      gaugeCtx.strokeStyle = "#555a6e";
      gaugeCtx.lineWidth = 1;
      gaugeCtx.stroke();
    }

    // Threshold markers (300 and 700)
    [LIMIAR_ALERTA, LIMIAR_SEGURO].forEach((threshold) => {
      const a = valToAngle(threshold);
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      gaugeCtx.beginPath();
      gaugeCtx.moveTo(cx + (innerR + 2) * cosA, cy + (innerR + 2) * sinA);
      gaugeCtx.lineTo(cx + (outerR - 2) * cosA, cy + (outerR - 2) * sinA);
      gaugeCtx.strokeStyle = "#ffffff44";
      gaugeCtx.lineWidth = 2;
      gaugeCtx.stroke();
    });

    // Needle
    const targetAngle = valToAngle(value);
    needleAngle += (targetAngle - needleAngle) * 0.15;

    const needleLen = outerR + 4;
    const needleBaseW = 4;
    const nCos = Math.cos(needleAngle);
    const nSin = Math.sin(needleAngle);
    const perpCos = Math.cos(needleAngle + Math.PI / 2);
    const perpSin = Math.sin(needleAngle + Math.PI / 2);

    gaugeCtx.save();
    gaugeCtx.shadowColor = "rgba(0,0,0,.5)";
    gaugeCtx.shadowBlur = 6;

    gaugeCtx.beginPath();
    gaugeCtx.moveTo(cx + needleLen * nCos, cy + needleLen * nSin);
    gaugeCtx.lineTo(cx + needleBaseW * perpCos, cy + needleBaseW * perpSin);
    gaugeCtx.lineTo(cx - 10 * nCos, cy - 10 * nSin);
    gaugeCtx.lineTo(cx - needleBaseW * perpCos, cy - needleBaseW * perpSin);
    gaugeCtx.closePath();
    gaugeCtx.fillStyle = "#e4e6ed";
    gaugeCtx.fill();

    gaugeCtx.restore();

    // Center cap
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, 8, 0, Math.PI * 2);
    gaugeCtx.fillStyle = "#3d4260";
    gaugeCtx.fill();
    gaugeCtx.beginPath();
    gaugeCtx.arc(cx, cy, 4, 0, Math.PI * 2);
    gaugeCtx.fillStyle = activeColor;
    gaugeCtx.fill();

    // Update text
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

    sensorMin.textContent = statsMin;
    sensorMax.textContent = statsMax;
    sensorAvg.textContent = Math.round(statsSum / statsCount);
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

    // Faixas de fundo
    const yForVal = (v) => padding.top + plotH * (1 - v / 1023);

    // Faixa verde
    ctx.fillStyle = "rgba(34,197,94,.08)";
    ctx.fillRect(padding.left, yForVal(1023), plotW, yForVal(LIMIAR_SEGURO) - yForVal(1023));

    // Faixa amarela
    ctx.fillStyle = "rgba(234,179,8,.08)";
    ctx.fillRect(padding.left, yForVal(LIMIAR_SEGURO), plotW, yForVal(LIMIAR_ALERTA) - yForVal(LIMIAR_SEGURO));

    // Faixa vermelha
    ctx.fillStyle = "rgba(239,68,68,.08)";
    ctx.fillRect(padding.left, yForVal(LIMIAR_ALERTA), plotW, yForVal(0) - yForVal(LIMIAR_ALERTA));

    // Limiares (linhas tracejadas)
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;

    ctx.strokeStyle = "rgba(34,197,94,.4)";
    ctx.beginPath();
    ctx.moveTo(padding.left, yForVal(LIMIAR_SEGURO));
    ctx.lineTo(w - padding.right, yForVal(LIMIAR_SEGURO));
    ctx.stroke();

    ctx.strokeStyle = "rgba(239,68,68,.4)";
    ctx.beginPath();
    ctx.moveTo(padding.left, yForVal(LIMIAR_ALERTA));
    ctx.lineTo(w - padding.right, yForVal(LIMIAR_ALERTA));
    ctx.stroke();

    ctx.setLineDash([]);

    // Labels dos limiares
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(34,197,94,.6)";
    ctx.fillText("700", 4, yForVal(LIMIAR_SEGURO) + 4);
    ctx.fillStyle = "rgba(239,68,68,.6)";
    ctx.fillText("300", 4, yForVal(LIMIAR_ALERTA) + 4);

    // Linha de dados
    if (historico.length < 2) return;

    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();

    historico.forEach((val, i) => {
      const x = padding.left + (i / (MAX_HISTORICO - 1)) * plotW;
      const y = yForVal(val);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    // Gradiente de cor na linha
    const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    gradient.addColorStop(0, "#22c55e");
    gradient.addColorStop(0.5, "#eab308");
    gradient.addColorStop(1, "#ef4444");
    ctx.strokeStyle = gradient;
    ctx.stroke();

    // Área preenchida
    const lastX = padding.left + ((historico.length - 1) / (MAX_HISTORICO - 1)) * plotW;
    ctx.lineTo(lastX, h - padding.bottom);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.closePath();

    const fillGradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    fillGradient.addColorStop(0, "rgba(34,197,94,.12)");
    fillGradient.addColorStop(0.5, "rgba(234,179,8,.12)");
    fillGradient.addColorStop(1, "rgba(239,68,68,.12)");
    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Eixo X (tempo)
    ctx.fillStyle = "rgba(139,144,160,.5)";
    ctx.font = "10px sans-serif";
    const totalSec = Math.round((historico.length * INTERVALO_LEITURA_MS) / 1000);
    ctx.fillText(`-${totalSec}s`, padding.left, h - 4);
    ctx.fillText("agora", lastX - 20, h - 4);
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
    p.textContent = msg;
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
    updateStateDiagram(ESTADO.SILENCIADO);
    logSerial(`Alarme silenciado - reiniciando em ${CONTAGEM_REGRESSIVA}s`, "info");

    mostrarNumero(contagemRegressiva - 1);

    silenciamentoInterval = setInterval(() => {
      contagemRegressiva--;
      if (contagemRegressiva <= 0) {
        clearInterval(silenciamentoInterval);
        silenciamentoInterval = null;
        silenciamentoAtivo = false;
        desligarDisplay();
        estadoAtual = ESTADO.SEGURO;
        updateStatusUI(ESTADO.SEGURO);
        updateStateDiagram(ESTADO.SEGURO);
        logSerial("Monitoramento retomado.", "info");
        display7Hint.textContent = "Ativo durante o silenciamento";
        return;
      }
      mostrarNumero(contagemRegressiva - 1);
      playTone(2000, 50);
      display7Hint.textContent = `Contagem: ${contagemRegressiva}s`;
      statusDesc.textContent = `Alarme silenciado. Retomando em ${contagemRegressiva}s...`;
    }, 1000);
  }

  // ---------- Loop principal de simulação ------------------------------------
  function tick() {
    if (silenciamentoAtivo) return;

    const novoEstado = calcularEstado(nivelSensor);
    if (novoEstado !== estadoAtual) {
      const estadoAnterior = estadoAtual;
      estadoAtual = novoEstado;
      updateStatusUI(estadoAtual);
      updateStateDiagram(estadoAtual);

      const typeMap = {
        SEGURO: "safe",
        ALERTA: "warn",
        PERIGO: "danger",
      };
      logSerial(
        `Sensor: ${nivelSensor} | Estado: ${estadoAtual} (${getEstadoDetalhe(estadoAtual)})`,
        typeMap[estadoAtual]
      );
    }

    updateGauge(nivelSensor);
    updateStats(nivelSensor);

    historico.push(nivelSensor);
    if (historico.length > MAX_HISTORICO) historico.shift();

    drawChart();
  }

  function getEstadoDetalhe(estado) {
    switch (estado) {
      case ESTADO.SEGURO: return "verde";
      case ESTADO.ALERTA: return "amarelo";
      case ESTADO.PERIGO: return "vermelho + buzzer";
      default: return "";
    }
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
  });

  btnAlerta.addEventListener("click", () => {
    nivelSensor = 500;
    flameSlider.value = nivelSensor;
    flameOutput.textContent = nivelSensor;
    toggleAuto.checked = false;
  });

  btnPerigo.addEventListener("click", () => {
    nivelSensor = 150;
    flameSlider.value = nivelSensor;
    flameOutput.textContent = nivelSensor;
    toggleAuto.checked = false;
  });

  btnSilenciar.addEventListener("click", () => {
    initAudio();
    executarSilenciamento();
  });

  btnClearLog.addEventListener("click", () => {
    serialLog.innerHTML = "";
    logSerial("Log limpo.", "info");
  });

  window.addEventListener("resize", drawChart);

  // ---------- Inicialização --------------------------------------------------
  updateStatusUI(ESTADO.SEGURO);
  updateStateDiagram(ESTADO.SEGURO);
  updateGauge(nivelSensor);
  desligarDisplay();

  // Loop
  setInterval(() => {
    autoTick();
    tick();
  }, INTERVALO_LEITURA_MS);
})();
