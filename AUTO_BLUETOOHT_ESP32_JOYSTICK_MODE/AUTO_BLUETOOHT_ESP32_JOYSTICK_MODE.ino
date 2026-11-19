#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <SparkFun_TB6612.h>

// =================================================================
// 1. HARDWARE: ESP32-S3 Y TB6612FNG
// =================================================================
#define pin_PWMA  5    
#define pin_AIN2  6    
#define pin_AIN1  7    
#define pin_STBY  8    
#define pin_BIN1  9    
#define pin_BIN2 10    
#define pin_PWMB 11    

#define DIR_NORMAL   1
#define DIR_INVERSA -1

Motor motorIzq = Motor(pin_AIN1, pin_AIN2, pin_PWMA, DIR_NORMAL,  pin_STBY);
Motor motorDer = Motor(pin_BIN1, pin_BIN2, pin_PWMB, DIR_INVERSA, pin_STBY);

// Luces
const int frontLights = 1;   
const int rearLights  = 2;   
const int revLights   = 3;   
const int indLeft     = 4;   
const int indRight    = 12;  

// Parámetros de velocidad
const int VEL_CRUCERO = 220; // Velocidad máxima normal (0 a 255)
const int VEL_GIRO    = 190; // Velocidad de giro sobre su eje
const int PASO_RAMPA  = 8;   // Qué tan rápido acelera/frena (mayor = más agresivo, menor = más suave)

// Velocidades actuales y objetivo (para rampa de aceleración suave)
int targetIzq = 0;
int targetDer = 0;
int currentIzq = 0;
int currentDer = 0;

// =================================================================
// 2. BLE
// =================================================================
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

BLEServer* pServer = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;
bool isMoving = false;

// Luces
bool masterLights = false;   
bool hazardLights = false;   
bool blinkL = false;         
bool blinkR = false;         
unsigned long lastBlink = 0;
bool stateBlink = false;

void clasificarMovimiento(uint8_t angleVal);
void actualizarMotoresRampa();
void actualizarLuces();

class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println(">>> App Conectada");
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    targetIzq = 0;
    targetDer = 0;
    Serial.println(">>> App Desconectada");
  }
};

class MyCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = pCharacteristic->getValue();

    if (value.length() >= 7) {
      uint8_t b5 = (uint8_t)value[5]; 
      uint8_t b6 = (uint8_t)value[6]; 

      // Botones auxiliares (Byte 5)
      if (b5 == 0x04) { hazardLights = !hazardLights; blinkL = false; blinkR = false; }
      if (b5 == 0x20) { blinkL = !blinkL; blinkR = false; hazardLights = false; }
      if (b5 == 0x08) { blinkR = !blinkR; blinkL = false; hazardLights = false; }
      if (b5 == 0x10) { targetIzq = 0; targetDer = 0; blinkL = false; blinkR = false; hazardLights = false; }
      if (b5 == 0x01) { masterLights = !masterLights; }

      // Joystick (Byte 6)
      clasificarMovimiento(b6);
    }
  }
};

// =================================================================
// 3. CLASIFICACIÓN CLARA EN 4 DIRECCIONES
// =================================================================
void clasificarMovimiento(uint8_t val) {
  // Centro / sin tocar
  if (val == 0) {
    targetIzq = 0;
    targetDer = 0;
    return;
  }

  // 1. ADELANTE (Cono centrado en ~55)
  if (val >= 30 && val <= 75) {
    targetIzq = VEL_CRUCERO;
    targetDer = VEL_CRUCERO;
  }
  // 2. GIRO IZQUIERDA (Cono centrado en ~95)
  else if (val >= 76 && val <= 118) {
    targetIzq = -VEL_GIRO;
    targetDer = VEL_GIRO;
  }
  // 3. ATRÁS (Cono centrado en ~150)
  else if (val >= 119 && val <= 170) {
    targetIzq = -VEL_CRUCERO;
    targetDer = -VEL_CRUCERO;
  }
  // 4. GIRO DERECHA (Cono centrado en ~190 y cierre del círculo)
  else {
    targetIzq = VEL_GIRO;
    targetDer = -VEL_GIRO;
  }
}

// =================================================================
// 4. CONTROL PROGRESIVO DE VELOCIDAD (RAMPA PWM)
// =================================================================
void actualizarMotoresRampa() {
  // Rampa Motor Izquierdo
  if (currentIzq < targetIzq) {
    currentIzq += PASO_RAMPA;
    if (currentIzq > targetIzq) currentIzq = targetIzq;
  } else if (currentIzq > targetIzq) {
    currentIzq -= PASO_RAMPA;
    if (currentIzq < targetIzq) currentIzq = targetIzq;
  }

  // Rampa Motor Derecho
  if (currentDer < targetDer) {
    currentDer += PASO_RAMPA;
    if (currentDer > targetDer) currentDer = targetDer;
  } else if (currentDer > targetDer) {
    currentDer -= PASO_RAMPA;
    if (currentDer < targetDer) currentDer = targetDer;
  }

  // Aplicar a los drivers
  if (currentIzq == 0 && currentDer == 0) {
    motorIzq.brake();
    motorDer.brake();
    isMoving = false;
    digitalWrite(revLights, LOW);
  } else {
    motorIzq.drive(currentIzq);
    motorDer.drive(currentDer);
    isMoving = true;
    
    // Luz de reversa si ambos retroceden
    if (currentIzq < 0 && currentDer < 0) {
      digitalWrite(revLights, HIGH);
    } else {
      digitalWrite(revLights, LOW);
    }
  }
}

void actualizarLuces() {
  digitalWrite(frontLights, masterLights ? HIGH : LOW);

  // Luz de freno
  if (!isMoving) {
    digitalWrite(rearLights, HIGH);
  } else {
    digitalWrite(rearLights, masterLights ? HIGH : LOW);
  }

  // Balizas e intermitentes
  if (hazardLights) {
    digitalWrite(indLeft, stateBlink ? HIGH : LOW);
    digitalWrite(indRight, stateBlink ? HIGH : LOW);
  } else {
    digitalWrite(indLeft, (blinkL && stateBlink) ? HIGH : LOW);
    digitalWrite(indRight, (blinkR && stateBlink) ? HIGH : LOW);
  }
}

// =================================================================
// 5. SETUP & LOOP
// =================================================================
void setup() {
  Serial.begin(115200);

  pinMode(frontLights, OUTPUT);
  pinMode(rearLights,  OUTPUT);
  pinMode(revLights,   OUTPUT);
  pinMode(indLeft,     OUTPUT);
  pinMode(indRight,    OUTPUT);

  motorIzq.brake();
  motorDer.brake();

  BLEDevice::init("ESP32_CAR_BLE");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pRxCharacteristic->setCallbacks(new MyCallbacks());

  BLECharacteristic *pTxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  pService->start();
  BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();

  Serial.println(">>> Sistema con Rampa PWM listo");
}

void loop() {
  // Tarea de rampa cada 15 ms para aceleración continua
  static unsigned long lastMotorUpdate = 0;
  if (millis() - lastMotorUpdate >= 15) {
    lastMotorUpdate = millis();
    actualizarMotoresRampa();
  }

  // Destello de luces cada 500 ms
  if (millis() - lastBlink >= 500) {
    lastBlink = millis();
    stateBlink = !stateBlink;
  }

  actualizarLuces();

  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}