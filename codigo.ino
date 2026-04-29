// =============================================================================
// PROJETO: Alarme de Incendio com Sensor de Chama e Display de 7 Segmentos
// Plataforma: Arduino UNO
// =============================================================================

// ---------- Limiares de deteccao (ajuste conforme o ambiente) ----------------
const int LIMIAR_SEGURO     = 700;  // acima: ambiente seguro (verde)
const int LIMIAR_ALERTA     = 300;  // entre ALERTA e SEGURO: chama detectada (amarelo)
                                    // abaixo: perigo critico (vermelho + buzzer)

const int HISTERESE         = 30;   // margem para evitar oscilacao entre estados

// ---------- Temporizadores ---------------------------------------------------
const unsigned long INTERVALO_LEITURA_MS = 150;   // periodo entre leituras do sensor
const unsigned long DEBOUNCE_MS          = 50;     // debounce do botao
const unsigned long CONTAGEM_REGRESSIVA  = 10;     // segundos do silenciamento
const unsigned int  FREQ_ALARME_HZ       = 2500;   // frequencia do alarme critico
const unsigned int  FREQ_BIPE_HZ         = 2000;   // frequencia do bipe de contagem
const unsigned int  DURACAO_BIPE_MS      = 50;     // duracao do bipe de contagem

// ---------- Mapeamento de pinos: Display 7 segmentos (Anodo Comum) -----------
const int SEG_A  = 13;
const int SEG_B  = 3;
const int SEG_C  = A4;
const int SEG_D  = A2;
const int SEG_E  = A1;
const int SEG_F  = 12;
const int SEG_G  = 11;
const int SEG_DP = A3;

const int PINOS_DISPLAY[] = { SEG_A, SEG_B, SEG_C, SEG_D, SEG_E, SEG_F, SEG_G, SEG_DP };
const int NUM_SEGMENTOS   = sizeof(PINOS_DISPLAY) / sizeof(PINOS_DISPLAY[0]);

// Tabela de segmentos para digitos 0-9 (ordem: A B C D E F G)
const byte DIGITOS[10][7] = {
  {1,1,1,1,1,1,0},  // 0
  {0,1,1,0,0,0,0},  // 1
  {1,1,0,1,1,0,1},  // 2
  {1,1,1,1,0,0,1},  // 3
  {0,1,1,0,0,1,1},  // 4
  {1,0,1,1,0,1,1},  // 5
  {1,0,1,1,1,1,1},  // 6
  {1,1,1,0,0,0,0},  // 7
  {1,1,1,1,1,1,1},  // 8
  {1,1,1,1,0,1,1}   // 9
};

// ---------- Mapeamento de pinos: Sensor, botao e buzzer ----------------------
const int PINO_SENSOR = A0;
const int PINO_BOTAO  = 2;
const int PINO_BUZZER = 4;

// ---------- Mapeamento de pinos: LEDs de indicacao ---------------------------
const int LED_VERDE_1    = 10;
const int LED_VERDE_2    = 9;
const int LED_AMARELO_1  = 8;
const int LED_AMARELO_2  = 7;
const int LED_VERMELHO_1 = 6;
const int LED_VERMELHO_2 = 5;

const int PINOS_LED[] = { LED_VERDE_1, LED_VERDE_2,
                          LED_AMARELO_1, LED_AMARELO_2,
                          LED_VERMELHO_1, LED_VERMELHO_2 };
const int NUM_LEDS = sizeof(PINOS_LED) / sizeof(PINOS_LED[0]);

// ---------- Estados do sistema -----------------------------------------------
enum EstadoSistema {
  SEGURO,
  ALERTA,
  PERIGO,
  SILENCIADO
};

// ---------- Variaveis de controle --------------------------------------------
EstadoSistema estadoAtual     = SEGURO;
EstadoSistema estadoAnterior  = SEGURO;

bool           leituraBotaoAnterior   = HIGH;
bool           estadoBotaoDebounced   = HIGH;
unsigned long  tempoAnteriorLeitura   = 0;
unsigned long  tempoUltimoBotao       = 0;
bool           primeiraLeitura        = true;

// =============================================================================
// SETUP
// =============================================================================
void setup() {
  Serial.begin(9600);

  pinMode(PINO_SENSOR, INPUT);
  pinMode(PINO_BOTAO, INPUT_PULLUP);

  for (int i = 0; i < NUM_LEDS; i++) {
    pinMode(PINOS_LED[i], OUTPUT);
  }

  pinMode(PINO_BUZZER, OUTPUT);

  for (int i = 0; i < NUM_SEGMENTOS; i++) {
    pinMode(PINOS_DISPLAY[i], OUTPUT);
  }

  desligarDisplay();
  resetLEDs();

  Serial.println(F("=== Alarme de Incendio IoT ==="));
  Serial.println(F("Limiares configurados:"));
  Serial.print(F("  Seguro  > ")); Serial.println(LIMIAR_SEGURO);
  Serial.print(F("  Alerta  > ")); Serial.print(LIMIAR_ALERTA);
  Serial.print(F(" e <= ")); Serial.println(LIMIAR_SEGURO);
  Serial.print(F("  Perigo <= ")); Serial.println(LIMIAR_ALERTA);
  Serial.println(F("Sistema pronto - monitorando chama..."));
  Serial.println();
}

// =============================================================================
// LOOP PRINCIPAL
// =============================================================================
void loop() {
  verificarBotao();

  if (estadoAtual == SILENCIADO) {
    return;
  }

  unsigned long agora = millis();
  if (agora - tempoAnteriorLeitura < INTERVALO_LEITURA_MS) {
    return;
  }
  tempoAnteriorLeitura = agora;

  int nivelChama = analogRead(PINO_SENSOR);
  EstadoSistema novoEstado = calcularEstado(nivelChama);

  if (novoEstado != estadoAtual || primeiraLeitura) {
    primeiraLeitura = false;
    estadoAnterior = estadoAtual;
    estadoAtual = novoEstado;
    aplicarEstado(estadoAtual);
    imprimirEstado(nivelChama);
  }
}

// =============================================================================
// FUNCOES DE ESTADO
// =============================================================================

EstadoSistema calcularEstado(int leitura) {
  // Histerese: so muda de estado se ultrapassar o limiar + margem
  switch (estadoAtual) {
    case SEGURO:
      if (leitura <= LIMIAR_ALERTA - HISTERESE) return PERIGO;
      if (leitura <= LIMIAR_SEGURO - HISTERESE) return ALERTA;
      return SEGURO;

    case ALERTA:
      if (leitura > LIMIAR_SEGURO + HISTERESE)  return SEGURO;
      if (leitura <= LIMIAR_ALERTA - HISTERESE)  return PERIGO;
      return ALERTA;

    case PERIGO:
      if (leitura > LIMIAR_SEGURO + HISTERESE)  return SEGURO;
      if (leitura > LIMIAR_ALERTA + HISTERESE)   return ALERTA;
      return PERIGO;

    default:
      return SEGURO;
  }
}

void aplicarEstado(EstadoSistema estado) {
  resetLEDs();
  noTone(PINO_BUZZER);

  switch (estado) {
    case SEGURO:
      digitalWrite(LED_VERDE_1, HIGH);
      digitalWrite(LED_VERDE_2, HIGH);
      break;

    case ALERTA:
      digitalWrite(LED_AMARELO_1, HIGH);
      digitalWrite(LED_AMARELO_2, HIGH);
      break;

    case PERIGO:
      digitalWrite(LED_VERMELHO_1, HIGH);
      digitalWrite(LED_VERMELHO_2, HIGH);
      tone(PINO_BUZZER, FREQ_ALARME_HZ);
      break;

    default:
      break;
  }
}

void imprimirEstado(int leitura) {
  Serial.print(F("Sensor: "));
  Serial.print(leitura);
  Serial.print(F(" | Estado: "));

  switch (estadoAtual) {
    case SEGURO:  Serial.println(F("SEGURO (verde)"));   break;
    case ALERTA:  Serial.println(F("ALERTA (amarelo)")); break;
    case PERIGO:  Serial.println(F("PERIGO (vermelho + buzzer)")); break;
    default:      Serial.println(F("DESCONHECIDO"));     break;
  }
}

// =============================================================================
// FUNCOES DO BOTAO E SILENCIAMENTO
// =============================================================================

void verificarBotao() {
  bool leituraBotao = digitalRead(PINO_BOTAO);

  if (leituraBotao != leituraBotaoAnterior) {
    tempoUltimoBotao = millis();
  }
  leituraBotaoAnterior = leituraBotao;

  if ((millis() - tempoUltimoBotao) > DEBOUNCE_MS) {
    if (leituraBotao == LOW && estadoBotaoDebounced == HIGH) {
      executarSilenciamento();
    }
    estadoBotaoDebounced = leituraBotao;
  }
}

void executarSilenciamento() {
  estadoAtual = SILENCIADO;
  resetLEDs();
  noTone(PINO_BUZZER);

  Serial.print(F("Alarme silenciado - reiniciando em "));
  Serial.print(CONTAGEM_REGRESSIVA);
  Serial.println(F("s"));

  for (int i = CONTAGEM_REGRESSIVA - 1; i >= 0; i--) {
    mostrarNumero(i);
    tone(PINO_BUZZER, FREQ_BIPE_HZ, DURACAO_BIPE_MS);
    delay(1000);
  }

  desligarDisplay();
  estadoAtual = SEGURO;
  aplicarEstado(estadoAtual);
  Serial.println(F("Monitoramento retomado."));
}

// =============================================================================
// FUNCOES DO DISPLAY DE 7 SEGMENTOS (ANODO COMUM)
// =============================================================================

void desligarDisplay() {
  for (int i = 0; i < NUM_SEGMENTOS; i++) {
    digitalWrite(PINOS_DISPLAY[i], HIGH);  // HIGH desliga no anodo comum
  }
}

void mostrarNumero(int num) {
  if (num < 0 || num > 9) {
    desligarDisplay();
    return;
  }

  for (int i = 0; i < 7; i++) {
    digitalWrite(PINOS_DISPLAY[i], !DIGITOS[num][i]);  // inverte para anodo comum
  }
}

// =============================================================================
// FUNCOES AUXILIARES
// =============================================================================

void resetLEDs() {
  for (int i = 0; i < NUM_LEDS; i++) {
    digitalWrite(PINOS_LED[i], LOW);
  }
}
