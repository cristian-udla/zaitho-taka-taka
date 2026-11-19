#include <SparkFun_TB6612.h>

// Definición de pines para ESP32-S3 y TB6612FNG
#define pin_PWMA  5    
#define pin_AIN2  6    
#define pin_AIN1  7    
#define pin_STBY  8    
#define pin_BIN1  9    
#define pin_BIN2 10    
#define pin_PWMB 11    

#define DIR_NORMAL   1
#define DIR_INVERSA -1

// Configuración ya calibrada para tu chasis
Motor motorIzq = Motor(pin_AIN1, pin_AIN2, pin_PWMA, DIR_NORMAL,  pin_STBY);
Motor motorDer = Motor(pin_BIN1, pin_BIN2, pin_PWMB, DIR_INVERSA, pin_STBY);

// ==========================================
// FUNCIONES DE CONTROL DE MOVIMIENTO
// ==========================================

void avanzar(int velocidad) {
  motorIzq.drive(velocidad);
  motorDer.drive(velocidad);
}

void retroceder(int velocidad) {
  motorIzq.drive(-velocidad);
  motorDer.drive(-velocidad);
}

// Gira sobre su eje hacia la izquierda: lado izq retrocede, lado der avanza
void girarIzquierda(int velocidad) {
  motorIzq.drive(-velocidad);
  motorDer.drive(velocidad);
}

// Gira sobre su eje hacia la derecha: lado izq avanza, lado der retrocede
void girarDerecha(int velocidad) {
  motorIzq.drive(velocidad);
  motorDer.drive(-velocidad);
}

void frenar() {
  motorIzq.brake();
  motorDer.brake();
}

void setup() {
  delay(1000); // Pausa de seguridad al encender
}

void loop() {
  int vel = 200; // Velocidad de prueba (rango 0 a 255)

  // 1. Avanzar
  avanzar(vel);
  delay(1500);
  frenar();
  delay(800);

  // 2. Retroceder
  retroceder(vel);
  delay(1500);
  frenar();
  delay(800);

  // 3. Girar a la izquierda sobre su propio eje
  girarIzquierda(vel);
  delay(1500);
  frenar();
  delay(800);

  // 4. Girar a la derecha sobre su propio eje
  girarDerecha(vel);
  delay(1500);
  frenar();
  delay(2000); // Pausa antes de repetir toda la secuencia
}