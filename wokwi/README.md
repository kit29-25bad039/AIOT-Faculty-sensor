# AIoT ESP32 Faculty Sensor Surveillance Node (Wokwi Simulation)

This directory contains the complete simulation setup for the **AIoT Faculty Sensor Monitoring Project** using an ESP32 in Wokwi.

## Hardware Schematic Overview
- **Microcontroller**: ESP32 DevKit v4
- **Sensor 1 (Temperature)**: DHT22 connected to GPIO 15
- **Sensor 2 (Humidity)**: DHT22 connected to GPIO 15
- **Sensor 3 (Vibration)**: Potentiometer simulating Piezo/Vibration transducer on GPIO 34 (ADC1)
- **Sensor 4 (Optical / Light)**: LDR Photoresistor on GPIO 35 (ADC1)
- **Sensor 5 (Gas / Air Quality)**: Potentiometer simulating MQ-2 Gas sensor on GPIO 32 (ADC1)
- **Feedback Display**: SSD1306 128x64 I2C OLED (SDA=GPIO 21, SCL=GPIO 22)
- **Alert LEDs**:
  - Green LED (GPIO 2) = Nominal / Faculty Grade A+
  - Red LED (GPIO 4) = Faculty Anomaly / Threshold Breach / Sensor Failure

---

## How to Run in Wokwi (Option 1: Quick Browser Import)
1. Go to [https://wokwi.com/projects/new/esp32](https://wokwi.com/projects/new/esp32).
2. Replace the contents of `sketch.ino` with the code from [wokwi/sketch.ino](file:///c:/Users/Dharani%20G/OneDrive/Documents/Desktop/New%20folder/wokwi/sketch.ino).
3. Switch to the `diagram.json` tab in Wokwi (or create one) and replace it with [wokwi/diagram.json](file:///c:/Users/Dharani%20G/OneDrive/Documents/Desktop/New%20folder/wokwi/diagram.json).
4. Click on the `Library Manager` tab (represented by a book icon or `libraries.txt`) and add:
   - `DHT sensor library`
   - `Adafruit Unified Sensor`
   - `Adafruit SSD1306`
   - `Adafruit GFX Library`
   - `PubSubClient`
   - `ArduinoJson`
5. Click **Start Simulation (Play button)**.

---

## Live Connectivity with Web Frontend
- The ESP32 simulation connects to `Wokwi-GUEST` WiFi and publishes JSON telemetry to the public MQTT broker `broker.emqx.io` on topic `wokwi/aiot/faculty-monitor/telemetry`.
- When you open the frontend web dashboard (`index.html`), it connects to the same broker via secure WebSockets (`wss://broker.emqx.io:8084/mqtt`).
- Changes made in Wokwi (turning potentiometers, changing DHT22 values) immediately reflect on the web dashboard charts and AI Faculty diagnosis in real-time!
- In addition, the frontend has a **Built-in Physics & Telemetry Simulator** so you can also run and evaluate everything standalone right in the web browser without waiting for Wokwi.
