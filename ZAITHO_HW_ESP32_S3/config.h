#ifndef CONFIG_H
#define CONFIG_H

// =================================================================
// CONFIGURACIÓN CALIBRADA DEL CHASIS VALHO / ZAITHO (ESP32-S3)
// =================================================================

// --- Nombre Bluetooth BLE (Nordic UART Service) ---
#define DEVICE_NAME            "ZAITHO_ROBOT"
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

// --- Driver de Motores TB6612FNG (Pines calibrados VALHO) ---
#define pin_PWMA  5
#define pin_AIN2  6
#define pin_AIN1  7
#define pin_STBY  8
#define pin_BIN1  9
#define pin_BIN2 10
#define pin_PWMB 11

#define DIR_NORMAL   1
#define DIR_INVERSA -1

// --- Luces del Vehículo (Pines calibrados VALHO) ---
#define PIN_FRONT_LIGHTS 1   // Luces delanteras
#define PIN_REAR_LIGHTS  2   // Freno / Luces traseras
#define PIN_REV_LIGHTS   3   // Luz de marcha atrás (reversa)
#define PIN_IND_LEFT     4   // Intermitente Izquierdo
#define PIN_IND_RIGHT    12  // Intermitente Derecho

// --- Sensor Ultrasónico HC-SR04 ---
#define TRIG_PIN 15
#define ECHO_PIN 16

// Umbrales del Sensor HC-SR04 (en cm)
#define DIST_PELIGRO_CM    14.0  // Muy cerca: retroceso reflejo inmediato
#define DIST_OBSTACULO_CM  28.0  // Obstáculo frontal: frenar y escanear salida
#define DIST_CAUTELA_CM    75.0  // Zona donde empieza a desacelerar proporcionalmente
#define DIST_CURIOSIDAD_CM 42.0  // Objeto se acerca cuando está quieto
#define DIST_MAX_VALIDA_CM 400.0 // Rango máximo del HC-SR04

// =================================================================
// MAPEO DE VELOCIDAD VARIABLE (TB6612FNG PWM 0..255)
// =================================================================
#define PWM_MIN_TORQUE     102   // Velocidad mínima real (1%) para avanzar muy despacio
#define PWM_KICKSTART      175   // Pulso corto (40ms) para romper inercia al arrancar lento
#define PWM_MAX_TORQUE     255   // Velocidad máxima (100%)

// Porcentajes de velocidad predefinidos (0% a 100%)
#define PCT_EXPLORACION_MIN 18   // Paso ultra lento cuando se acerca a observar algo
#define PCT_EXPLORACION_MAX 35   // Velocidad máxima en modo exploración (siempre lento)
#define PCT_GIRO_EXPLORA    28   // Giro suave en modo exploración para medir con calma
#define PCT_CRUCERO_NORMAL  65   // Velocidad media/normal cuando se mueve por comando
#define PCT_RAPIDO_TURBO    95   // Velocidad rápida cuando se le pide ir rápido
#define PCT_GESTO           55   // Velocidad para gestos expresivos (wiggle/baile)

#define PASO_RAMPA_SUAVE    6    // Rampa muy suave en exploración
#define PASO_RAMPA_RAPIDA   14   // Rampa ágil en modo rápido

// --- Intervalos ---
#define MOTOR_UPDATE_MS  15
#define SENSOR_UPDATE_MS 150
#define BLINK_INTERVAL   400

// --- Tipos de Gestos y Coreografías (Declarados en config.h para el preprocesador de Arduino) ---
enum GestureType {
  GESTURE_NONE = 0,
  GESTURE_WIGGLE,
  GESTURE_EXCITED,
  GESTURE_CURIOUS,
  GESTURE_JOLT,
  GESTURE_AVOID_SCAN,    // Escanea lento Izq/Der, mide y aprende qué lado es mejor
  GESTURE_OBSERVE_PAUSE  // Pausa periódica en exploración: mira un poquito a ambos lados y mide
};

#endif
