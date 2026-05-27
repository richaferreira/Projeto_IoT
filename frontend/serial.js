// =============================================================================
// Alarme de Incêndio IoT — Dashboard com Web Serial API
// Conecta ao Arduino real via porta serial USB (Chrome 89+ / Edge 89+)
// =============================================================================

(() => {
  "use strict";

  // ---------- Constantes (espelho do codigo.ino) -----------------------------
  const LIMIAR_SEGURO = 700;
  const LIMIAR_ALERTA = 300;
  const MAX_HISTORICO = 200;

  // ---------- Estados --------------------------------------------------------
  const ESTADO = { SEGURO: "SEGURO", ALERTA: "ALERTA", PERIGO: "PERIGO", SILENCIADO: "SILENCIADO" };

  // ---------- Tabela de segmentos (igual ao .ino) ----------------------------
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

  // ---------- DOM refs -------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const statusBadge   = $("statusBadge");
  const statusIcon    = $("statusIcon");
  const statusLabel   = $("statusLabel");
  const statusDesc    = $("statusDesc");

  const ledGreen1  = $("ledGreen1");
  const ledGreen2  = $("ledGreen2");
  const ledYellow1 = $("ledYellow1");
  const ledYellow2 = $("ledYellow2");
  const ledRed1    = $("ledRed1");
  const ledRed2    = $("ledRed2");

  const gaugeCanvas = $("gaugeCanvas");
  const gaugeCtx    = gaugeCanvas.getContext("2d");
  const gaugeValue  = $("gaugeValue");
  const sensorMin   = $("sensorMin");
  const sensorMax   = $("sensorMax");
  const sensorAvg   = $("sensorAvg");

  const chartCanvas = $("chartCanvas");
  const ctx         = chartCanvas.getContext("2d");

  const serialLog    = $("serialLog");
  const btnConnect   = $("btnConnect");
  const btnClearLog  = $("btnClearLog");
  const baudRate     = $("baudRate");
  const serialDot    = $("serialDot");
  const serialStatusText = $("serialStatusText");
  const display7Hint = $("display7Hint");

  const stateNodes = {
    SEGURO:     $("stateSeguro"),
    ALERTA:     $("stateAlerta"),
    PERIGO:     $("statePerigo"),
    SILENCIADO: $("stateSilenciado"),
  };

  // ---------- Estado ---------------------------------------------------------
  let estadoAtual = null;
  let nivelSensor = 0;
  let historico   = [];
  let statsMin    = Infinity;
  let statsMax    = -Infinity;
  let statsSum    = 0;
  let statsCount  = 0;

  // ---------- Contagem regressiva (simulada no JS) ---------------------------
  let contagemTimer = null;
  let contagemAtual = -1;

  function iniciarContagem(segundos) {
    pararContagem();
    contagemAtual = segundos - 1; // Arduino começa em CONTAGEM_REGRESSIVA - 1
    mostrarNumero(contagemAtual);
    display7Hint.textContent = `Contagem: ${contagemAtual}s`;

    contagemTimer = setInterval(() => {
      contagemAtual--;
      if (contagemAtual < 0) {
        pararContagem();
        desligarDisplay();
        display7Hint.textContent = "Ativo durante o silenciamento";
        return;
      }
      mostrarNumero(contagemAtual);
      display7Hint.textContent = `Contagem: ${contagemAtual}s`;
    }, 1000);
  }

  function pararContagem() {
    if (contagemTimer !== null) {
      clearInterval(contagemTimer);
      contagemTimer = null;
    }
    contagemAtual = -1;
  }

  // ---------- Web Serial -----------------------------------------------------
  let port   = null;
  let reader = null;
  let readableStreamClosed = null;
  let buffer = "";

  async function conectar() {
    if (!("serial" in navigator)) {
      logSerial("Erro: Web Serial API não suportada neste navegador. Use Chrome 89+ ou Edge 89+.", "danger");
      return;
    }

    try {
      port = await navigator.serial.requestPort();
      const baud = parseInt(baudRate.value, 10);
      await port.open({ baudRate: baud });

      serialDot.classList.remove("serial-status__dot--off");
      serialDot.classList.add("serial-status__dot--on");
      serialStatusText.textContent = `Conectado (${baud} baud)`;
      btnConnect.textContent = "🔌 Desconectar";
      btnConnect.classList.remove("btn--muted");
      btnConnect.classList.add("btn--red");

      logSerial(`Conectado à porta serial (${baud} baud)`, "info");
      logSerial("Recebendo dados do Arduino...", "info");

      lerDados();
    } catch (err) {
      if (err.name === "NotFoundError") {
        logSerial("Nenhuma porta selecionada.", "warn");
      } else {
        logSerial(`Erro ao conectar: ${err.message}`, "danger");
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

    serialDot.classList.remove("serial-status__dot--on");
    serialDot.classList.add("serial-status__dot--off");
    serialStatusText.textContent = "Desconectado";
    btnConnect.textContent = "🔌 Conectar ao Arduino";
    btnConnect.classList.remove("btn--red");
    btnConnect.classList.add("btn--muted");

    logSerial("Desconectado.", "info");
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
        logSerial(`Erro de leitura: ${err.message}`, "danger");
      }
    }
    // Cleanup é feito em desconectar() para evitar race conditions
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

  // ---------- Parser da saída serial do Arduino ------------------------------
  // Formato esperado: "Sensor: 850 | Estado: SEGURO (verde)"
  // Também aceita: "Alarme silenciado - reiniciando em 10s"

  function parsearLinha(linha) {
    // Padrão principal: "Sensor: XXX | Estado: YYY"
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
        updateStateDiagram(estadoAtual);
      }
    }

    // Silenciamento
    if (/silenciado/i.test(linha)) {
      estadoAtual = ESTADO.SILENCIADO;
      updateStatusUI(ESTADO.SILENCIADO);
      updateStateDiagram(ESTADO.SILENCIADO);
    }

    // Contagem regressiva — simula localmente com timer
    const matchContagem = linha.match(/reiniciando em (\d+)s/i);
    if (matchContagem) {
      const segundos = parseInt(matchContagem[1], 10);
      iniciarContagem(segundos);
    }

    // Monitoramento retomado
    if (/retomado/i.test(linha)) {
      pararContagem();
      desligarDisplay();
      display7Hint.textContent = "Ativo durante o silenciamento";
      estadoAtual = ESTADO.SEGURO;
      updateStatusUI(ESTADO.SEGURO);
      updateStateDiagram(ESTADO.SEGURO);
    }
  }

  function classificarLinha(linha) {
    if (/SEGURO|verde/i.test(linha)) return "safe";
    if (/ALERTA|amarelo/i.test(linha)) return "warn";
    if (/PERIGO|vermelho|buzzer/i.test(linha)) return "danger";
    if (/silenciado|retomado|===|Limiares|pronto/i.test(linha)) return "info";
    return "";
  }

  // ---------- UI updates -----------------------------------------------------
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
        break;
      case ESTADO.ALERTA:
        statusBadge.classList.add("status-badge--alerta");
        statusIcon.textContent = "\u26A0";
        statusLabel.textContent = "ALERTA";
        statusDesc.textContent = "Chama detectada nas proximidades. Atenção!";
        setLEDs(false, true, false);
        break;
      case ESTADO.PERIGO:
        statusBadge.classList.add("status-badge--perigo");
        statusIcon.textContent = "\uD83D\uDD25";
        statusLabel.textContent = "PERIGO";
        statusDesc.textContent = "Perigo crítico! Chama intensa detectada. Buzzer ativo.";
        setLEDs(false, false, true);
        break;
      case ESTADO.SILENCIADO:
        statusBadge.classList.add("status-badge--silenciado");
        statusIcon.textContent = "\uD83D\uDD07";
        statusLabel.textContent = "SILENCIADO";
        statusDesc.textContent = "Alarme silenciado pelo botão físico.";
        setLEDs(false, false, false);
        break;
    }
  }

  function updateStateDiagram(estado) {
    Object.entries(stateNodes).forEach(([key, node]) => {
      node.classList.toggle("state-node--active", key === estado);
    });
  }

  // ---------- Gauge (Canvas) -------------------------------------------------
  const GAUGE_START_ANGLE = Math.PI * 0.8;
  const GAUGE_END_ANGLE   = Math.PI * 2.2;
  const GAUGE_RANGE       = GAUGE_END_ANGLE - GAUGE_START_ANGLE;
  const GAUGE_MAX         = 1023;

  const GAUGE_ZONES = [
    { from: 0,             to: LIMIAR_ALERTA, color: "#ef4444" },
    { from: LIMIAR_ALERTA, to: LIMIAR_SEGURO, color: "#eab308" },
    { from: LIMIAR_SEGURO, to: GAUGE_MAX,     color: "#22c55e" },
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

    // Active zone
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

    // Glow
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
    gaugeCtx.font = "bold 11px sans-serif";
    gaugeCtx.textAlign = "center";
    gaugeCtx.textBaseline = "middle";

    for (let v = 0; v <= GAUGE_MAX; v += 100) {
      const a = valToAngle(v);
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);

      gaugeCtx.beginPath();
      gaugeCtx.moveTo(cx + innerR * cosA, cy + innerR * sinA);
      gaugeCtx.lineTo(cx + (innerR - 10) * cosA, cy + (innerR - 10) * sinA);
      gaugeCtx.strokeStyle = "#8b90a0";
      gaugeCtx.lineWidth = 2;
      gaugeCtx.stroke();

      const labelR = innerR - 22;
      gaugeCtx.fillStyle = "#8b90a0";
      gaugeCtx.fillText(String(v), cx + labelR * cosA, cy + labelR * sinA);
    }

    // Minor ticks
    for (let v = 0; v <= GAUGE_MAX; v += 50) {
      if (v % 100 === 0) continue;
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

    // Threshold markers
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

    const yForVal = (v) => padding.top + plotH * (1 - v / 1023);

    ctx.fillStyle = "rgba(34,197,94,.08)";
    ctx.fillRect(padding.left, yForVal(1023), plotW, yForVal(LIMIAR_SEGURO) - yForVal(1023));
    ctx.fillStyle = "rgba(234,179,8,.08)";
    ctx.fillRect(padding.left, yForVal(LIMIAR_SEGURO), plotW, yForVal(LIMIAR_ALERTA) - yForVal(LIMIAR_SEGURO));
    ctx.fillStyle = "rgba(239,68,68,.08)";
    ctx.fillRect(padding.left, yForVal(LIMIAR_ALERTA), plotW, yForVal(0) - yForVal(LIMIAR_ALERTA));

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

    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(34,197,94,.6)";
    ctx.fillText("700", 4, yForVal(LIMIAR_SEGURO) + 4);
    ctx.fillStyle = "rgba(239,68,68,.6)";
    ctx.fillText("300", 4, yForVal(LIMIAR_ALERTA) + 4);

    if (historico.length < 2) return;

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
    gradient.addColorStop(0, "#22c55e");
    gradient.addColorStop(0.5, "#eab308");
    gradient.addColorStop(1, "#ef4444");
    ctx.strokeStyle = gradient;
    ctx.stroke();

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

    ctx.fillStyle = "rgba(139,144,160,.5)";
    ctx.font = "10px sans-serif";
    const totalSec = Math.round((historico.length * 150) / 1000);
    ctx.fillText(`-${totalSec}s`, padding.left, h - 4);
    ctx.fillText("agora", lastX - 20, h - 4);
  }

  // ---------- Display 7 segmentos -------------------------------------------
  function mostrarNumero(num) {
    if (num < 0 || num > 9) { desligarDisplay(); return; }
    const segs = DIGITOS[num];
    SEG_IDS.forEach((id, i) => $(id).classList.toggle("seg--on", segs[i] === 1));
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
    while (serialLog.children.length > 200) {
      serialLog.removeChild(serialLog.firstChild);
    }
  }

  // ---------- Eventos --------------------------------------------------------
  btnConnect.addEventListener("click", () => {
    if (port) desconectar();
    else conectar();
  });

  btnClearLog.addEventListener("click", () => {
    serialLog.innerHTML = "";
    logSerial("Log limpo.", "info");
  });

  window.addEventListener("resize", drawChart);

  // ---------- Verificação de suporte -----------------------------------------
  if (!("serial" in navigator)) {
    btnConnect.disabled = true;
    btnConnect.textContent = "Navegador não suportado";
    logSerial("Web Serial API não disponível. Use Google Chrome 89+ ou Microsoft Edge 89+.", "danger");
  }

  // Gauge inicial (zerado)
  drawGauge(0);
  desligarDisplay();
})();
