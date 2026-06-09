# Requisitos do Sistema: FireGuard IoT (Trabalho 2)

Este documento lista os requisitos funcionais (RF) e não funcionais (RNF) do sistema completo de Alarme de Incêndio IoT, contemplando tanto o hardware (Arduino) quanto o software (Backend Python e Frontend Web).

## 1. Requisitos Funcionais (RF)

Os requisitos funcionais descrevem o que o sistema deve fazer, ou seja, suas funcionalidades.

| ID | Requisito | Descrição |
|---|---|---|
| **RF-01** | **Leitura do Sensor** | O sistema deve ler continuamente os valores analógicos (0 a 1023) do sensor de chama infravermelho. |
| **RF-02** | **Classificação de Estado** | O sistema deve classificar a leitura do sensor em três estados: SEGURO (>700), ALERTA (301-700) e PERIGO (<=300). |
| **RF-03** | **Feedback Visual Local** | O hardware deve acender LEDs correspondentes ao estado atual: Verde (Seguro), Amarelo (Alerta) e Vermelho (Perigo). |
| **RF-04** | **Feedback Sonoro Local** | O hardware deve ativar um alarme sonoro (buzzer) contínuo quando o estado for PERIGO. |
| **RF-05** | **Silenciamento Temporário** | O usuário deve poder silenciar o alarme sonoro temporariamente (10 segundos) pressionando um botão físico. |
| **RF-06** | **Contagem Regressiva Visual** | Durante o silenciamento, o hardware deve exibir uma contagem regressiva de 9 a 0 em um display de 7 segmentos. |
| **RF-07** | **Transmissão de Dados** | O hardware deve transmitir os dados do sensor e o estado atual via porta serial USB para um computador conectado. |
| **RF-08** | **Recepção e Armazenamento (Backend)** | O backend (servidor) deve receber os dados da porta serial e armazená-los em um banco de dados relacional (**MySQL**), incluindo data, hora, valor do sensor e estado. |
| **RF-09** | **Dashboard em Tempo Real** | O frontend deve exibir um dashboard em tempo real com os dados do sensor, estado atual, LEDs virtuais e gráfico de variação. |
| **RF-10** | **Consulta de Histórico** | O frontend deve possuir uma tela específica para consulta dos dados históricos armazenados no banco de dados. |
| **RF-11** | **Filtros de Consulta** | A tela de histórico deve permitir filtrar os dados por: data específica, intervalo de datas (início e fim) e estado (Seguro, Alerta, Perigo, Silenciado). |
| **RF-12** | **Estatísticas Resumidas** | A tela de histórico deve exibir um resumo dos dados filtrados: total de leituras, quantidade por estado e valores mínimo, máximo e médio do sensor. |
| **RF-13** | **Exportação de Dados** | O usuário deve poder exportar os dados consultados no histórico para um arquivo no formato CSV. |

## 2. Requisitos Não Funcionais (RNF)

Os requisitos não funcionais descrevem como o sistema deve operar, abordando aspectos de qualidade, desempenho, segurança e usabilidade (baseados na norma ISO/IEC 25010).

| ID | Requisito | Categoria | Descrição / Métrica |
|---|---|---|---|
| **RNF-01** | **Desempenho (Leitura)** | Eficiência | O sensor de chama deve ser lido em intervalos não superiores a 150 ms. |
| **RNF-02** | **Desempenho (Resposta)** | Eficiência | A transição de estado local (LEDs + buzzer) deve ocorrer em até 200 ms após a detecção. |
| **RNF-03** | **Confiabilidade (Histerese)** | Confiabilidade | Deve existir histerese de 30 unidades nos limiares de detecção para evitar oscilação (flickering) entre estados. |
| **RNF-04** | **Confiabilidade (Debounce)** | Confiabilidade | O botão físico deve possuir tratamento de debounce via software (mínimo 50 ms) para evitar acionamentos falsos. |
| **RNF-05** | **Segurança (Alarme)** | Segurança | O alarme sonoro no estado PERIGO deve operar a 2500 Hz, frequência audível e de alta percepção. |
| **RNF-06** | **Segurança (Recuperação)** | Segurança | Após o silenciamento de 10s, o sistema deve retomar o monitoramento automaticamente. |
| **RNF-07** | **Usabilidade (Interface)** | Usabilidade | A interface gráfica (Frontend) deve ser responsiva, adaptando-se a telas de computadores e dispositivos móveis. |
| **RNF-08** | **Usabilidade (Feedback)** | Usabilidade | O sistema deve fornecer feedback visual claro e padronizado (cores) tanto no hardware quanto na interface gráfica. |
| **RNF-09** | **Portabilidade (Hardware)** | Portabilidade | O código embarcado deve ser compatível com placas Arduino UNO (ATmega328P) e compilar na Arduino IDE e PlatformIO. |
| **RNF-10** | **Portabilidade (Software)** | Portabilidade | O Backend deve ser desenvolvido em Python (Flask) e o banco de dados deve ser relacional (**MySQL**), atendendo ao critério de armazenamento eficiente para fins históricos. |
| **RNF-11** | **Portabilidade (Navegador)** | Portabilidade | O Dashboard em tempo real via Web Serial API deve funcionar em navegadores baseados em Chromium (Chrome 89+, Edge 89+). |
| **RNF-12** | **Eficiência (Recursos)** | Eficiência | O código Arduino deve utilizar a macro `F()` para armazenar strings constantes na memória Flash, mantendo o uso de SRAM abaixo de 1 KB. |
| **RNF-13** | **Manutenibilidade** | Manutenibilidade | O código-fonte deve ser modularizado, com funções de responsabilidade única (SRP) e uso de constantes nomeadas em vez de "números mágicos". |
