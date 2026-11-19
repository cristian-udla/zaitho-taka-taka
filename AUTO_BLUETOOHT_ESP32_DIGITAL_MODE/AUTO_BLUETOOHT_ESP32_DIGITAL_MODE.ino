#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <SparkFun_TB6612.h>

// =================================================================
// 1. ASIGNACIÓN DE PINES (ESP32-S3)
// =================================================================

// --- Driver TB6612FNG ---
#define pin_PWMA  5    
#define pin_AIN2  6    
#define pin_AIN1  7    
#define pin_STBY  8    
#define pin_BIN1  9    
#define pin_BIN2 10    
#define pin_PWMB 11    

// Sentidos ya calibrados para tu chasis
#define DIR_NORMAL   1
#define DIR_INVERSA -1

Motor motorIzq = Motor(pin_AIN1, pin_AIN2, pin_PWMA, DIR_NORMAL,  pin_STBY);
Motor motorDer = Motor(pin_BIN1, pin_BIN2, pin_PWMB, DIR_INVERSA, pin_STBY);

// --- Luces (reasignadas para liberar los pines del TB6612) ---
const int frontLights = 1;   // Luces delanteras
const int rearLights  = 2;   // Freno / Luces traseras
const int revLights   = 3;   // Luz de marcha atrás (reversa)
const int indLeft     = 4;   // Intermitente Izquierdo
const int indRight    = 12;  // Intermitente Derecho

// Velocidad fija estática para esta fase (rango 0 a 255)
const int VEL_ESTATICA = 255;

// =================================================================
// 2. CONFIGURACIÓN BLE
// =================================================================
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;
bool isMoving = false;

// --- ESTADOS DE LUCES ---
bool masterLights = false;   
bool hazardLights = false;   
bool blinkL = false;         
bool blinkR = false;         
unsigned long lastBlink = 0;
bool stateBlink = false;

// Prototipos
void moveForward();
void moveBackward();
void turnLeft();
void turnRight();
void stopMovement();
void actualizarLuces();
void controlCar(char cmd);

// Callbacks de conexión
class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println(">>> BLE Conectado");
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    stopMovement(); // Freno por seguridad si se corta la señal
    Serial.println(">>> BLE Desconectado");
  }
};

// Callbacks de recepción de datos
class MyCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = pCharacteristic->getValue();

    // Caso 1: Paquete de control por Bytes (control remoto por app con gamepad)
    if (value.length() >= 8) {
      uint8_t b5 = (uint8_t)value[5]; 
      uint8_t b6 = (uint8_t)value[6]; 

      // Movimiento (Byte 6)
      if (b6 == 0x01)      moveForward();
      else if (b6 == 0x02) moveBackward();
      else if (b6 == 0x04) turnLeft();
      else if (b6 == 0x08) turnRight();
      else if (b6 == 0x00) stopMovement();

      // Botones / Luces (Byte 5)
      if (b5 == 0x04) { // Triángulo: Balizas
        hazardLights = !hazardLights; 
        blinkL = false; 
        blinkR = false; 
      }
      if (b5 == 0x20) { // Cuadrado: Giro Izquierda
        blinkL = !blinkL; 
        blinkR = false; 
        hazardLights = false; 
      }
      if (b5 == 0x08) { // Círculo: Giro Derecha
        blinkR = !blinkR; 
        blinkL = false; 
        hazardLights = false; 
      }
      if (b5 == 0x10) { // Equis (X): Parada de emergencia
        stopMovement(); 
        blinkL = false; 
        blinkR = false; 
        hazardLights = false; 
      }
      if (b5 == 0x01) { // Start: Luces principales
        masterLights = !masterLights; 
      }
      return;
    }

    // Caso 2: Comandos ASCII simples (por terminal serie / botones simples)
    if (value.length() > 0) {
      for (int i = 0; i < value.length(); i++) {
        controlCar(value[i]);
      }
    }
  }
};

// =================================================================
// 3. SETUP
// =================================================================
void setup() {
  Serial.begin(115200);

  // Inicialización de pines de luces
  pinMode(frontLights, OUTPUT);
  pinMode(rearLights,  OUTPUT);
  pinMode(revLights,   OUTPUT);
  pinMode(indLeft,     OUTPUT);
  pinMode(indRight,    OUTPUT);

  stopMovement();

  // Inicialización BLE
  BLEDevice::init("ESP32_CAR_BLE");
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

  Serial.println(">>> Sistema Listo y Transmitiendo BLE...");
}

// =================================================================
// 4. BUCLE PRINCIPAL
// =================================================================
void loop() {
  // Oscilador para intermitentes (cada 500 ms)
  if (millis() - lastBlink >= 500) {
    lastBlink = millis();
    stateBlink = !stateBlink;
  }

  actualizarLuces();

  // Gestión de reconexión BLE
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  delay(10);
}

// =================================================================
// 5. CONTROL DE MOTORES CON TB6612
// =================================================================

void moveForward() {
  motorIzq.drive(VEL_ESTATICA);
  motorDer.drive(VEL_ESTATICA);
  digitalWrite(revLights, LOW);
  isMoving = true;
  Serial.println("Adelante");
}

void moveBackward() {
  motorIzq.drive(-VEL_ESTATICA);
  motorDer.drive(-VEL_ESTATICA);
  digitalWrite(revLights, HIGH); // Enciende reversa
  isMoving = true;
  Serial.println("Atrás");
}

void turnLeft() {
  motorIzq.drive(-VEL_ESTATICA); // Izquierda retrocede
  motorDer.drive(VEL_ESTATICA);  // Derecha avanza
  digitalWrite(revLights, LOW);
  isMoving = true;
  Serial.println("Giro Izquierda");
}

void turnRight() {
  motorIzq.drive(VEL_ESTATICA);  // Izquierda avanza
  motorDer.drive(-VEL_ESTATICA); // Derecha retrocede
  digitalWrite(revLights, LOW);
  isMoving = true;
  Serial.println("Giro Derecha");
}

void stopMovement() {
  motorIzq.brake();
  motorDer.brake();
  digitalWrite(revLights, LOW);
  isMoving = false;
  Serial.println("Detenido");
}

// =================================================================
// 6. CONTROL AUXILIAR (ASCII Y LUCES)
// =================================================================

void controlCar(char cmd) {
  switch (cmd) {    
    case 'a': case 'A': moveForward(); break;
    case 'r': case 'R': moveBackward(); break;
    case 's': case 'S': stopMovement(); break;
    case 'i': case 'I': turnLeft(); break;
    case 'd': case 'D': turnRight(); break;
    
    // Luces
    case 'L': masterLights = true;  break;
    case 'l': masterLights = false; break;
    case 'P': hazardLights = true;  break;
    case 'p': hazardLights = false; break;
    case 'X': blinkL = true; blinkR = false; break;
    case 'x': blinkL = false; break;
    case 'Y': blinkR = true; blinkL = false; break;
    case 'y': blinkR = false; break;
  }
}

void actualizarLuces() {
  digitalWrite(frontLights, masterLights ? HIGH : LOW);

  // Luz de Freno: encendida fija cuando está detenido
  if (!isMoving) {
    digitalWrite(rearLights, HIGH); 
  } else {
    digitalWrite(rearLights, masterLights ? HIGH : LOW);
  }

  // Intermitentes y balizas
  if (hazardLights) {
    digitalWrite(indLeft, stateBlink ? HIGH : LOW);
    digitalWrite(indRight, stateBlink ? HIGH : LOW);
  } else {
    digitalWrite(indLeft, (blinkL && stateBlink) ? HIGH : LOW);
    digitalWrite(indRight, (blinkR && stateBlink) ? HIGH : LOW);
  }
}