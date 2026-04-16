# 🔥 Projeto IoT: Alarme de Incêndio com Sensor de Chama e Display

Olá! Bem-vindo(a) ao repositório do nosso projeto para a disciplina de **Internet das Coisas (IoT)**. Este trabalho acadêmico apresenta um sistema interativo e funcional de **Alarme de Incêndio com Sensor de Chama e Display**. 

Nosso objetivo com este projeto foi unir conceitos de eletrônica e programação para criar um sistema de monitoramento de segurança responsivo e em tempo real.

## 👥 Equipe Desenvolvedora
Este projeto foi construído com muita dedicação pelos alunos:
* **Richardson da Conceição Ferreira**
* **Wallace Gustavo da Silva**
* **Emanuele De Oliveira Ferreira**
* **Vinicius Silva Da Conceição**

---

## 🛠️ Hardware e Componentes
Para dar vida a este sistema, montamos nosso circuito utilizando os seguintes componentes principais:
* **Microcontrolador**: Placa Arduino UNO.
* **Sensor de Chama**: Responsável pela leitura do ambiente, conectado ao pino analógico `A0`.
* **Botão de Ação**: Utilizado como silenciador de emergência, ligado ao pino digital `2` aproveitando o resistor interno de pull-up do Arduino.
* **Buzzer**: Atua como o alarme sonoro do projeto, conectado ao pino digital `4`.
* **LEDs Indicadores de Status**:
    * 🟢 2 LEDs Verdes (pinos `9` e `10`).
    * 🟡 2 LEDs Amarelos (pinos `7` e `8`).
    * 🔴 2 LEDs Vermelhos (pinos `5` e `6`).
* **Display de 7 Segmentos**: Modelo de Anodo Comum, utilizado para feedback visual de contagem.

---

## ⚙️ Como o Sistema Funciona?
O cérebro do projeto lê constantemente os dados do sensor de chama e traduz o nível de luz infravermelha (fogo) em três estados de alerta:

1. 🟢 **Monitoramento Seguro**: Quando o nível da leitura é superior a `700`, o ambiente está seguro e os LEDs verdes permanecem acesos.
2. 🟡 **Alerta (Chama Detectada)**: Se a leitura cai para um valor entre `300` e `700`, o sistema acende os LEDs amarelos, indicando uma possível detecção inicial.
3. 🔴 **Perigo Crítico**: Se o valor lido for menor ou igual a `300`, o sistema entra em alerta máximo! Os LEDs vermelhos acendem imediatamente e o buzzer começa a apitar em uma frequência contínua de 2500Hz.

### 🔕 Recurso de Silenciamento (Reset)
Pensando na usabilidade, adicionamos uma função de silenciamento. Caso o alarme dispare, o usuário pode pressionar o botão físico para pausar o aviso temporariamente. Ao ser acionado, o sistema realiza as seguintes ações:
* Silencia o alarme principal e exibe no monitor serial a mensagem: *"Alarme Silenciado - Reiniciando em 10s"*.
* O Display de 7 Segmentos inicia uma contagem regressiva visual do número `9` até o `0`.
* A cada segundo da contagem regressiva, o buzzer emite um bipe rápido (50ms) a 2000Hz para avisar que o sistema está em pausa.
* Ao final dos 10 segundos, o sistema retoma seu monitoramento normal automaticamente.

---
*Projeto desenvolvido para fins acadêmicos.*