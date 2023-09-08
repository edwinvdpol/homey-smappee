'use strict';

const mqtt = require('async-mqtt');
const Device = require('./Device');
const { blank, filled } = require('./Utils');

class MqttDevice extends Device {

  static TIMER_INTERVAL = 60; // Seconds

  /*
  | Device events
  */

  // Timer action
  async onTimerInterval() {
    await this.resetTracking();
  }

  // Device initialized
  async onOAuth2Init() {
    this.mqtt = null;
    this.topic = null;

    // Reset capabilities
    await this.resetCapabilities();

    // Initialise parent device
    await super.onOAuth2Init();

    // Connect to MQTT broker
    await this.connect();
  }

  // Device deleted
  async onOAuth2Deleted() {
    await this.untrack();
    await this.disconnect();

    await super.onOAuth2Deleted();
  }

  /*
  | MQTT actions
  */

  // Disconnect
  async disconnect() {
    if (!this.mqtt) return;

    this.log('[MQTT] Disconnecting');

    try {
      await this.mqtt.unsubscribe(this.topic);

      this.log(`[MQTT] Unsubscribed from ${this.topic}`);

      // This line doesn't run until the server responds to the publishing
      await this.mqtt.end();

      this.log('[MQTT] Disconnected');
    } catch (err) {
      this.onError(err);
    } finally {
      this.mqtt = null;
      this.topic = null;
    }
  }

  // Connect
  async connect() {
    const locationUuid = this.getStoreValue('service_location_uuid') || null;
    if (blank(locationUuid)) return;

    this.log('[MQTT] Connecting');

    const homeyId = await this.homey.cloud.getHomeyId();

    // Set MQTT topic and client ID
    this.topic = `servicelocation/${locationUuid}/${this.subscribeTopic()}`;
    this.clientId = `homey-${homeyId}-${this.getData().id}`;

    const client = mqtt.connect('mqtts://mqtt.smappee.net:443', {
      clientId: this.clientId,
      clean: true,
      connectTimeout: 5000,
      username: locationUuid,
      password: locationUuid,
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
  async publish(path, message = {}) {
    if (!this.mqtt) return;

    const topic = `${this.topic.replace('/#', '')}/${path}`;
    const data = JSON.stringify(message);

    this.log('[MQTT] Publish:', topic, data);

    if (!this.mqtt.connected) {
      this.error('[MQTT] Client not connected');

      throw new Error('Could not send message to server');
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
    if (!this.mqtt) return;

    const locationUuid = this.getStoreValue('service_location_uuid') || null;
    if (blank(locationUuid)) return;

    const topic = `servicelocation/${locationUuid}/tracking`;

    const data = JSON.stringify({
      value: on ? 'ON' : 'OFF',
      clientId: this.clientId,
      serialNumber: this.getSetting('serial_number'),
      type: 'RT_VALUES',
    });

    this.log('[MQTT] Publish:', topic, data);

    if (!this.mqtt.connected) {
      this.error('[MQTT] Client not connected');

      return;
    }

    await this.mqtt.publish(topic, data);
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
      if (filled(data.jsonContent)) {
        data = JSON.parse(data.jsonContent);
      }

      await this.onMessage(topic, data);

      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error(err.message);
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      message = null;
      data = null;
    }
  }

  async onConnect() {
    this.log('[MQTT] onConnect()');

    this.unsetWarning().catch(this.error);

    try {
      this.log(`[MQTT] Subscribed to ${this.topic}`);

      // Subscribe
      await this.mqtt.subscribe(this.topic);

      // Track
      await this.track();
    } catch (err) {
      this.onError(err);
    }
  }

  onDisconnect() {
    this.log('[MQTT] onDisconnect()');
    this.setMqttWarning('service.disconnected');
  }

  onError(err) {
    this.error('[MQTT]', err);
    this.setMqttWarning('service.error');
  }

  onOffline() {
    this.error('[MQTT] onOffline()');
    this.setMqttWarning('service.offline');
  }

  onReconnect() {
    this.log('[MQTT] onReconnect()');
    this.setMqttWarning('service.reconnect');
  }

  /*
  | Support functions
  */

  // Reset capabilities
  async resetCapabilities() {
    if (this.hasCapability('measure_power')) {
      this.setCapabilityValue('measure_power', 0).catch(this.error);
    }

    if (this.hasCapability('measure_power.alwayson')) {
      this.setCapabilityValue('measure_power.alwayson', 0).catch(this.error);
    }

    if (this.hasCapability('measure_power.consumption')) {
      this.setCapabilityValue('measure_power.consumption', 0).catch(this.error);
    }

    if (this.hasCapability('measure_power.production')) {
      this.setCapabilityValue('measure_power.production', 0).catch(this.error);
    }
  }

  // Set MQTT warning message
  setMqttWarning(locale) {
    this.setWarning(this.homey.__(locale, { service: this.homey.__('mqtt') })).catch(this.error);
  }

}

module.exports = MqttDevice;
