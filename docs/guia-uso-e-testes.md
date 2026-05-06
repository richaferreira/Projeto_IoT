# Guia de Uso e Relatório de Testes — Alarme de Incêndio IoT

> Documento com instruções de uso do dashboard no navegador, relatório de testes e evidências visuais.

---

## Sumário

1. [Como Usar no Navegador](#como-usar-no-navegador)
2. [Versão de Simulação](#versão-de-simulação)
3. [Versão com Arduino Real (Web Serial API)](#versão-com-arduino-real-web-serial-api)
4. [Relatório de Testes](#relatório-de-testes)
5. [Evidências Visuais](#evidências-visuais)
6. [Vídeo de Demonstração](#vídeo-de-demonstração)

---

## Como Usar no Navegador

O dashboard funciona nos navegadores **Google Chrome** e **Microsoft Edge** (versão 89 ou superior). Não é necessário instalar nenhuma dependência — basta abrir o arquivo HTML diretamente.

### Navegadores Suportados

| Navegador        | Simulação (`index.html`) | Conexão Serial (`serial.html`) |
|------------------|:------------------------:|:------------------------------:|
| Google Chrome 89+ | Sim                     | Sim                            |
| Microsoft Edge 89+| Sim                     | Sim                            |
| Firefox           | Sim                     | Não (Web Serial não suportada) |
| Safari            | Sim                     | Não (Web Serial não suportada) |

### Como verificar a versão do navegador

- **Chrome**: Clique em `⋮` → `Ajuda` → `Sobre o Google Chrome`
- **Edge**: Clique em `⋯` → `Ajuda e comentários` → `Sobre o Microsoft Edge`

---

## Versão de Simulação

A versão de simulação (`index.html`) funciona em qualquer navegador moderno, sem necessidade de Arduino conectado.

### Passo a passo

1. Abra o navegador (Chrome ou Edge)
2. Na barra de endereço, digite o caminho do arquivo:

   **Windows:**
   ```
   file:///C:/Users/SeuUsuario/IOT/frontend/index.html
   ```

   **Linux:**
   ```
   file:///home/usuario/IOT/frontend/index.html
   ```

   **macOS:**
   ```
   file:///Users/usuario/IOT/frontend/index.html
   ```

3. O dashboard abre imediatamente com o estado **SEGURO** e sensor em 850

### Funcionalidades da Simulação

| Funcionalidade | Descrição |
|----------------|-----------|
| **Painel de Status** | Badge colorido com estado atual (SEGURO/ALERTA/PERIGO/SILENCIADO) |
| **LEDs Virtuais** | 6 LEDs que replicam os LEDs físicos do circuito |
| **Gauge (Velocímetro)** | Ponteiro animado com faixas de cor e ticks numéricos |
| **Gráfico de Histórico** | Últimas 200 leituras com faixas de limiares |
| **Display 7 Segmentos** | Exibe contagem regressiva durante o silenciamento |
| **Diagrama de Estados** | Destaca o estado ativo da máquina de estados |
| **Controles** | Slider do sensor, botões de preset (Seguro/Alerta/Perigo), silenciamento |
| **Monitor Serial** | Réplica da saída do `Serial.print()` do Arduino |
| **Buzzer Virtual** | Som simulado via Web Audio API |

### Como testar cada estado

- **SEGURO**: Clique em "Simular Seguro" (sensor = 850, LEDs verdes)
- **ALERTA**: Clique em "Simular Alerta" (sensor = 500, LEDs amarelos)
- **PERIGO**: Clique em "Simular Perigo" (sensor = 150, LEDs vermelhos + buzzer)
- **SILENCIADO**: Após entrar em PERIGO, clique em "Silenciar Alarme" (contagem regressiva de 10s)
- **Modo Automático**: Marque o checkbox para variação aleatória do sensor

---

## Versão com Arduino Real (Web Serial API)

A versão serial (`serial.html`) conecta diretamente ao Arduino via porta USB usando a **Web Serial API**.

### Requisitos

- **Navegador**: Google Chrome 89+ ou Microsoft Edge 89+
- **Arduino**: Conectado via cabo USB ao computador
- **Código**: `codigo.ino` carregado no Arduino (saída serial a 9600 baud)

### Passo a passo

1. **Conecte o Arduino** via cabo USB ao computador
2. **Faça upload** do código `codigo.ino` no Arduino (via Arduino IDE ou PlatformIO)
3. **Abra o navegador** (Chrome ou Edge)
4. Na barra de endereço, digite:

   **Windows:**
   ```
   file:///C:/Users/SeuUsuario/IOT/frontend/serial.html
   ```

   **Linux:**
   ```
   file:///home/usuario/IOT/frontend/serial.html
   ```

5. Clique no botão **"🔌 Conectar ao Arduino"**
6. Na janela que aparecer, **selecione a porta serial** do Arduino:
   - **Windows**: geralmente aparece como `COM3`, `COM4`, etc.
   - **Linux**: geralmente aparece como `/dev/ttyACM0` ou `/dev/ttyUSB0`
   - **macOS**: geralmente aparece como `/dev/cu.usbmodem*`
7. O indicador muda para **verde** e o dashboard começa a receber dados em tempo real

### Configurações

- **Baud Rate**: Seletor com opções de 4800 a 115200 (padrão: 9600, igual ao `codigo.ino`)
- **Desconectar**: Clique novamente no botão para encerrar a conexão

### Formato dos dados esperados

O Arduino deve enviar dados no formato:
```
Sensor: XXX | Estado: YYY (detalhe)
```

Exemplo:
```
Sensor: 850 | Estado: SEGURO (verde)
Sensor: 500 | Estado: ALERTA (amarelo)
Sensor: 150 | Estado: PERIGO (vermelho + buzzer)
Alarme silenciado - reiniciando em 10s
Monitoramento retomado.
```

### Solução de problemas

| Problema | Solução |
|----------|---------|
| Botão "Conectar" não funciona | Verifique se está usando Chrome 89+ ou Edge 89+ |
| Nenhuma porta aparece na lista | Verifique se o Arduino está conectado via USB e os drivers estão instalados |
| Dados não aparecem | Verifique se o `codigo.ino` está carregado e o baud rate está correto (9600) |
| "Navegador não suportado" | Use Chrome ou Edge (Firefox e Safari não suportam Web Serial API) |

---

## Relatório de Testes

### Ambiente de teste

- **Método**: Frontend servido via `python3 -m http.server 8080`
- **Navegador**: Google Chrome (ambiente Linux)
- **Data**: Abril 2026

### Resultados

| # | Teste | Resultado | Descrição |
|---|-------|:---------:|-----------|
| 1 | Off-by-one na contagem regressiva | **PASSOU** | `display7Hint` mostra `Contagem: 2s` quando o display 7-segmentos exibe o dígito `2` — valores agora correspondem corretamente |
| 2 | Serial page sem Arduino | **PASSOU** | Página carrega com status "Desconectado", badge "AGUARDANDO", gauge em 0, baud rate 9600, sem erros JavaScript |
| 3 | Navegação entre páginas | **PASSOU** | Links no footer de `index.html` → `serial.html` e `serial.html` → `index.html` funcionam corretamente |
| 4 | Console JavaScript | **PASSOU** | Nenhum erro no console em ambas as páginas |

### Não testado

- **Conexão serial real com Arduino**: Não foi possível testar a conexão USB/serial pois o ambiente de teste não possui hardware Arduino conectado. A interface foi validada visualmente no estado "desconectado".

---

## Evidências Visuais

### Teste 1 — Correção do off-by-one na contagem regressiva

O display 7-segmentos mostra o dígito **2** e o texto abaixo mostra **"Contagem: 2s"** — os valores agora correspondem corretamente.

![Correção off-by-one: dígito 2 no display, hint "Contagem: 2s"](https://app.devin.ai/attachments/f8d89a4f-ed5a-4ca5-a6c5-258c7c87de3d/screenshot_b186efef0fa549e1894c018be76376a9.png)

### Teste 1 (continuação) — Silenciamento ativado com contagem

Estado SILENCIADO com contagem regressiva em andamento. O hint "Contagem: 7s" aparece corretamente sincronizado com o display.

![Silenciamento com contagem: hint "Contagem: 7s"](https://app.devin.ai/attachments/3c688284-1105-4637-a1e9-29c5fa39489c/screenshot_068b91015b3142ce82d4451feaee06d8.png)

### Teste 2 — Página serial sem Arduino conectado

A página `serial.html` carrega corretamente com indicador vermelho "Desconectado", badge "AGUARDANDO", gauge em posição 0, seletor de baud rate em 9600 e botão "Conectar ao Arduino".

![Serial page: Desconectado, AGUARDANDO, gauge em 0](https://app.devin.ai/attachments/1492b61d-c928-4ed2-a991-fc61f2e3106a/screenshot_645d206f3be7453d8b9786258fb73ef1.png)

### Teste 3 — Navegação entre páginas

Após clicar no link "Abrir versão de simulação" no footer do `serial.html`, a página `index.html` carrega corretamente.

![Navegação de volta à simulação](https://app.devin.ai/attachments/baf4e5e2-0cf9-474a-9b60-64e2c9249dd1/screenshot_32c7a1726b9e4d55845dbb341aa56520.png)

---

## Vídeo de Demonstração

Um vídeo gravado durante a sessão de testes demonstra todas as funcionalidades do dashboard:

🎬 **[Assistir vídeo de demonstração](https://app.devin.ai/attachments/d9ba68b1-2915-4dad-9981-affc04acb6a7/rec-defba51f-2e8d-47cb-9fee-34d4f4990f4a-edited.mp4)**

O vídeo inclui:
- Dashboard de simulação com transições de estado (SEGURO → PERIGO → SILENCIADO)
- Correção do off-by-one na contagem regressiva (display 7-segmentos sincronizado com o hint)
- Página serial com estado "desconectado"
- Navegação entre as duas versões do dashboard

---

*Documento gerado automaticamente durante sessão de testes — [Sessão Devin](https://app.devin.ai/sessions/8670edde86a34c1e88ed923f7a681206)*
