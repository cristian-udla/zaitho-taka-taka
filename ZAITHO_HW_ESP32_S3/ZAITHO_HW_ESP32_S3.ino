#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Preferences.h>
#include <SparkFun_TB6612.h>
#include "config.h"

// =================================================================
// 1. INSTANCIAS DE MOTORES Y MAPEO DE VELOCIDAD (TB6612FNG)
// =================================================================
Motor motorIzq = Motor(pin_AIN1, pin_AIN2, pin_PWMA, DIR_NORMAL,  pin_STBY);
Motor motorDer = Motor(pin_BIN1, pin_BIN2, pin_PWMB, DIR_INVERSA, pin_STBY);
Preferences memoriaFlash;

int targetIzq  = 0;
int targetDer  = 0;
int currentIzq = 0;
int currentDer = 0;

int velocidadBasePct = PCT_CRUCERO_NORMAL;

unsigned long kickstartUntilIzq = 0;
unsigned long kickstartUntilDer = 0;
unsigned long moveAutoStopAt = 0;

int mapearVelocidadPWM(int porcentaje) {
  porcentaje = constrain(porcentaje, -100, 100);
  if (porcentaje == 0) return 0;
  int signo = (porcentaje > 0) ? 1 : -1;
  int mag = abs(porcentaje);
  int pwm = map(mag, 1, 100, PWM_MIN_TORQUE, PWM_MAX_TORQUE);
  return signo * pwm;
}

void fijarTargetMotoresPct(int pctIzq, int pctDer) {
  int nuevoIzq = mapearVelocidadPWM(pctIzq);
  int nuevoDer = mapearVelocidadPWM(pctDer);

  unsigned long ahora = millis();
  if (currentIzq == 0 && nuevoIzq != 0 && abs(nuevoIzq) < 145) {
    kickstartUntilIzq = ahora + 40;
  }
  if (currentDer == 0 && nuevoDer != 0 && abs(nuevoDer) < 145) {
    kickstartUntilDer = ahora + 40;
  }

  targetIzq = nuevoIzq;
  targetDer = nuevoDer;
}

// =================================================================
// 2. RED DE APRENDIZAJE POR REFUERZO LOCAL EN FLASH NVS (OFFLINE + ONLINE)
// =================================================================
struct RedAprendizajeChasis {
  float pesoIzq          = 1.0f;  // Peso Q aprendido para giros a la izquierda
  float pesoDer          = 1.0f;  // Peso Q aprendido para giros a la derecha
  float espacioMedioIzq  = 80.0f; // Promedio histórico de cm libres a la izquierda
  float espacioMedioDer  = 80.0f; // Promedio histórico de cm libres a la derecha
  float umbralObstaculoCm = DIST_OBSTACULO_CM; // Distancia de precaución aprendida (24..42 cm)
  int   velExploraOptima = PCT_EXPLORACION_MAX; // Velocidad de exploración aprendida (18..38%)
  int   evasionesExitosas = 0;
  int   sustosCercanos    = 0;
  int   recompensasNetas  = 0;
  int   ultimoGiroElegido = 0;    // -1 = Izquierda, +1 = Derecha, 0 = Ninguno
  unsigned long tiempoUltimoGiro = 0;
  bool  recompensaPendiente = false;
  unsigned long ultimoPasoObservacion = 0;
} cerebroChasis;

void cargarAprendizajeDeFlash() {
  memoriaFlash.begin("zaitho_rl", true);
  cerebroChasis.pesoIzq           = memoriaFlash.getFloat("pesoIzq", 1.0f);
  cerebroChasis.pesoDer           = memoriaFlash.getFloat("pesoDer", 1.0f);
  cerebroChasis.espacioMedioIzq   = memoriaFlash.getFloat("espIzq", 80.0f);
  cerebroChasis.espacioMedioDer   = memoriaFlash.getFloat("espDer", 80.0f);
  cerebroChasis.umbralObstaculoCm = memoriaFlash.getFloat("umbral", DIST_OBSTACULO_CM);
  cerebroChasis.velExploraOptima  = memoriaFlash.getInt("velOpt", PCT_EXPLORACION_MAX);
  cerebroChasis.evasionesExitosas = memoriaFlash.getInt("evasiones", 0);
  cerebroChasis.sustosCercanos    = memoriaFlash.getInt("sustos", 0);
  cerebroChasis.recompensasNetas  = memoriaFlash.getInt("rewards", 0);
  memoriaFlash.end();
}

void guardarAprendizajeEnFlash() {
  memoriaFlash.begin("zaitho_rl", false);
  memoriaFlash.putFloat("pesoIzq", cerebroChasis.pesoIzq);
  memoriaFlash.putFloat("pesoDer", cerebroChasis.pesoDer);
  memoriaFlash.putFloat("espIzq",  cerebroChasis.espacioMedioIzq);
  memoriaFlash.putFloat("espDer",  cerebroChasis.espacioMedioDer);
  memoriaFlash.putFloat("umbral",  cerebroChasis.umbralObstaculoCm);
  memoriaFlash.putInt("velOpt",    cerebroChasis.velExploraOptima);
  memoriaFlash.putInt("evasiones", cerebroChasis.evasionesExitosas);
  memoriaFlash.putInt("sustos",    cerebroChasis.sustosCercanos);
  memoriaFlash.putInt("rewards",   cerebroChasis.recompensasNetas);
  memoriaFlash.end();
}

// =================================================================
// 3. ESTADOS DE LUCES, GESTOS Y EXPLORACIÓN CON HC-SR04
// =================================================================
bool masterLights = true;
bool hazardLights = false;
bool blinkL       = false;
bool blinkR       = false;
bool stateBlink   = false;
bool isMoving     = false;
unsigned long lastBlink = 0;

bool modoAutonomo = false;

GestureType activeGesture = GESTURE_NONE;
unsigned long gestureStart = 0;

float distanciaActualCm = 999.0;
float distanciaPreviaCm = 999.0;
float scanDistIzq = 0.0;
float scanDistDer = 0.0;

// =================================================================
// 4. BLE UART Y PROTOCOLO BIDIRECCIONAL CHASIS <-> PANTALLA
// =================================================================
BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

void enviarNotificacionBLE(const String &mensaje) {
  if (deviceConnected && pTxCharacteristic) {
    pTxCharacteristic->setValue(mensaje.c_str());
    pTxCharacteristic->notify();
  }
}

// Retransmite el estado completo aprendido del chasis hacia la pantalla Android
void retransmitirCerebroAPantalla() {
  String syncMsg = "SYNC:EV=" + String(cerebroChasis.evasionesExitosas) +
                   ":REW=" + String(cerebroChasis.recompensasNetas) +
                   ":WI=" + String(cerebroChasis.pesoIzq, 2) +
                   ":WD=" + String(cerebroChasis.pesoDer, 2) +
                   ":UMB=" + String(cerebroChasis.umbralObstaculoCm, 0) +
                   ":VEL=" + String(cerebroChasis.velExploraOptima);
  enviarNotificacionBLE(syncMsg);
}

void detenerTodo() {
  targetIzq = 0;
  targetDer = 0;
  moveAutoStopAt = 0;
  activeGesture = GESTURE_NONE;
  blinkL = false;
  blinkR = false;
}

void iniciarGesto(int g) {
  moveAutoStopAt = 0;
  activeGesture = (GestureType)g;
  gestureStart = millis();
}

// =================================================================
// 5. SENSOR ULTRASÓNICO HC-SR04 CON FILTRO DE MEDIANA
// =================================================================
float medirPulsoHCSR04() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 24000);
  if (duration <= 0) return 999.0;

  float cm = (duration * 0.0343f) / 2.0f;
  if (cm < 2.0f || cm > DIST_MAX_VALIDA_CM) return 999.0;
  return cm;
}

float leerHCSR04Filtrado() {
  float a = medirPulsoHCSR04();
  delayMicroseconds(1000);
  float b = medirPulsoHCSR04();
  delayMicroseconds(1000);
  float c = medirPulsoHCSR04();

  if (a > b) { float t = a; a = b; b = t; }
  if (b > c) { float t = b; b = c; c = t; }
  if (a > b) { float t = a; a = b; b = t; }
  return b;
}

// =================================================================
// 6. RECEPCIÓN DE COMANDOS Y AJUSTES NEURONALES DESDE LA PANTALLA
// =================================================================
void clasificarMovimientoJoystick(uint8_t val) {
  if (val == 0) {
    targetIzq = 0; targetDer = 0;
    return;
  }
  if (val >= 30 && val <= 75) {
    fijarTargetMotoresPct(velocidadBasePct, velocidadBasePct);
  } else if (val >= 76 && val <= 118) {
    fijarTargetMotoresPct(-velocidadBasePct, velocidadBasePct);
  } else if (val >= 119 && val <= 170) {
    fijarTargetMotoresPct(-velocidadBasePct, -velocidadBasePct);
  } else {
    fijarTargetMotoresPct(velocidadBasePct, -velocidadBasePct);
  }
}

// Procesa actualización neuronal enviada desde la pantalla:
// Formato: "BRAIN:UMB=32:VEL=24:WI=1.20:WD=0.90"
void procesarPaqueteBrainDesdePantalla(String raw) {
  int idxUmb = raw.indexOf("UMB=");
  if (idxUmb > 0) {
    float u = raw.substring(idxUmb + 4).toFloat();
    if (u >= 18.0f && u <= 50.0f) cerebroChasis.umbralObstaculoCm = u;
  }
  int idxVel = raw.indexOf("VEL=");
  if (idxVel > 0) {
    int v = raw.substring(idxVel + 4).toInt();
    if (v >= 18 && v <= 45) cerebroChasis.velExploraOptima = v;
  }
  int idxWi = raw.indexOf("WI=");
  if (idxWi > 0) {
    float wi = raw.substring(idxWi + 3).toFloat();
    if (wi >= 0.4f && wi <= 2.0f) cerebroChasis.pesoIzq = wi;
  }
  int idxWd = raw.indexOf("WD=");
  if (idxWd > 0) {
    float wd = raw.substring(idxWd + 3).toFloat();
    if (wd >= 0.4f && wd <= 2.0f) cerebroChasis.pesoDer = wd;
  }
  guardarAprendizajeEnFlash();
  retransmitirCerebroAPantalla();
}

void procesarComandoTexto(String raw) {
  raw.trim();
  if (raw.length() == 0) return;

  // Si es un paquete de sincronización neuronal desde el cerebro de la pantalla
  if (raw.startsWith("BRAIN:")) {
    procesarPaqueteBrainDesdePantalla(raw);
    return;
  }
  if (raw.startsWith("SYNC?")) {
    retransmitirCerebroAPantalla();
    return;
  }

  char cmd = toupper(raw[0]);
  int durationMs = 0;
  int customVelPct = velocidadBasePct;

  int firstColon = raw.indexOf(':');
  if (firstColon > 0) {
    int secondColon = raw.indexOf(':', firstColon + 1);
    if (secondColon > 0) {
      durationMs   = raw.substring(firstColon + 1, secondColon).toInt();
      customVelPct = constrain(raw.substring(secondColon + 1).toInt(), 15, 100);
    } else {
      durationMs = raw.substring(firstColon + 1).toInt();
    }
  }

  switch (cmd) {
    case 'V':
      if (durationMs > 0) {
        velocidadBasePct = constrain(durationMs, 15, 100);
        enviarNotificacionBLE("SPEED:" + String(velocidadBasePct));
      }
      break;

    case 'F':
      modoAutonomo = false;
      activeGesture = GESTURE_NONE;
      if (distanciaActualCm < DIST_PELIGRO_CM) {
        enviarNotificacionBLE("EVENT:TOO_CLOSE:" + String(distanciaActualCm, 1));
        iniciarGesto(GESTURE_JOLT);
        return;
      }
      fijarTargetMotoresPct(customVelPct, customVelPct);
      blinkL = false; blinkR = false;
      moveAutoStopAt = (durationMs > 0) ? (millis() + durationMs) : 0;
      break;

    case 'B':
      modoAutonomo = false;
      activeGesture = GESTURE_NONE;
      fijarTargetMotoresPct(-customVelPct, -customVelPct);
      blinkL = false; blinkR = false;
      moveAutoStopAt = (durationMs > 0) ? (millis() + durationMs) : 0;
      break;

    case 'L':
      modoAutonomo = false;
      activeGesture = GESTURE_NONE;
      fijarTargetMotoresPct(-customVelPct, customVelPct);
      blinkL = true; blinkR = false;
      moveAutoStopAt = (durationMs > 0) ? (millis() + durationMs) : 0;
      break;

    case 'R':
      modoAutonomo = false;
      activeGesture = GESTURE_NONE;
      fijarTargetMotoresPct(customVelPct, -customVelPct);
      blinkR = true; blinkL = false;
      moveAutoStopAt = (durationMs > 0) ? (millis() + durationMs) : 0;
      break;

    case 'S':
      modoAutonomo = false;
      detenerTodo();
      break;

    case 'A':
      modoAutonomo = !modoAutonomo;
      cerebroChasis.ultimoPasoObservacion = millis();
      if (!modoAutonomo) {
        detenerTodo();
      } else {
        retransmitirCerebroAPantalla();
      }
      break;

    case 'D':
      distanciaActualCm = leerHCSR04Filtrado();
      enviarNotificacionBLE("DIST:" + String(distanciaActualCm, 1));
      break;

    case 'W': iniciarGesto(GESTURE_WIGGLE);  break;
    case 'E': iniciarGesto(GESTURE_EXCITED); break;
    case 'N': iniciarGesto(GESTURE_CURIOUS); break;
    case 'J': iniciarGesto(GESTURE_JOLT);    break;

    case 'H': masterLights = !masterLights; break;
    case 'Z': hazardLights = !hazardLights; break;
  }
}

class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println(">>> Cerebro Android Zaitho Conectado");
    iniciarGesto(GESTURE_WIGGLE);
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    // Nota: Si estaba aprendiendo en modo autónomo y deseas seguridad al desconectar, frena y guarda en Flash
    guardarAprendizajeEnFlash();
    modoAutonomo = false;
    detenerTodo();
    Serial.println(">>> Cerebro Android Desconectado (Aprendizaje guardado en Flash)");
  }
};

class MyCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = pCharacteristic->getValue();
    if (value.length() == 0) return;

    if (value.length() >= 7 && (uint8_t)value[0] < 0x20) {
      uint8_t b5 = (uint8_t)value[5];
      uint8_t b6 = (uint8_t)value[6];
      if (b5 == 0x04) { hazardLights = !hazardLights; blinkL = false; blinkR = false; }
      if (b5 == 0x20) { blinkL = !blinkL; blinkR = false; hazardLights = false; }
      if (b5 == 0x08) { blinkR = !blinkR; blinkL = false; hazardLights = false; }
      if (b5 == 0x10) { detenerTodo(); hazardLights = false; }
      if (b5 == 0x01) { masterLights = !masterLights; }
      clasificarMovimientoJoystick(b6);
      return;
    }

    procesarComandoTexto(value);
  }
};

// =================================================================
// 7. COREOGRAFÍAS Y MOTOR DE Q-LEARNING DEL EXPLORADOR
// =================================================================
void actualizarGestos() {
  if (activeGesture == GESTURE_NONE) return;
  unsigned long elapsed = millis() - gestureStart;

  switch (activeGesture) {
    case GESTURE_WIGGLE:
      hazardLights = true;
      if (elapsed < 180)      { fijarTargetMotoresPct(-PCT_GESTO, PCT_GESTO); }
      else if (elapsed < 360) { fijarTargetMotoresPct(PCT_GESTO, -PCT_GESTO); }
      else if (elapsed < 540) { fijarTargetMotoresPct(-PCT_GESTO, PCT_GESTO); }
      else if (elapsed < 720) { fijarTargetMotoresPct(PCT_GESTO, -PCT_GESTO); }
      else {
        hazardLights = false;
        detenerTodo();
      }
      break;

    case GESTURE_EXCITED:
      hazardLights = true;
      if (elapsed < 240)       { fijarTargetMotoresPct(PCT_GESTO, PCT_GESTO); }
      else if (elapsed < 480)  { fijarTargetMotoresPct(-PCT_GESTO, -PCT_GESTO); }
      else if (elapsed < 1200) { fijarTargetMotoresPct(PCT_RAPIDO_TURBO, -PCT_RAPIDO_TURBO); }
      else {
        hazardLights = false;
        detenerTodo();
      }
      break;

    case GESTURE_CURIOUS:
      if (elapsed < 380)       { fijarTargetMotoresPct(-PCT_GIRO_EXPLORA, PCT_GIRO_EXPLORA); blinkL = true; }
      else if (elapsed < 750)  { fijarTargetMotoresPct(0, 0); }
      else if (elapsed < 1250) { fijarTargetMotoresPct(PCT_GIRO_EXPLORA, -PCT_GIRO_EXPLORA); blinkL = false; blinkR = true; }
      else if (elapsed < 1550) { fijarTargetMotoresPct(-PCT_GIRO_EXPLORA, PCT_GIRO_EXPLORA); blinkR = false; }
      else {
        detenerTodo();
      }
      break;

    case GESTURE_JOLT:
      hazardLights = true;
      if (elapsed < 320) { fijarTargetMotoresPct(-PCT_CRUCERO_NORMAL, -PCT_CRUCERO_NORMAL); }
      else {
        hazardLights = false;
        detenerTodo();
      }
      break;

    case GESTURE_OBSERVE_PAUSE:
      if (elapsed < 350) {
        fijarTargetMotoresPct(0, 0);
      } else if (elapsed < 700) {
        fijarTargetMotoresPct(-PCT_GIRO_EXPLORA, PCT_GIRO_EXPLORA);
        scanDistIzq = distanciaActualCm;
      } else if (elapsed < 1050) {
        fijarTargetMotoresPct(0, 0);
      } else if (elapsed < 1650) {
        fijarTargetMotoresPct(PCT_GIRO_EXPLORA, -PCT_GIRO_EXPLORA);
        scanDistDer = distanciaActualCm;
      } else if (elapsed < 1950) {
        if (scanDistIzq > scanDistDer + 25.0f) {
          fijarTargetMotoresPct(-PCT_GIRO_EXPLORA, PCT_GIRO_EXPLORA);
        } else {
          fijarTargetMotoresPct(0, 0);
        }
      } else {
        activeGesture = GESTURE_NONE;
        cerebroChasis.ultimoPasoObservacion = millis();
      }
      break;

    case GESTURE_AVOID_SCAN:
      // Si había una decisión reciente (< 2.2s) y ya chocó con otro obstáculo -> CASTIGO (-1)
      if (elapsed < 50 && cerebroChasis.recompensaPendiente) {
        if (millis() - cerebroChasis.tiempoUltimoGiro < 2200) {
          cerebroChasis.recompensasNetas--;
          if (cerebroChasis.ultimoGiroElegido == -1) {
            cerebroChasis.pesoIzq = max(0.5f, cerebroChasis.pesoIzq - 0.08f);
          } else if (cerebroChasis.ultimoGiroElegido == 1) {
            cerebroChasis.pesoDer = max(0.5f, cerebroChasis.pesoDer - 0.08f);
          }
          cerebroChasis.umbralObstaculoCm = min(40.0f, cerebroChasis.umbralObstaculoCm + 1.5f);
          cerebroChasis.velExploraOptima = max(PCT_EXPLORACION_MIN, cerebroChasis.velExploraOptima - 2);
          enviarNotificacionBLE("REWARD:-1:CAUSA=CAMINO_CORTO:UMB=" + String(cerebroChasis.umbralObstaculoCm, 0));
        }
        cerebroChasis.recompensaPendiente = false;
      }

      if (elapsed < 450) {
        fijarTargetMotoresPct(-PCT_EXPLORACION_MAX, -PCT_EXPLORACION_MAX);
      } else if (elapsed < 950) {
        fijarTargetMotoresPct(-PCT_GIRO_EXPLORA, PCT_GIRO_EXPLORA);
        blinkL = true; blinkR = false;
      } else if (elapsed < 1200) {
        fijarTargetMotoresPct(0, 0);
        scanDistIzq = distanciaActualCm;
      } else if (elapsed < 2050) {
        fijarTargetMotoresPct(PCT_GIRO_EXPLORA, -PCT_GIRO_EXPLORA);
        blinkL = false; blinkR = true;
      } else if (elapsed < 2300) {
        fijarTargetMotoresPct(0, 0);
        scanDistDer = distanciaActualCm;
      } else if (elapsed < 2850) {
        // Puntaje Q-Learning: Distancia medida ponderada por el peso aprendido (pesoIzq / pesoDer)
        float qIzq = (scanDistIzq * 0.75f + cerebroChasis.espacioMedioIzq * 0.25f) * cerebroChasis.pesoIzq;
        float qDer = (scanDistDer * 0.75f + cerebroChasis.espacioMedioDer * 0.25f) * cerebroChasis.pesoDer;

        if (qIzq > qDer + 3.0f) {
          fijarTargetMotoresPct(-PCT_GIRO_EXPLORA, PCT_GIRO_EXPLORA);
          blinkL = true; blinkR = false;
          cerebroChasis.ultimoGiroElegido = -1;
        } else {
          fijarTargetMotoresPct(0, 0);
          cerebroChasis.ultimoGiroElegido = 1;
        }
      } else {
        cerebroChasis.espacioMedioIzq = cerebroChasis.espacioMedioIzq * 0.7f + min(scanDistIzq, 200.0f) * 0.3f;
        cerebroChasis.espacioMedioDer = cerebroChasis.espacioMedioDer * 0.7f + min(scanDistDer, 200.0f) * 0.3f;
        cerebroChasis.evasionesExitosas++;
        cerebroChasis.tiempoUltimoGiro = millis();
        cerebroChasis.recompensaPendiente = true;

        guardarAprendizajeEnFlash();

        String ladoElegido = (cerebroChasis.ultimoGiroElegido == -1) ? "IZQUIERDA" : "DERECHA";
        enviarNotificacionBLE(
          "LEARN:" + ladoElegido +
          ":IZQ=" + String(scanDistIzq, 0) +
          ":DER=" + String(scanDistDer, 0) +
          ":WI=" + String(cerebroChasis.pesoIzq, 2) +
          ":WD=" + String(cerebroChasis.pesoDer, 2) +
          ":UMB=" + String(cerebroChasis.umbralObstaculoCm, 0) +
          ":EV=" + String(cerebroChasis.evasionesExitosas)
        );

        blinkL = false;
        blinkR = false;
        activeGesture = GESTURE_NONE;
        cerebroChasis.ultimoPasoObservacion = millis();
      }
      break;

    default:
      break;
  }
}

// =================================================================
// 8. RAMPA PWM Y LUCES
// =================================================================
void actualizarMotoresRampa() {
  unsigned long ahora = millis();

  if (moveAutoStopAt > 0 && ahora >= moveAutoStopAt) {
    detenerTodo();
  }

  int paso = modoAutonomo ? PASO_RAMPA_SUAVE : PASO_RAMPA_RAPIDA;

  if (currentIzq < targetIzq) currentIzq = min(currentIzq + paso, targetIzq);
  else if (currentIzq > targetIzq) currentIzq = max(currentIzq - paso, targetIzq);

  if (currentDer < targetDer) currentDer = min(currentDer + paso, targetDer);
  else if (currentDer > targetDer) currentDer = max(currentDer - paso, targetDer);

  if (currentIzq == 0 && currentDer == 0 && targetIzq == 0 && targetDer == 0) {
    motorIzq.brake();
    motorDer.brake();
    isMoving = false;
    digitalWrite(PIN_REV_LIGHTS, LOW);
  } else {
    int pwmOutIzq = currentIzq;
    int pwmOutDer = currentDer;
    if (ahora < kickstartUntilIzq && targetIzq != 0) {
      pwmOutIzq = (targetIzq > 0) ? PWM_KICKSTART : -PWM_KICKSTART;
    }
    if (ahora < kickstartUntilDer && targetDer != 0) {
      pwmOutDer = (targetDer > 0) ? PWM_KICKSTART : -PWM_KICKSTART;
    }

    motorIzq.drive(pwmOutIzq);
    motorDer.drive(pwmOutDer);
    isMoving = true;
    digitalWrite(PIN_REV_LIGHTS, (currentIzq < 0 && currentDer < 0) ? HIGH : LOW);
  }
}

void actualizarLuces() {
  digitalWrite(PIN_FRONT_LIGHTS, masterLights ? HIGH : LOW);

  if (!isMoving) {
    digitalWrite(PIN_REAR_LIGHTS, HIGH);
  } else {
    digitalWrite(PIN_REAR_LIGHTS, masterLights ? HIGH : LOW);
  }

  if (hazardLights) {
    digitalWrite(PIN_IND_LEFT,  stateBlink ? HIGH : LOW);
    digitalWrite(PIN_IND_RIGHT, stateBlink ? HIGH : LOW);
  } else {
    digitalWrite(PIN_IND_LEFT,  (blinkL && stateBlink) ? HIGH : LOW);
    digitalWrite(PIN_IND_RIGHT, (blinkR && stateBlink) ? HIGH : LOW);
  }
}

// =================================================================
// 9. SETUP & LOOP PRINCIPAL
// =================================================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_FRONT_LIGHTS, OUTPUT);
  pinMode(PIN_REAR_LIGHTS,  OUTPUT);
  pinMode(PIN_REV_LIGHTS,   OUTPUT);
  pinMode(PIN_IND_LEFT,     OUTPUT);
  pinMode(PIN_IND_RIGHT,    OUTPUT);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  motorIzq.brake();
  motorDer.brake();

  // Cargar pesos aprendidos de la memoria Flash NVS del ESP32-S3
  cargarAprendizajeDeFlash();

  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pRxCharacteristic->setCallbacks(new MyCallbacks());

  pTxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  pService->start();
  BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();

  Serial.printf(">>> ZAITHO_ROBOT NVS Cargado: Evasiones=%d | WI=%.2f | WD=%.2f | Umbral=%.1f cm\n",
                cerebroChasis.evasionesExitosas, cerebroChasis.pesoIzq, cerebroChasis.pesoDer, cerebroChasis.umbralObstaculoCm);
}

void loop() {
  unsigned long now = millis();

  static unsigned long lastMotorUpdate = 0;
  if (now - lastMotorUpdate >= MOTOR_UPDATE_MS) {
    lastMotorUpdate = now;
    actualizarGestos();
    actualizarMotoresRampa();
  }

  if (now - lastBlink >= BLINK_INTERVAL) {
    lastBlink = now;
    stateBlink = !stateBlink;
  }
  actualizarLuces();

  static unsigned long lastSensor = 0;
  static unsigned long lastEventSent = 0;

  if (now - lastSensor >= SENSOR_UPDATE_MS) {
    lastSensor = now;
    distanciaPreviaCm = distanciaActualCm;
    distanciaActualCm = leerHCSR04Filtrado();

    enviarNotificacionBLE("DIST:" + String(distanciaActualCm, 1));

    // A) Reflejo de Peligro (< 14 cm): Penaliza y aprende en Flash NVS
    if (distanciaActualCm < DIST_PELIGRO_CM && activeGesture != GESTURE_JOLT && (now - lastEventSent > 2500)) {
      lastEventSent = now;
      cerebroChasis.sustosCercanos++;
      cerebroChasis.recompensasNetas--;
      cerebroChasis.umbralObstaculoCm = min(42.0f, cerebroChasis.umbralObstaculoCm + 2.0f);
      guardarAprendizajeEnFlash();
      enviarNotificacionBLE("EVENT:TOO_CLOSE:" + String(distanciaActualCm, 1));
      iniciarGesto(GESTURE_JOLT);
    }
    // B) Freno preventivo manual
    else if (distanciaActualCm < cerebroChasis.umbralObstaculoCm && targetIzq > 0 && targetDer > 0 && !modoAutonomo) {
      detenerTodo();
      if (now - lastEventSent > 2500) {
        lastEventSent = now;
        enviarNotificacionBLE("EVENT:OBSTACLE:" + String(distanciaActualCm, 1));
      }
    }
    // C) Curiosidad cuando está quieto
    else if (!isMoving && !modoAutonomo && activeGesture == GESTURE_NONE &&
             distanciaPreviaCm > 55.0 && distanciaActualCm <= DIST_CURIOSIDAD_CM &&
             distanciaActualCm >= DIST_PELIGRO_CM && (now - lastEventSent > 4000)) {
      lastEventSent = now;
      enviarNotificacionBLE("EVENT:CURIOUS_OBJECT:" + String(distanciaActualCm, 1));
    }
  }

  // 4. MODO EXPLORACIÓN CON RECOMPENSA Q-LEARNING (OFFLINE + ONLINE)
  if (modoAutonomo && activeGesture == GESTURE_NONE) {
    // Evaluar si merecemos RECOMPENSA POSITIVA (+1) por haber avanzado > 3.8s sin obstáculos tras el último giro
    if (cerebroChasis.recompensaPendiente && (now - cerebroChasis.tiempoUltimoGiro > 3800)) {
      cerebroChasis.recompensaPendiente = false;
      cerebroChasis.recompensasNetas++;
      if (cerebroChasis.ultimoGiroElegido == -1) {
        cerebroChasis.pesoIzq = min(1.85f, cerebroChasis.pesoIzq + 0.06f);
      } else if (cerebroChasis.ultimoGiroElegido == 1) {
        cerebroChasis.pesoDer = min(1.85f, cerebroChasis.pesoDer + 0.06f);
      }
      cerebroChasis.velExploraOptima = min(38, cerebroChasis.velExploraOptima + 1);
      guardarAprendizajeEnFlash();
      retransmitirCerebroAPantalla();
      enviarNotificacionBLE("REWARD:+1:LADO=" + String(cerebroChasis.ultimoGiroElegido == -1 ? "IZQ" : "DER"));
    }

    if (distanciaActualCm < cerebroChasis.umbralObstaculoCm) {
      enviarNotificacionBLE("EVENT:SCANNING:" + String(distanciaActualCm, 1));
      iniciarGesto(GESTURE_AVOID_SCAN);
    }
    else if (now - cerebroChasis.ultimoPasoObservacion >= 4800) {
      enviarNotificacionBLE("EVENT:OBSERVING:" + String(distanciaActualCm, 1));
      iniciarGesto(GESTURE_OBSERVE_PAUSE);
    }
    else {
      int pctMax = cerebroChasis.velExploraOptima;
      int pctExplora = pctMax;
      if (distanciaActualCm < DIST_CAUTELA_CM) {
        pctExplora = map(
          (long)constrain(distanciaActualCm, cerebroChasis.umbralObstaculoCm, DIST_CAUTELA_CM),
          (long)cerebroChasis.umbralObstaculoCm,
          (long)DIST_CAUTELA_CM,
          PCT_EXPLORACION_MIN,
          pctMax
        );
      }
      fijarTargetMotoresPct(pctExplora, pctExplora);
      blinkL = false;
      blinkR = false;
    }
  }

  // 5. Reconexión BLE y envío inicial del estado aprendido en Flash NVS
  if (!deviceConnected && oldDeviceConnected) {
    delay(200);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
    delay(150);
    retransmitirCerebroAPantalla();
  }
}
