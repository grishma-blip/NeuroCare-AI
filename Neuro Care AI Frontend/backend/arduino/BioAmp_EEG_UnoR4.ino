/*
 * NeuroCare — BioAmp EXG Pill with Arduino UNO R4 WiFi
 * ----------------------------------------------------
 * Acquires single-channel EEG from BioAmp EXG Pill (A0).
 * Configured for 256 Hz sampling frequency (3906.25 microseconds period).
 * Hardware analog bandpass: 0.5 Hz - 29.5 Hz on the BioAmp EXG PCB.
 *
 * Hardware Connections:
 *   - BioAmp VCC -> Arduino 5V (or 3.3V)
 *   - BioAmp GND -> Arduino GND
 *   - BioAmp OUT -> Arduino A0
 *
 * Output format:
 *   Continuous CSV stream over USB Serial at 115200 baud:
 *   <timestamp_ms>,<voltage_microvolts>
 */

const int EEG_PIN = A0;
const unsigned long SAMPLE_INTERVAL_US = 3906; // 1,000,000 / 256 Hz ~ 3906 us
const float ADC_REF_V = 5.0;                   // 5.0V reference
const int ADC_RESOLUTION = 12;                 // 12-bit ADC on UNO R4 (0 - 4095)
const float BIOAMP_GAIN = 2420.0;              // BioAmp EXG Pill nominal instrumentation gain

unsigned long lastSampleMicros = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {
    // Wait for serial enumeration
  }

  // Set 12-bit resolution for Arduino UNO R4 Renesas RA4M1 ADC
  #if defined(ARDUINO_UNOR4_WIFI) || defined(ARDUINO_UNOR4_MINIMA)
  analogReadResolution(12);
  #endif

  pinMode(EEG_PIN, INPUT);
  lastSampleMicros = micros();
}

void loop() {
  unsigned long currentMicros = micros();
  if (currentMicros - lastSampleMicros >= SAMPLE_INTERVAL_US) {
    lastSampleMicros += SAMPLE_INTERVAL_US;

    int rawAdc = analogRead(EEG_PIN);
    unsigned long timestampMs = millis();

    // Convert raw ADC to input-referred EEG voltage in microvolts (uV)
    // V_adc = (rawAdc / 4095.0) * ADC_REF_V
    // V_in = (V_adc - (ADC_REF_V / 2.0)) / BIOAMP_GAIN * 1,000,000 uV
    float vAdc = ((float)rawAdc / 4095.0) * ADC_REF_V;
    float vMicrovolts = ((vAdc - (ADC_REF_V / 2.0)) / BIOAMP_GAIN) * 1000000.0;

    Serial.print(timestampMs);
    Serial.print(",");
    Serial.println(vMicrovolts, 2);
  }
}

