# Requisitos Não Funcionais — Alarme de Incêndio IoT

> Documento complementar ao [README](../README.md) do projeto.
> Cada requisito segue o padrão **RNF-XX** e está classificado pela norma ISO/IEC 25010 (Qualidade de Software).

---

## 1. Desempenho (Performance Efficiency)

| ID | Requisito | Métrica / Critério |
|---|---|---|
| RNF-01 | O sensor de chama deve ser lido em intervalos não superiores a **150 ms** | `INTERVALO_LEITURA_MS ≤ 150` |
| RNF-02 | A transição de estado (LEDs + buzzer) deve ocorrer em até **200 ms** após a detecção de mudança no nível de chama | Tempo entre leitura analógica e acionamento do atuador |
| RNF-03 | A contagem regressiva de silenciamento deve decrementar exatamente a cada **1 segundo (±50 ms)** | Precisão do `delay(1000)` no loop de silenciamento |
| RNF-04 | O sistema deve operar com uso de RAM inferior a **1 KB** para manter compatibilidade com o Arduino UNO (2 KB SRAM) | Uso de `F()` macro para strings em Flash |

---

## 2. Confiabilidade (Reliability)

| ID | Requisito | Métrica / Critério |
|---|---|---|
| RNF-05 | O sistema deve funcionar **24 horas por dia, 7 dias por semana** sem necessidade de reinicialização manual | Operação contínua em loop |
| RNF-06 | Deve existir **histerese de 30 unidades** nos limiares de detecção para evitar oscilação (flickering) entre estados | Constante `HISTERESE = 30` |
| RNF-07 | O botão físico deve possuir tratamento de **debounce** com tempo mínimo de **50 ms** para evitar acionamentos falsos | `DEBOUNCE_MS = 50` |
| RNF-08 | Após o silenciamento, o sistema deve **retomar o monitoramento automaticamente** sem intervenção do usuário | Transição `SILENCIADO → SEGURO` após contagem regressiva |

---

## 3. Segurança Física (Safety)

| ID | Requisito | Métrica / Critério |
|---|---|---|
| RNF-09 | O alarme sonoro no estado PERIGO deve operar a **2500 Hz** — frequência audível e de alta percepção para alertas de emergência | `FREQ_ALARME_HZ = 2500` |
| RNF-10 | O sistema deve fornecer **feedback visual e sonoro simultâneo** no estado de perigo (LEDs vermelhos + buzzer) | Dupla sinalização em `aplicarEstado(PERIGO)` |
| RNF-11 | O silenciamento deve ser temporário (**máximo 10 segundos**) para impedir que o sistema permaneça desativado | `CONTAGEM_REGRESSIVA = 10` |
| RNF-12 | Ao iniciar, o sistema deve assumir o estado **SEGURO** como padrão e realizar a primeira leitura imediatamente | Estado inicial `SEGURO` + flag `primeiraLeitura` |

---

## 4. Usabilidade (Usability)

| ID | Requisito | Métrica / Critério |
|---|---|---|
| RNF-13 | O estado atual deve ser indicado por **cores padronizadas**: verde (seguro), amarelo (alerta) e vermelho (perigo) | LEDs dedicados por estado |
| RNF-14 | O display de 7 segmentos deve exibir a contagem regressiva durante o silenciamento de forma **legível a pelo menos 1 metro de distância** | Dígitos 0-9 com segmentos corretamente mapeados |
| RNF-15 | O Monitor Serial deve exibir **informações de diagnóstico** na inicialização (limiares configurados) e a cada transição de estado | Função `imprimirEstado()` + mensagens no `setup()` |
| RNF-16 | O dashboard web deve ser **responsivo** e funcionar em dispositivos móveis (largura mínima 320 px) e desktops | Media queries CSS e layout flexível |

---

## 5. Manutenibilidade (Maintainability)

| ID | Requisito | Métrica / Critério |
|---|---|---|
| RNF-17 | Os limiares de detecção (`LIMIAR_SEGURO`, `LIMIAR_ALERTA`) devem ser **facilmente configuráveis** via constantes no início do código-fonte | Constantes nomeadas no topo do arquivo `.ino` |
| RNF-18 | O código deve utilizar **máquina de estados** com `enum` para facilitar a adição de novos estados | `enum EstadoSistema { SEGURO, ALERTA, PERIGO, SILENCIADO }` |
| RNF-19 | Cada função deve ter **responsabilidade única** (SRP) para facilitar testes e manutenção | Funções separadas: `calcularEstado`, `aplicarEstado`, `verificarBotao`, etc. |
| RNF-20 | Todos os valores numéricos relevantes (pinos, frequências, tempos) devem ser definidos como **constantes nomeadas** — sem "números mágicos" | Nenhum literal numérico solto no código |

---

## 6. Portabilidade (Portability)

| ID | Requisito | Métrica / Critério |
|---|---|---|
| RNF-21 | O código deve compilar tanto na **Arduino IDE (1.8+)** quanto no **PlatformIO** sem alterações | Arquivo `platformio.ini` + compatibilidade com IDE padrão |
| RNF-22 | O circuito deve ser compatível com placas **Arduino UNO e compatíveis** (ATmega328P, 5 V lógico) | Uso exclusivo de pinos disponíveis no UNO |
| RNF-23 | O dashboard web deve funcionar em **navegadores modernos** (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+) sem dependências externas | HTML5 + CSS3 + JavaScript ES6 vanilla |

---

## 7. Eficiência Energética (Resource Utilization)

| ID | Requisito | Métrica / Critério |
|---|---|---|
| RNF-24 | O sistema deve operar com **alimentação USB (5 V / 500 mA)** sem fonte externa adicional | Consumo total dos componentes dentro do limite USB |
| RNF-25 | Strings de diagnóstico devem ser armazenadas em **memória Flash (PROGMEM)** via macro `F()` para economizar SRAM | Todas as chamadas `Serial.print()` com `F()` |

---

## 8. Escalabilidade (Scalability)

| ID | Requisito | Métrica / Critério |
|---|---|---|
| RNF-26 | A tabela de segmentos do display deve suportar a **adição de novos dígitos ou caracteres** sem reestruturação do código | Array bidimensional `DIGITOS[10][7]` extensível |
| RNF-27 | A arquitetura de estados deve permitir a **adição de novos estados** (ex.: EVACUAÇÃO, MANUTENÇÃO) com impacto mínimo no código existente | Extensão do `enum EstadoSistema` + novo `case` no `switch` |

---

## 9. Observabilidade (Monitorability)

| ID | Requisito | Métrica / Critério |
|---|---|---|
| RNF-28 | O sistema deve registrar toda transição de estado no **Monitor Serial a 9600 baud** | Log automático em `imprimirEstado()` |
| RNF-29 | O dashboard web deve exibir, em tempo real simulado, o **nível do sensor**, o **estado atual** e o **histórico de leituras** | Gráfico de linha + indicadores visuais no frontend |

---

## Rastreabilidade

| Categoria ISO 25010 | Requisitos |
|---|---|
| Performance Efficiency | RNF-01, RNF-02, RNF-03, RNF-04 |
| Reliability | RNF-05, RNF-06, RNF-07, RNF-08 |
| Safety | RNF-09, RNF-10, RNF-11, RNF-12 |
| Usability | RNF-13, RNF-14, RNF-15, RNF-16 |
| Maintainability | RNF-17, RNF-18, RNF-19, RNF-20 |
| Portability | RNF-21, RNF-22, RNF-23 |
| Resource Utilization | RNF-24, RNF-25 |
| Scalability | RNF-26, RNF-27 |
| Monitorability | RNF-28, RNF-29 |

---

*Documento elaborado com base no código-fonte `codigo.ino` (v2) e na norma ISO/IEC 25010:2011.*
