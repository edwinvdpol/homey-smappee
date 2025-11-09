'use strict';

const mqtt = require('async-mqtt');
const Device = require('./Device');
const { blank } = require('./Utils');

class MqttDevice extends Device {

  static MQTT_INTERVAL = 60; // Seconds

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    // Reset capabilities
    await this.resetCapabilities();

    // Register MQTT timer
    this.registerMqttTimer();

    // Initialise parent device
    await super.onOAuth2Init();

    // Connect to MQTT broker
    await this.connect();
  }

  // Device destroyed
  async onOAuth2Uninit() {
    // Unregister MQTT timer
    this.unregisterMqttTimer();

    await this.untrack();
    await this.disconnect();

    await super.onOAuth2Uninit();
  }

  // MQTT action
  async onMqttTimer() {
    if (!this.mqtt) return this.connect();

    return this.resetTracking();
  }

  /*
  | MQTT actions
  */

  // Disconnect
  async disconnect() {
    if (!this.mqtt) return;

    try {
      this.log('[MQTT] Disconnecting');

      await this.mqtt.unsubscribe(this.topic);

      this.log(`[MQTT] Unsubscribed from ${this.topic}`);

      // This line doesn't run until the server responds to the publishing
      await this.mqtt.end();
    } catch (err) {
      this.onError(err);
    } finally {
      this.log('[MQTT] Disconnected');

      // Clear data
      this.setDefaults();
    }
  }

  // Connect
  async connect() {
    this.log('[MQTT] Connecting');

    const homeyId = await this.homey.cloud.getHomeyId();

    // Set MQTT topic and client ID
    this.topic = `servicelocation/${this.serviceLocationUuid}/${this.subscribeTopic()}`;
    this.clientId = `homey-${homeyId}-${this.getData().id}`;

    const client = mqtt.connect('mqtts://mqtt.smappee.net:443', {
      clientId: this.clientId,
      clean: true,
      connectTimeout: 5000,
      username: this.serviceLocationUuid,
      password: this.serviceLocationUuid,
      reconnectPeriod: 3000,
    });

    // Register listeners
    client.on('connect', this.onConnect.bind(this));
    client.on('disconnect', this.onDisconnect.bind(this));
    client.on('error', this.onError.bind(this));
    client.on('message', this.onParseMessage.bind(this));
    client.on('offline', this.onOffline.bind(this));
    client.on('reconnect', this.onReconnect.bind(this));

    this.mqtt = client;

    this.log('[MQTT] Connected');
  }

  // Publish message
  async publish(topic, message = {}) {
    if (!this.mqtt) return;

    const data = JSON.stringify(message);

    this.log('[MQTT] Publish:', topic, data);

    if (!this.mqtt.connected) {
      this.error('[MQTT] Client not connected');

      return;
    }

    await this.mqtt.publish(topic, data);
  }

  /*
  | Tracking functions
  */

  // Reset tracking
  async resetTracking() {
    await this.untrack();

    // Wait two seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await this.track();
  }

  // Publish track message
  async track(on = true) {
    const value = on ? 'ON' : 'OFF';

    this.log('[MQTT] Publish tracking:', value);

    await this.publish(
      `servicelocation/${this.serviceLocationUuid}/tracking`, {
        value,
        clientId: this.clientId,
        serialNumber: this.getSetting('serial_number'),
        type: 'RT_VALUES',
      },
    );
  }

  // Publish untrack message
  async untrack() {
    await this.track(false);
  }

  /*
  | MQTT Events
  */

  async onParseMessage(topic, message) {
    if (blank(message)) return;

    let data;

    try {
      data = JSON.parse(message.toString());

      // Contains JSON content (update message)
      if ('jsonContent' in data) {
        data = JSON.parse(data.jsonContent);
      }

      // Strip unused data
      data = this.stripMessageData(data);

      // Process data
      await this.onMessage(topic, data);

      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('[Parse]', err.message);
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      message = null;
      data = null;
    }
  }

  // MQTT connect event
  async onConnect() {
    this.unsetWarning().catch(this.error);

    try {
      // Subscribe
      await this.mqtt.subscribe(this.topic);

      this.log(`[MQTT] Subscribed to ${this.topic}`);

      // Track
      await this.track();
    } catch (err) {
      this.onError(err);
    }
  }

  // MQTT disconnect event
  onDisconnect() {
    this.log('[MQTT] Disconnected');
    this.setMqttWarning('service.disconnected');
  }

  // MQTT error event
  onError(err) {
    this.error('[MQTT]', err.message);
    this.setMqttWarning('service.error');
  }

  // MQTT offline event
  onOffline() {
    this.error('[MQTT] Offline!');
    this.setMqttWarning('service.offline');
  }

  // MQTT reconnect event
  onReconnect() {
    this.log('[MQTT] Reconnected');
    this.setMqttWarning('service.reconnect');
  }

  /*
  | MQTT timer functions
  */

  // Register timer
  registerMqttTimer() {
    if (this.mqttTimer) return;

    const interval = 1000 * this.constructor.MQTT_INTERVAL;

    this.mqttTimer = this.homey.setInterval(this.onMqttTimer.bind(this), interval);

    this.log('[MQTT Timer] Registered');
  }

  // Unregister timer
  unregisterMqttTimer() {
    if (!this.mqttTimer) return;

    this.homey.clearTimeout(this.mqttTimer);

    this.mqttTimer = null;

    this.log('[MQTT Timer] Unregistered');
  }

  /*
  | Support functions
  */

  // Reset capabilities
  async resetCapabilities() {
    if (this.hasCapability('measure_power.consumption')) {
      this.removeCapability('measure_power.consumption').catch(this.error);
    }

    if (this.hasCapability('measure_power')) {
      this.setCapabilityValue('measure_power', 0).catch(this.error);
    }

    if (this.hasCapability('measure_power.alwayson')) {
      this.setCapabilityValue('measure_power.alwayson', 0).catch(this.error);
    }

    if (this.hasCapability('measure_power.production')) {
      this.setCapabilityValue('measure_power.production', 0).catch(this.error);
    }
  }

  // Set default data
  setDefaults() {
    super.setDefaults();

    this.mqtt = null;
    this.topic = null;
  }

  // Set MQTT warning message
  setMqttWarning(locale) {
    this.setWarning(this.homey.__(locale, { service: this.homey.__('mqtt') })).catch(this.error);
  }

  // Strip data from message
  stripMessageData(data) {
    if (blank(data)) return {};

    // Nodes which must be deleted
    let nodes = [
      // 'channelData',
      'activePowerData', 'reactivePowerData', 'currentData',
      'exportActiveEnergyData', 'froggySensorDailyDeltas',
      'importActiveEnergyData', 'infinityInputSensorDailyDeltas',
      'lineVoltageData',
      'lineVoltageH1Data', 'lineVoltageH2Data', 'lineVoltageH3Data',
      'lineVoltageH4Data', 'lineVoltageH5Data', 'lineVoltageH6Data',
      'phaseVoltageData',
      'phaseVoltageH1Data', 'phaseVoltageH2Data', 'phaseVoltageH3Data',
      'phaseVoltageH4Data', 'phaseVoltageH5Data', 'phaseVoltageH6Data',
    ];

    // Delete nodes
    nodes.forEach((node) => delete data[node]);

    nodes = null;

    return data;
  }

}

module.exports = MqttDevice;
