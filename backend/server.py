"""
=============================================================================
FireGuard IoT — Backend (Trabalho 2)
Servidor Flask com banco de dados MySQL e API REST
=============================================================================
Funcionalidades:
  - Recebe leituras do Arduino via porta serial (ou simulação)
  - Armazena cada leitura no banco de dados MySQL
  - Expõe API REST para o frontend consultar o histórico com filtros
=============================================================================
Formato serial esperado:
  "Sensor: 850 | Estado: SEGURO"
=============================================================================
Configuração do banco MySQL:
  Variáveis de ambiente (ou valores padrão abaixo):
    MYSQL_HOST     = localhost
    MYSQL_PORT     = 3306
    MYSQL_USER     = fireguard
    MYSQL_PASSWORD = fireguard123
    MYSQL_DATABASE = fireguard_db
=============================================================================
"""

import threading
import time
import re
import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# ── Configurações ──────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
FRONTEND    = os.path.join(BASE_DIR, "..", "frontend")
SERIAL_PORT = os.environ.get("SERIAL_PORT", "")
BAUD_RATE   = 9600

# Configurações do MySQL
DB_CONFIG = {
    "host":     os.environ.get("MYSQL_HOST",     "localhost"),
    "port":     int(os.environ.get("MYSQL_PORT", "3306")),
    "user":     os.environ.get("MYSQL_USER",     "fireguard"),
    "password": os.environ.get("MYSQL_PASSWORD", "fireguard123"),
    "database": os.environ.get("MYSQL_DATABASE", "fireguard_db"),
}

app = Flask(__name__, static_folder=FRONTEND)
CORS(app)

# ── Banco de Dados (MySQL) ──────────────────────────────────────────────────

def get_db():
    """Retorna conexão com o banco MySQL."""
    import mysql.connector
    conn = mysql.connector.connect(**DB_CONFIG)
    return conn


def init_db():
    """Cria o banco e a tabela se não existirem."""
    import mysql.connector
    # Conecta sem selecionar banco para poder criá-lo
    cfg = {k: v for k, v in DB_CONFIG.items() if k != "database"}
    conn = mysql.connector.connect(**cfg)
    cursor = conn.cursor()
    cursor.execute(
        f"CREATE DATABASE IF NOT EXISTS `{DB_CONFIG['database']}` "
        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )
    cursor.execute(f"USE `{DB_CONFIG['database']}`")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leituras (
            id        INT          NOT NULL AUTO_INCREMENT,
            timestamp DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sensor    INT          NOT NULL,
            estado    VARCHAR(20)  NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_timestamp (timestamp),
            INDEX idx_estado    (estado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    conn.commit()
    cursor.close()
    conn.close()
    print(f"[DB] Banco MySQL inicializado: {DB_CONFIG['database']}@{DB_CONFIG['host']}")


def salvar_leitura(sensor: int, estado: str):
    """Insere uma leitura no banco MySQL."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO leituras (timestamp, sensor, estado) VALUES (%s, %s, %s)",
        (ts, sensor, estado)
    )
    conn.commit()
    cursor.close()
    conn.close()

# ── Leitura Serial ──────────────────────────────────────────────────────────

def ler_serial():
    """
    Thread que lê a porta serial do Arduino e salva no banco.
    Formato esperado: 'Sensor: 850 | Estado: SEGURO'
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
            m_estado  = re.search(r"Estado:\s*(\w+)", linha, re.IGNORECASE)
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
    """Gera leituras simuladas quando não há Arduino conectado."""
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
      ?data=YYYY-MM-DD              → leituras de um dia específico
      ?data_inicio=...&data_fim=... → intervalo de datas
      ?estado=PERIGO                → filtrar por estado
      ?limite=100                   → limitar quantidade (padrão: 200)
      ?periodo=hoje|ontem|semana|mes → atalhos de período
    """
    periodo  = request.args.get("periodo", "")
    data     = request.args.get("data", "")
    data_ini = request.args.get("data_inicio", "")
    data_fim = request.args.get("data_fim", "")
    estado   = request.args.get("estado", "").upper()
    limite   = int(request.args.get("limite", 200))

    hoje = datetime.now().date()

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

    where_clauses = []
    params = []

    if data:
        where_clauses.append("DATE(timestamp) = %s")
        params.append(data)
    elif data_ini and data_fim:
        where_clauses.append("DATE(timestamp) BETWEEN %s AND %s")
        params.extend([data_ini, data_fim])

    if estado and estado != "TODOS":
        where_clauses.append("estado = %s")
        params.append(estado)

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    params.append(limite)

    conn   = get_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        f"SELECT id, timestamp, sensor, estado FROM leituras "
        f"{where_sql} ORDER BY id DESC LIMIT %s",
        params
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    # Converte datetime para string para serialização JSON
    for r in rows:
        if isinstance(r.get("timestamp"), datetime):
            r["timestamp"] = r["timestamp"].strftime("%Y-%m-%d %H:%M:%S")

    return jsonify(rows)


@app.route("/api/leituras/resumo", methods=["GET"])
def get_resumo():
    """
    Retorna estatísticas resumidas do banco:
    total de registros, min/max/média do sensor, contagem por estado.
    """
    conn   = get_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            COUNT(*)                              AS total,
            MIN(sensor)                           AS sensor_min,
            MAX(sensor)                           AS sensor_max,
            ROUND(AVG(sensor))                    AS sensor_avg,
            SUM(CASE WHEN estado='SEGURO'     THEN 1 ELSE 0 END) AS qt_seguro,
            SUM(CASE WHEN estado='ALERTA'     THEN 1 ELSE 0 END) AS qt_alerta,
            SUM(CASE WHEN estado='PERIGO'     THEN 1 ELSE 0 END) AS qt_perigo,
            SUM(CASE WHEN estado='SILENCIADO' THEN 1 ELSE 0 END) AS qt_silenciado
        FROM leituras
    """)
    stats = cursor.fetchone()
    cursor.execute(
        "SELECT timestamp, sensor, estado FROM leituras ORDER BY id DESC LIMIT 1"
    )
    ultima = cursor.fetchone()
    cursor.close()
    conn.close()

    if ultima and isinstance(ultima.get("timestamp"), datetime):
        ultima["timestamp"] = ultima["timestamp"].strftime("%Y-%m-%d %H:%M:%S")

    return jsonify({
        "total":          stats["total"],
        "sensor_min":     stats["sensor_min"],
        "sensor_max":     stats["sensor_max"],
        "sensor_avg":     stats["sensor_avg"],
        "qt_seguro":      stats["qt_seguro"],
        "qt_alerta":      stats["qt_alerta"],
        "qt_perigo":      stats["qt_perigo"],
        "qt_silenciado":  stats["qt_silenciado"],
        "ultima_leitura": ultima,
    })


@app.route("/api/leitura", methods=["POST"])
def post_leitura():
    """
    Recebe uma leitura via POST (JSON).
    Body: { "sensor": 850, "estado": "SEGURO" }
    """
    data   = request.get_json(force=True)
    sensor = int(data.get("sensor", 0))
    estado = str(data.get("estado", "SEGURO")).upper()
    salvar_leitura(sensor, estado)
    return jsonify({"status": "ok", "sensor": sensor, "estado": estado}), 201


@app.route("/api/leituras/datas", methods=["GET"])
def get_datas_disponiveis():
    """Retorna lista de datas que possuem registros no banco."""
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT DISTINCT DATE(timestamp) AS data FROM leituras "
        "ORDER BY data DESC LIMIT 60"
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify([str(r[0]) for r in rows])


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

    t = threading.Thread(target=ler_serial, daemon=True)
    t.start()

    print("[SERVER] FireGuard IoT Backend iniciado em http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
