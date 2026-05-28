# 🔥 ALARME IOT — REDESIGN INDUSTRIAL/CYBER

Dashboard completamente reformulado com estética industrial, design denso e informativo, e uma hierarquia visual muito mais forte.

## ✨ Principais Melhorias

### 🎨 Visual & Estética

- **Tema Industrial Escuro**: Grid de células que simula um painel de monitoramento de emergência real
- **Tipografia Dramática**:
  - `Share Tech Mono` para dados e valores (aparência "máquina")
  - `Barlow Condensed` para títulos e rótulos (impacto visual)
- **Scanlines Sutis**: Efeito de textura retro nos dados sem prejudicar leitura
- **Paleta Funcional**: Cada cor carrega significado
  - Verde (`#00ff41`) = SEGURO
  - Amarelo (`#ffff00`) = ALERTA
  - Vermelho (`#ff0033`) = PERIGO
  - Ciano (`#00d4ff`) = DESTAQUE/SISTEMA

### 🏗️ Hierarquia & Layout

- **Grid 4×N**: Layout estruturado em 4 colunas com células bem definidas
- **Sem Arredondamentos**: Bordas retas (90°) para visual industrial
- **Sem Sombras**: Apenas espaço de 1px entre células para separação
- **Estado Global no Topo**: Diagrama de estados sempre visível no header, mostrando transições
- **Status Compacto**: Badge de estado reduzido, animação de pulso apenas no PERIGO

### 📊 Dados & Informatividade

- **Gauge com Canvas**: Agulha suavizada, zonas coloridas, ticks e marcadores de limiar
- **Stats Integradas**: Min/Med/Max logo abaixo do gauge
- **Relógio em Tempo Real**: No header, sincronizado com sistema
- **Timestamps Automáticos**: Cada log serial inclui hora/minuto/segundo
- **Todos os Controles Compactos**: Conexão, baud rate, botões em uma célula única

### 🔊 Novas Funcionalidades

✅ **Exportação de Dados**
   - Download em JSON (estruturado, com metadados)
   - Download em CSV (para análise em planilha)
   - Inclui histórico, stats e log completo

✅ **Configurações Persistentes**
   - localStorage para baud rate, tema, preferências de som/notificação
   - Carregamento automático ao abrir

✅ **Notificações Sonoras**
   - Beep curto ao conectar
   - Beep de aviso (600→800 Hz) ao entrar em ALERTA
   - Beep de alarme triplo (1000→1200 Hz) ao entrar em PERIGO
   - Toggle para ativar/desativar

✅ **Notificações do Sistema**
   - Browser notifications quando estado crítico
   - Permissão solicitada automaticamente
   - Toggle para ativar/desativar

✅ **Tema Claro**
   - Variáveis CSS revertidas para tema light
   - Toggle no painel de configurações
   - Persistido em localStorage

✅ **Responsividade Melhorada**
   - 4 colunas em desktop (>1200px)
   - 3 colunas em tablets (768px - 1200px)
   - 2 colunas em mobile (480px - 768px)
   - 1 coluna em phones (<480px)

## 📱 Estrutura do Grid

```
┌─────────────────────────────────────────────────────┐
│  HEADER: Logo + Relógio | Diagrama de Estados        │
├─────────────────────────────────────────────────────┤
│ STATUS  │ CONEXÃO │ GAUGE   │ STATS                 │
├─────────┼─────────┼─────────┼──────────────────────┤
│ LEDs    │ DISPLAY │ LIMIAR  │ CONFIGURAÇÕES        │
├─────────────────────────────────────────────────────┤
│ GRÁFICO (full-width)                                │
├─────────────────────────────────────────────────────┤
│ LOG SERIAL (full-width)                             │
└─────────────────────────────────────────────────────┘
```

## 🚀 Como Usar

### Conectar ao Arduino

1. Selecione o **Baud Rate** no painel de CONEXÃO
2. Clique em **CONECTAR**
3. Selecione a porta USB do Arduino no diálogo do navegador
4. Aguarde a conexão ser estabelecida (LED verde)

### Exportar Dados

1. Clique em **EXPORTAR**
2. Dois arquivos serão baixados:
   - `iot_data_TIMESTAMP.json` — Dados estruturados
   - `iot_data_TIMESTAMP.csv` — Para análise em Excel/Sheets

### Configurar Preferências

- **Sons de Alerta**: Ligar/Desligar beeps do sistema
- **Notificações**: Ligar/Desligar notificações do navegador
- **Tema Claro**: Alternar para tema claro (persiste em localStorage)

## 🎯 Design Decisions

### Por que sem sombras?
Sombras enfraquecem a sensação de painel industrial duro. O visual é reforçado por bordas e espaço.

### Por que tipografia mista?
- `Share Tech Mono` soa "computadorizada" e é legível em dados numéricos
- `Barlow Condensed` é dramática e moderna para títulos, criando contraste

### Por que grid rígido?
Simula monitores CRT antigos e painéis de controle reais, onde dados são organizados em células.

### Por que sem arredondamentos?
Ângulos de 90° reforçam o aspecto industrial e cyberpunk do design.

## 📋 Compatibilidade

- **Browser**: Chrome 89+, Edge 89+, Opera 75+ (Web Serial API)
- **Mobile**: Parcialmente suportado (Web Serial não funciona em Android)
- **Temas**: Escuro (padrão) e Claro (CSS customizável)

## 🔧 Customização CSS

Edite as variáveis no `:root` em `style.css`:

```css
:root {
  --bg-main: #0a0e1a;      /* Fundo principal */
  --bg-cell: #1a1f35;      /* Fundo das células */
  --accent: #00d4ff;       /* Cor destaque */
  --green: #00ff41;        /* Seguro */
  --yellow: #ffff00;       /* Alerta */
  --red: #ff0033;          /* Perigo */
  /* ... mais cores ... */
}
```

## 📂 Arquivos

```
frontend/
├── serial.html    (HTML com novo layout grid)
├── serial.js      (JS com timestamps, localStorage, sons)
└── style.css      (CSS industrial com 900+ linhas)
```

## 🎬 Demo Esperado

```
[SYS] Sistema pronto
[SYS] Conectado (9600 baud)
[00:15:23] Sensor: 850 | Estado: SEGURO (verde)
[00:15:24] Sensor: 720 | Estado: SEGURO (verde)
[00:15:25] Sensor: 450 | Estado: ALERTA (amarelo)
[00:15:26] Alarme silenciado - reiniciando em 10s
[00:15:27] Contagem: 9s
[00:15:36] Monitoramento retomado
```

## 🚀 Próximas Melhorias (Roadmap)

- [ ] Gráfico interativo (zoom, pan, pan)
- [ ] Persistência de histórico em IndexedDB
- [ ] Exportação em PDF
- [ ] Dashboard em tempo real em nuvem
- [ ] Suporte para múltiplos sensores
- [ ] Alertas por email

---

**Projeto Acadêmico** — Internet das Coisas (IoT)  
Richardson • Wallace • Emanuele • Vinícius
