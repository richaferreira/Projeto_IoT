// PROJETO: Alarme de Incêndio com Sensor de Chama e Display
//
//--- MAPEAMENTO DOS PINOS DO DISPLAY (CONFORME SUA DESCRIÇÃO)
// Parte de cima: 12, 13, (VCC), 11, 3
// Parte de baixo: A1, A2, (GND/NC), A4, A3
const int segA = 13;  // 2º pino de cima
const int segB = 3;   // 5º pino de cima
const int segC = A4;  // 4º pino de baixo
const int segD = A2;  // 2º pino de baixo
const int segE = A1;  // 1º pino de baixo
const int segF = 12;  // 1º pino de cima
const int segG = 11;  // 4º pino de cima
const int segDP = A3; // 5º pino de baixo (Ponto)

//--- OUTROS PINOS
const int pinoSensorChama = A0;
const int pinoBotao = 2;
const int pinoBuzzer = 4;

//--- LEDs de Indicação
const int ledVd1 = 10; const int ledVd2 = 9;
const int ledAm1 = 8;  const int ledAm2 = 7;
const int ledVm1 = 6;  const int ledVm2 = 5;

//--- VARIÁVEIS DE CONTROLE
bool alarmeSilenciado = false;
bool estadoAnteriorBotao = HIGH; // Pull-up repousa em HIGH
unsigned long tempoAnterior = 0;
const long intervaloLeitura = 150;

void setup() {
  Serial.begin(9600);
  
  // Configuração de Entradas
  pinMode(pinoSensorChama, INPUT);
  pinMode(pinoBotao, INPUT_PULLUP); // Usa resistor interno do Arduino
  
  // Configuração de Saidas (LEDs e Buzzer)
  for(int i=4; i<=10; i++) {
    pinMode(i, OUTPUT);
  }
  
  // Configuração de Saídas (Display)
  pinMode(segA, OUTPUT); pinMode(segB, OUTPUT); pinMode(segC, OUTPUT);
  pinMode(segD, OUTPUT); pinMode(segE, OUTPUT); pinMode(segF, OUTPUT);
  pinMode(segG, OUTPUT); pinMode(segDP, OUTPUT);

  desligarDisplay();
  Serial.println("Sistema Pronto - Monitorando Chama...");
}

void loop() {
  //--- LÓGICA DO BOTÃO DE RESET (SILENCIADOR)
  bool estadoAtualBotao = digitalRead(pinoBotao);
  
  // Detecta quando o botão é pressionado (vai para LOW devido ao Pull-up)
  if (estadoAtualBotao == LOW && estadoAnteriorBotao == HIGH) {
    alarmeSilenciado = true;
    resetSaidas();
    Serial.println("Alarme Silenciado - Reiniciando em 10s");
    
    for (int i=9; i>=0; i--) {
      mostrarNumero(i);
      tone(pinoBuzzer, 2000, 50);
      delay(1000);
    }
    
    desligarDisplay();
    alarmeSilenciado = false;
  }
  estadoAnteriorBotao = estadoAtualBotao;

  //--- LÓGICA DO SENSOR DE CHAMA (VIA MILLIS)
  unsigned long tempoAtual = millis();
  if (tempoAtual - tempoAnterior >= intervaloLeitura) {
    tempoAnterior = tempoAtual;
    int nivelChama = analogRead(pinoSensorChama);
    
    // Mostra no monitor serial para ajudar na sua calibração
    // Serial.println(nivelChama);
    
    if (!alarmeSilenciado) {
      resetSaidas();
      
      // Ajuste estes valores conforme a luz do seu ambiente:
      if (nivelChama > 700) {
        // MONITORAMENTO SEGURO
        digitalWrite(ledVd1, HIGH);
        digitalWrite(ledVd2, HIGH);
      }
      else if (nivelChama <= 700 && nivelChama > 300) {
        // ALERTA (CHAMA DETECTADA)
        digitalWrite(ledAm1, HIGH);
        digitalWrite(ledAm2, HIGH);
      }
      else {
        // PERIGO CRÍTICO
        digitalWrite(ledVm1, HIGH);
        digitalWrite(ledVm2, HIGH);
        tone(pinoBuzzer, 2500);
      }
    }
  }
}

//--- FUNÇÕES AUXILIARES
void resetSaidas() {
  for(int i=5; i<=10; i++) {
    digitalWrite(i, LOW);
  }
  noTone(pinoBuzzer);
}

void desligarDisplay() {
  // No Anodo Comum, HIGH desliga o segmento
  digitalWrite(segA, HIGH); digitalWrite(segB, HIGH); digitalWrite(segC, HIGH);
  digitalWrite(segD, HIGH); digitalWrite(segE, HIGH); digitalWrite(segF, HIGH);
  digitalWrite(segG, HIGH); digitalWrite(segDP, HIGH);
}

void mostrarNumero(int num) {
  desligarDisplay();
  switch (num) {
    // Ordem: A, B, C, D, E, F, G
    case 0: ligarSegs(1,1,1,1,1,1,0); break;
    case 1: ligarSegs(0,1,1,0,0,0,0); break;
    case 2: ligarSegs(1,1,0,1,1,0,1); break;
    case 3: ligarSegs(1,1,1,1,0,0,1); break;
    case 4: ligarSegs(0,1,1,0,0,1,1); break;
    case 5: ligarSegs(1,0,1,1,0,1,1); break;
    case 6: ligarSegs(1,0,1,1,1,1,1); break;
    case 7: ligarSegs(1,1,1,0,0,0,0); break;
    case 8: ligarSegs(1,1,1,1,1,1,1); break;
    case 9: ligarSegs(1,1,1,1,0,1,1); break;
  }
}

void ligarSegs(int a, int b, int c, int d, int e, int f, int g) {
  // O símbolo '!' inverte o sinal: 1 vira LOW (liga) e 0 vira HIGH (desliga)
  digitalWrite(segA, !a); digitalWrite(segB, !b); digitalWrite(segC, !c);
  digitalWrite(segD, !d); digitalWrite(segE, !e); digitalWrite(segF, !f);
  digitalWrite(segG, !g);
}