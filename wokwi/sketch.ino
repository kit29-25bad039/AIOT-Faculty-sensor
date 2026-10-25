/*
 * AIoT ESP32 Faculty Sensor Monitoring System
 * Firmware for Wokwi Simulation & Real Hardware
 * 
 * 5 Monitored Sensors:
 * 1. Temperature (°C) - DHT22 (GPIO 15)
 * 2. Humidity (%)     - DHT22 (GPIO 15)
 * 3. Vibration (mm/s) - Analog Potentiometer / Piezo (GPIO 34)
 * 4. Light (Lux)      - LDR Photoresistor (GPIO 35)
 * 5. Gas / Air (PPM)  - MQ-2 Gas Potentiometer (GPIO 32)
 *
 * Actuators & Feedback:
 * - Green LED (GPIO 2): Normal Operation
 * - Red LED (GPIO 4): AI Faculty Fault Alert
 * - SSD1306 OLED (I2C SDA=21, SCL=22): Real-time Onboard Diagnostics
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>

// --- PIN DEFINITIONS ---
#define DHTPIN 15
#define DHTTYPE DHT22
#define PIN_VIBRATION 34
#define PIN_LDR 35
#define PIN_GAS 32
#define PIN_LED_OK 2
#define PIN_LED_ERR 4

// --- OLED CONFIGURATION ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- DHT CONFIGURATION ---
DHT dht(DHTPIN, DHTTYPE);

// --- WIFI & MQTT CONFIGURATION ---
const char* ssid = "Wokwi-GUEST";
const char* password = "";
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* mqtt_topic_pub = "wokwi/aiot/faculty-monitor/telemetry";
const char* mqtt_topic_sub = "wokwi/aiot/faculty-monitor/commands";

WiFiClient espClient;
PubSubClient client(espClient);

// --- SAFETY THRESHOLD DEFAULTS (CAN BE OVERRIDDEN VIA MQTT) ---
float THRESHOLD_TEMP_MAX = 45.0;     // °C
float THRESHOLD_TEMP_MIN = 5.0;      // °C
float THRESHOLD_HUM_MIN  = 20.0;     // %
float THRESHOLD_HUM_MAX  = 85.0;     // %
float THRESHOLD_VIBE_MAX = 55.0;     // mm/s
float THRESHOLD_LIGHT_MIN = 20.0;    // Lux (dropout)
float THRESHOLD_GAS_MAX  = 450.0;    // PPM

// Timing
unsigned long lastTelemetryTime = 0;
const unsigned long telemetryInterval = 1000; // 1 second

// Stuck-at fault detection buffer
float lastVibe = -1;
int vibeStuckCounter = 0;

void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected! IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi not connected (running in local offline mode).");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("MQTT Command Received [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);

  // Parse command JSON if sent from web frontend
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (!error) {
    if (doc.containsKey("temp_max")) THRESHOLD_TEMP_MAX = doc["temp_max"];
    if (doc.containsKey("gas_max")) THRESHOLD_GAS_MAX = doc["gas_max"];
    if (doc.containsKey("vibe_max")) THRESHOLD_VIBE_MAX = doc["vibe_max"];
    Serial.println("Updated local safety thresholds from AI Faculty Command.");
  }
}

void reconnectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!client.connected()) {
    String clientId = "ESP32-FacultyNode-" + String(random(0xffff), HEX);
    Serial.print("Attempting MQTT connection as ");
    Serial.print(clientId);
    Serial.print("...");
    if (client.connect(clientId.c_str())) {
      Serial.println("connected!");
      client.subscribe(mqtt_topic_sub);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" (will retry next loop)");
    }
  }
}

void renderOLED(float temp, float hum, float vibe, float light, float gas, bool fault, String grade, String faultDesc) {
  display.clearDisplay();
  
  // Header banner
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print("AI FACULTY MONITOR");
  display.setCursor(110, 0);
  display.print(grade);
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // Sensor telemetry matrix
  display.setCursor(0, 12);
  display.printf("T:%.1fC  H:%.0f%%", temp, hum);
  
  display.setCursor(0, 22);
  display.printf("Vibe:%.1fmm/s", vibe);

  display.setCursor(0, 32);
  display.printf("Light:%.0fLx Gas:%.0fP", light, gas);

  display.drawLine(0, 43, 127, 43, SSD1306_WHITE);

  // Status / Faculty Advisory
  display.setCursor(0, 47);
  if (fault) {
    display.setTextColor(SSD1306_WHITE);
    display.print("! FAULT DETECTED !");
    display.setCursor(0, 56);
    display.print(faultDesc.substring(0, 21));
  } else {
    display.print("STATUS: OPTIMAL");
    display.setCursor(0, 56);
    display.print("ALL SENSORS NOMINAL");
  }

  display.display();
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=============================================");
  Serial.println(" AIoT ESP32 Faculty Sensor Surveillance Node ");
  Serial.println("=============================================");

  // Pin Modes
  pinMode(PIN_LED_OK, OUTPUT);
  pinMode(PIN_LED_ERR, OUTPUT);
  pinMode(PIN_VIBRATION, INPUT);
  pinMode(PIN_LDR, INPUT);
  pinMode(PIN_GAS, INPUT);

  digitalWrite(PIN_LED_OK, LOW);
  digitalWrite(PIN_LED_ERR, LOW);

  // Init Sensors & Display
  dht.begin();

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 OLED allocation failed"));
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 20);
    display.println("AIoT Faculty Booting...");
    display.display();
  }

  // Init Network
  setupWiFi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);

  digitalWrite(PIN_LED_OK, HIGH);
  delay(500);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      reconnectMQTT();
    }
    client.loop();
  }

  unsigned long currentMillis = millis();
  if (currentMillis - lastTelemetryTime >= telemetryInterval) {
    lastTelemetryTime = currentMillis;

    // --- 1. SENSOR SAMPLING ---
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();

    // Analog reads (0-4095 on ESP32 ADC)
    int rawVibe = analogRead(PIN_VIBRATION);
    int rawLdr  = analogRead(PIN_LDR);
    int rawGas  = analogRead(PIN_GAS);

    // Engineering Unit Conversions
    float vibe = (rawVibe / 4095.0) * 100.0;     // 0.0 to 100.0 mm/s
    // LDR: higher resistance = darker, analog pin inverted or direct
    float light = (rawLdr / 4095.0) * 1000.0;    // 0 to 1000 Lux
    float gas   = (rawGas / 4095.0) * 1000.0;    // 0 to 1000 PPM

    // --- 2. AI FACULTY INSPECTOR EVALUATION ---
    bool isFault = false;
    String faultSensor = "NONE";
    String faultReason = "Optimal";
    String facultyGrade = "A+";
    int healthScore = 100;

    // A) Check Temperature
    if (isnan(temp)) {
      isFault = true;
      faultSensor = "DHT22_TEMP";
      faultReason = "Sensor Read Failure / Disconnected";
      facultyGrade = "F";
      healthScore -= 40;
      temp = 0.0;
    } else if (temp > THRESHOLD_TEMP_MAX) {
      isFault = true;
      faultSensor = "DHT22_TEMP";
      faultReason = "Critical High Thermal Breach (" + String(temp, 1) + "C)";
      facultyGrade = "D";
      healthScore -= 35;
    } else if (temp < THRESHOLD_TEMP_MIN) {
      isFault = true;
      faultSensor = "DHT22_TEMP";
      faultReason = "Sub-Zero / Low Thermal Breach (" + String(temp, 1) + "C)";
      facultyGrade = "C";
      healthScore -= 25;
    }

    // B) Check Humidity
    if (isnan(hum)) {
      isFault = true;
      if (faultSensor == "NONE") faultSensor = "DHT22_HUM";
      faultReason = "Humidity Sensor Line Dropout";
      facultyGrade = "F";
      healthScore -= 40;
      hum = 0.0;
    } else if (hum > THRESHOLD_HUM_MAX || hum < THRESHOLD_HUM_MIN) {
      isFault = true;
      if (faultSensor == "NONE") {
        faultSensor = "DHT22_HUM";
        faultReason = "Humidity Beyond Margin (" + String(hum, 0) + "%)";
      }
      facultyGrade = (facultyGrade == "A+") ? "C" : facultyGrade;
      healthScore -= 20;
    }

    // C) Check Vibration
    if (vibe > THRESHOLD_VIBE_MAX) {
      isFault = true;
      faultSensor = "VIBE_ANALOG";
      faultReason = "Severe Structural Vibration (" + String(vibe, 1) + "mm/s)";
      facultyGrade = "F";
      healthScore -= 45;
    }

    // D) Check Light / Lux (Flatline detection)
    if (rawLdr < 50) {
      // Near 0 Lux indicates sensor disconnected or occluded
      isFault = true;
      faultSensor = "LDR_LUX";
      faultReason = "Optical Signal Flatline / Sensor Dropout";
      facultyGrade = (facultyGrade == "A+") ? "C" : facultyGrade;
      healthScore -= 20;
    }

    // E) Check Gas / PPM
    if (gas > THRESHOLD_GAS_MAX) {
      isFault = true;
      faultSensor = "MQ2_GAS";
      faultReason = "Hazardous Gas Concentration (" + String(gas, 0) + "PPM)";
      facultyGrade = "F";
      healthScore -= 50;
    }

    if (healthScore < 0) healthScore = 0;
    if (healthScore >= 90) facultyGrade = "A+";
    else if (healthScore >= 75) facultyGrade = "B";
    else if (healthScore >= 60) facultyGrade = "C";
    else if (healthScore >= 40) facultyGrade = "D";
    else facultyGrade = "F";

    // --- 3. PHYSICAL HARDWARE ACTUATION ---
    if (isFault) {
      digitalWrite(PIN_LED_OK, LOW);
      digitalWrite(PIN_LED_ERR, HIGH);
    } else {
      digitalWrite(PIN_LED_OK, HIGH);
      digitalWrite(PIN_LED_ERR, LOW);
    }

    // Render to OLED
    renderOLED(temp, hum, vibe, light, gas, isFault, facultyGrade, faultReason);

    // --- 4. FORMAT JSON PAYLOAD ---
    StaticJsonDocument<512> jsonDoc;
    jsonDoc["device"] = "ESP32-AIOT-NODE-01";
    jsonDoc["uptime_s"] = currentMillis / 1000;
    jsonDoc["temp"] = serialized(String(temp, 2));
    jsonDoc["hum"] = serialized(String(hum, 2));
    jsonDoc["vibe"] = serialized(String(vibe, 2));
    jsonDoc["light"] = serialized(String(light, 1));
    jsonDoc["gas"] = serialized(String(gas, 1));
    jsonDoc["fault"] = isFault;
    jsonDoc["fault_sensor"] = faultSensor;
    jsonDoc["fault_reason"] = faultReason;
    jsonDoc["faculty_grade"] = facultyGrade;
    jsonDoc["health_score"] = healthScore;

    String jsonString;
    serializeJson(jsonDoc, jsonString);

    // Print to Serial for WebSerial / Wokwi terminal inspection
    Serial.print("[TELEMETRY] ");
    Serial.println(jsonString);

    // Publish to MQTT
    if (client.connected()) {
      client.publish(mqtt_topic_pub, jsonString.c_str());
    }
  }
}
