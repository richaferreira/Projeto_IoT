# FireGuard IoT — Guia de Execução Passo a Passo

> Siga este guia na ordem indicada para executar o projeto sem erros.

---

## Pré-requisitos

Antes de começar, certifique-se de ter instalado:

| Software | Versão mínima | Download |
|---|---|---|
| **Python** | 3.8+ | https://www.python.org/downloads/ |
| **MySQL Server** | 8.0+ | https://dev.mysql.com/downloads/mysql/ |
| **Arduino IDE** | 1.8+ | https://www.arduino.cc/en/software |
| **Google Chrome** ou **Microsoft Edge** | 89+ | https://www.google.com/chrome/ |
| **Git** | qualquer | https://git-scm.com/ |

---

## Parte 1 — Clonar o Repositório

```bash
git clone https://github.com/richaferreira/Projeto_IoT.git
cd Projeto_IoT
```

---

## Parte 2 — Configurar o Banco de Dados MySQL

> **Faça isso apenas uma vez.** O banco e a tabela serão criados automaticamente pelo backend na primeira execução, mas o usuário precisa ser criado manualmente.

### 2.1 Abrir o terminal do MySQL

**Windows:**
```bash
# Abra o "MySQL Command Line Client" no menu Iniciar
# ou via terminal:
mysql -u root -p
```

**Linux / macOS:**
```bash
sudo mysql -u root -p
```

### 2.2 Criar o usuário e conceder permissões

Cole os comandos abaixo dentro do terminal MySQL:

```sql
CREATE USER 'fireguard'@'localhost' IDENTIFIED BY 'fireguard123';
GRANT ALL PRIVILEGES ON fireguard_db.* TO 'fireguard'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Atenção:** O banco `fireguard_db` **não precisa ser criado manualmente** — o backend cria automaticamente na primeira execução.

### 2.3 Verificar se o MySQL está em execução

**Windows:** Abra o "Gerenciador de Serviços" e confirme que o serviço **MySQL80** está iniciado.

**Linux:**
```bash
sudo systemctl status mysql
# Se não estiver rodando:
sudo systemctl start mysql
```

**macOS:**
```bash
brew services list
# Se não estiver rodando:
brew services start mysql
```

---

## Parte 3 — Configurar e Iniciar o Backend (Python)

### 3.1 Acessar a pasta do backend

```bash
cd backend
```

### 3.2 (Recomendado) Criar um ambiente virtual Python

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### 3.3 Instalar as dependências

```bash
pip install -r requirements.txt
```

As dependências instaladas são:
- `flask` — servidor web
- `flask-cors` — permite o frontend acessar a API
- `pyserial` — leitura da porta serial do Arduino
- `mysql-connector-python` — conexão com o banco MySQL

### 3.4 Iniciar o servidor

```bash
# Windows / Linux / macOS
python server.py
```

**Saída esperada no terminal:**
```
[DB] Banco MySQL inicializado: fireguard_db@localhost
[SERIAL] Porta indisponível ou erro: ...
[SERIAL] Modo simulação ativado.
[SERVER] FireGuard IoT Backend iniciado em http://localhost:5000
```

> **Nota:** Se o Arduino não estiver conectado, o backend ativa automaticamente o **modo simulação**, gerando dados fictícios a cada 2 segundos. Isso é normal e esperado.

### 3.5 Verificar se o backend está funcionando

Abra o navegador e acesse:
```
http://localhost:5000/api/leituras/resumo
```

Você deve ver uma resposta JSON com estatísticas do banco. Se aparecer, o backend está funcionando corretamente.

---

## Parte 4 — Carregar o Código no Arduino

> **Pule esta parte** se não tiver o hardware disponível. O backend funciona em modo simulação sem o Arduino.

### 4.1 Abrir o código na Arduino IDE

1. Abra a **Arduino IDE**
2. Vá em **Arquivo > Abrir**
3. Navegue até a pasta do projeto e selecione o arquivo `codigo.ino`

### 4.2 Selecionar a placa e a porta

1. Vá em **Ferramentas > Placa > Arduino AVR Boards > Arduino UNO**
2. Vá em **Ferramentas > Porta** e selecione a porta do Arduino:
   - **Windows:** `COM3`, `COM4`, etc.
   - **Linux:** `/dev/ttyACM0` ou `/dev/ttyUSB0`
   - **macOS:** `/dev/cu.usbmodem*`

### 4.3 Fazer o upload

1. Clique no botão **Upload** (seta para a direita → ) ou pressione `Ctrl+U`
2. Aguarde a mensagem **"Carregamento concluído"**

### 4.4 Verificar a saída serial

1. Vá em **Ferramentas > Monitor Serial**
2. Configure o baud rate para **9600**
3. Você deve ver mensagens como:
   ```
   === Alarme de Incendio IoT ===
   Sensor: Chama Infravermelho (A0)
   Sistema pronto - monitorando...

   Sensor: 850 | Estado: SEGURO
   ```

### 4.5 Informar a porta serial ao backend

Para que o backend leia os dados reais do Arduino, defina a variável de ambiente `SERIAL_PORT` antes de iniciar o servidor:

**Windows (CMD):**
```cmd
set SERIAL_PORT=COM3
python server.py
```

**Windows (PowerShell):**
```powershell
$env:SERIAL_PORT="COM3"
python server.py
```

**Linux / macOS:**
```bash
SERIAL_PORT=/dev/ttyACM0 python3 server.py
```

> Substitua `COM3` ou `/dev/ttyACM0` pela porta real do seu Arduino.

---

## Parte 5 — Acessar o Frontend

Com o backend em execução, abra o navegador (Chrome ou Edge) e acesse:

### 5.1 Tela de Histórico (recomendado — via backend)

```
http://localhost:5000
```
ou diretamente:
```
http://localhost:5000/historico.html
```

Esta página consulta o banco de dados MySQL e exibe os registros históricos com filtros.

### 5.2 Dashboard em Tempo Real com Arduino (Web Serial API)

> Requer Arduino conectado e código carregado (Parte 4).

1. Abra o Chrome ou Edge e acesse:
   ```
   http://localhost:5000/serial.html
   ```
2. Clique no botão **"🔌 Conectar ao Arduino"**
3. Na janela que aparecer, selecione a porta serial do Arduino
4. O dashboard começa a exibir os dados em tempo real

### 5.3 Dashboard de Simulação (sem Arduino)

```
http://localhost:5000/index.html
```

Use o slider para simular diferentes leituras do sensor e testar todos os estados do sistema.

---

## Parte 6 — Usar a Tela de Histórico

Com o backend rodando e dados sendo gerados (simulados ou reais):

1. Acesse `http://localhost:5000`
2. Use os **atalhos de período**: Hoje / Ontem / Últimos 7 dias / Este mês
3. Ou defina um **intervalo de datas** personalizado
4. Filtre por **estado**: SEGURO, ALERTA, PERIGO ou SILENCIADO
5. Clique em **"🔍 Consultar"**
6. Veja os cards de estatísticas, o gráfico e a tabela de registros
7. Clique em **"⬇ Exportar CSV"** para baixar os dados filtrados

---

## Solução de Problemas

| Problema | Causa provável | Solução |
|---|---|---|
| `ModuleNotFoundError: No module named 'flask'` | Dependências não instaladas | Execute `pip install -r requirements.txt` |
| `mysql.connector.errors.ProgrammingError: Access denied` | Usuário MySQL não criado | Refaça a Parte 2 do guia |
| `mysql.connector.errors.InterfaceError: Can't connect` | MySQL não está em execução | Inicie o serviço MySQL (Parte 2.3) |
| Backend inicia mas não salva dados | Arduino não conectado | Normal — modo simulação está ativo |
| Botão "Conectar" não aparece ou não funciona | Navegador não suportado | Use Chrome 89+ ou Edge 89+ |
| Nenhuma porta aparece na lista serial | Driver do Arduino não instalado | Instale o driver CH340 ou FTDI |
| Dados não aparecem no dashboard serial | Baud rate incorreto | Confirme que está em **9600** no `serial.html` |
| `http://localhost:5000` não abre | Backend não está rodando | Execute `python server.py` na pasta `backend/` |
| Página de histórico carrega mas sem dados | Banco vazio ou filtro muito restrito | Aguarde o modo simulação popular o banco (≈ 30s) ou clique em "Todos" |

---

## Resumo Rápido

```
1. mysql -u root -p  →  CREATE USER + GRANT (só uma vez)
2. cd backend  →  pip install -r requirements.txt
3. python server.py  →  aguardar "[SERVER] iniciado em http://localhost:5000"
4. Abrir Chrome/Edge  →  http://localhost:5000
```

---

*FireGuard IoT — Richardson, Wallace, Emanuele, Vinícius · Universidade de Vassouras, 2025*
