"""
=============================================================================
FireGuard IoT — Backend (Trabalho 2)
Servidor Flask com banco de dados SQLite e API REST
=============================================================================
Funcionalidades:
  - Recebe leituras do Arduino via porta serial (ou simulação)
  - Armazena cada leitura no banco de dados SQLite
  - Expõe API REST para o frontend consultar o histórico com filtros
=============================================================================
"""

import sqlite3
import threading
import time
import re
import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# ── Configurações ──────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DB_PATH    = os.path.join(BASE_DIR, "fireguard.db")
FRONTEND   = os.path.join(BASE_DIR, "..", "frontend")
SERIAL_PORT = os.environ.get("SERIAL_PORT", "")   # ex: /dev/ttyUSB0 ou COM3
BAUD_RATE   = 9600

app = Flask(__name__, static_folder=FRONTEND)
CORS(app)

# ── Banco de Dados ──────────────────────────────────────────────────────────

def get_db():
    """Retorna conexão com o banco SQLite (thread-safe)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Cria as tabelas se não existirem."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS leituras (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT    NOT NULL,
                sensor    INTEGER NOT NULL,
                estado    TEXT    NOT NULL
            )
        """)
        conn.commit()
    print(f"[DB] Banco inicializado em: {DB_PATH}")


def salvar_leitura(sensor: int, estado: str):
    """Insere uma leitura no banco de dados."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        conn.execute(
            "INSERT INTO leituras (timestamp, sensor, estado) VALUES (?, ?, ?)",
            (ts, sensor, estado)
        )
        conn.commit()

# ── Leitura Serial ──────────────────────────────────────────────────────────

def ler_serial():
    """
    Thread que lê a porta serial do Arduino e salva no banco.
    Formato esperado: 'Sensor: 850 | Estado: SEGURO (verde)'
    """
    try:
        import serial
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
        print(f"[SERIAL] Conectado em {SERIAL_PORT} @ {BAUD_RATE} baud")
        while True:
            linha = ser.readline().decode("utf-8", errors="ignore").strip()
            if not linha:
                continue
            m_sensor = re.search(r"Sensor:\s*(\d+)", linha, re.IGNORECASE)
            m_estado = re.search(r"Estado:\s*(\w+)", linha, re.IGNORECASE)
            if m_sensor and m_estado:
                sensor = int(m_sensor.group(1))
                estado = m_estado.group(1).upper()
                salvar_leitura(sensor, estado)
                print(f"[SERIAL] Sensor={sensor} Estado={estado}")
    except Exception as e:
        print(f"[SERIAL] Porta indisponível ou erro: {e}")
        print("[SERIAL] Modo simulação ativado.")
        simular_leituras()


def simular_leituras():
    """
    Gera leituras simuladas quando não há Arduino conectado.
    Útil para demonstração e testes.
    """
    import random
    estados_map = {
        "SEGURO":  (701, 1023),
        "ALERTA":  (301,  700),
        "PERIGO":  (0,    300),
    }
    sequencia = (
        ["SEGURO"] * 20 +
        ["ALERTA"] * 10 +
        ["PERIGO"] * 8  +
        ["SILENCIADO"] * 3 +
        ["SEGURO"] * 15
    )
    idx = 0
    while True:
        estado = sequencia[idx % len(sequencia)]
        if estado == "SILENCIADO":
            sensor = random.randint(0, 300)
        else:
            lo, hi = estados_map.get(estado, (400, 700))
            sensor = random.randint(lo, hi)
        salvar_leitura(sensor, estado)
        idx += 1
        time.sleep(2)

# ── API REST ────────────────────────────────────────────────────────────────

@app.route("/api/leituras", methods=["GET"])
def get_leituras():
    """
    Retorna leituras com filtros opcionais:
      ?data=YYYY-MM-DD          → leituras de um dia específico
      ?data_inicio=...&data_fim=... → intervalo de datas
      ?estado=PERIGO            → filtrar por estado
      ?limite=100               → limitar quantidade (padrão: 200)
      ?periodo=hoje|ontem|semana|mes → atalhos de período
    """
    conn = get_db()

    # Parâmetros de filtro
    periodo    = request.args.get("periodo", "")
    data       = request.args.get("data", "")
    data_ini   = request.args.get("data_inicio", "")
    data_fim   = request.args.get("data_fim", "")
    estado     = request.args.get("estado", "").upper()
    limite     = int(request.args.get("limite", 200))

    hoje = datetime.now().date()

    # Atalhos de período
    if periodo == "hoje":
        data = str(hoje)
    elif periodo == "ontem":
        data = str(hoje - timedelta(days=1))
    elif periodo == "semana":
        data_ini = str(hoje - timedelta(days=6))
        data_fim = str(hoje)
    elif periodo == "mes":
        data_ini = str(hoje.replace(day=1))
        data_fim = str(hoje)

    # Construção da query
    where_clauses = []
    params = []

    if data:
        where_clauses.append("DATE(timestamp) = ?")
        params.append(data)
    elif data_ini and data_fim:
        where_clauses.append("DATE(timestamp) BETWEEN ? AND ?")
        params.extend([data_ini, data_fim])

    if estado and estado != "TODOS":
        where_clauses.append("estado = ?")
        params.append(estado)

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    params.append(limite)

    rows = conn.execute(
        f"SELECT id, timestamp, sensor, estado FROM leituras {where_sql} ORDER BY id DESC LIMIT ?",
        params
    ).fetchall()

    conn.close()

    return jsonify([dict(r) for r in rows])


@app.route("/api/leituras/resumo", methods=["GET"])
def get_resumo():
    """
    Retorna estatísticas resumidas do banco:
    total de registros, min/max/média do sensor, contagem por estado.
    """
    conn = get_db()
    stats = conn.execute("""
        SELECT
            COUNT(*)            AS total,
            MIN(sensor)         AS sensor_min,
            MAX(sensor)         AS sensor_max,
            ROUND(AVG(sensor))  AS sensor_avg,
            SUM(CASE WHEN estado='SEGURO'     THEN 1 ELSE 0 END) AS qt_seguro,
            SUM(CASE WHEN estado='ALERTA'     THEN 1 ELSE 0 END) AS qt_alerta,
            SUM(CASE WHEN estado='PERIGO'     THEN 1 ELSE 0 END) AS qt_perigo,
            SUM(CASE WHEN estado='SILENCIADO' THEN 1 ELSE 0 END) AS qt_silenciado
        FROM leituras
    """).fetchone()
    ultima = conn.execute(
        "SELECT timestamp, sensor, estado FROM leituras ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()

    return jsonify({
        "total":         stats["total"],
        "sensor_min":    stats["sensor_min"],
        "sensor_max":    stats["sensor_max"],
        "sensor_avg":    stats["sensor_avg"],
        "qt_seguro":     stats["qt_seguro"],
        "qt_alerta":     stats["qt_alerta"],
        "qt_perigo":     stats["qt_perigo"],
        "qt_silenciado": stats["qt_silenciado"],
        "ultima_leitura": dict(ultima) if ultima else None,
    })


@app.route("/api/leitura", methods=["POST"])
def post_leitura():
    """
    Recebe uma leitura via POST (JSON) para integração com Arduino via HTTP.
    Body: { "sensor": 850, "estado": "SEGURO" }
    """
    data = request.get_json(force=True)
    sensor = int(data.get("sensor", 0))
    estado = str(data.get("estado", "SEGURO")).upper()
    salvar_leitura(sensor, estado)
    return jsonify({"status": "ok", "sensor": sensor, "estado": estado}), 201


@app.route("/api/leituras/datas", methods=["GET"])
def get_datas_disponiveis():
    """Retorna lista de datas que possuem registros no banco."""
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT DATE(timestamp) AS data FROM leituras ORDER BY data DESC LIMIT 60"
    ).fetchall()
    conn.close()
    return jsonify([r["data"] for r in rows])


# ── Servir o Frontend ───────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(FRONTEND, "historico.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(FRONTEND, filename)


# ── Inicialização ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()

    # Inicia thread de leitura serial (ou simulação)
    t = threading.Thread(target=ler_serial, daemon=True)
    t.start()

    print("[SERVER] FireGuard IoT Backend iniciado em http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
