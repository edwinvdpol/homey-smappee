'use strict';

const mqtt = require('async-mqtt');
const Device = require('./Device');
const { blank } = require('./Utils');

class MqttDevice extends Device {

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    this.mqtt = null;
    this.topic = null;

    // Initialise parent device
    await super.onOAuth2Init();

    // Connect to MQTT broker
    await this.connect();
  }

  // Device deleted
  async onOAuth2Deleted() {
    await this.disconnect();

    await super.onOAuth2Deleted();
  }

  /*
  | MQTT actions
  */

  // Disconnect
  async disconnect() {
    if (!this.mqtt) return;

    this.log('[MQTT] Disconnecting...');

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

    this.log('[MQTT] Connecting...');

    // Set MQTT topic
    this.topic = `servicelocation/${locationUuid}/${this.subscribeTopic()}`;

    const homeyId = await this.homey.cloud.getHomeyId();
    const clientId = `homey-${homeyId}-${this.getData().id}`;

    const client = mqtt.connect('mqtts://mqtt.smappee.net:443', {
      clientId,
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

    const subscribeTopic = this.subscribeTopic().replace('/#', '');
    const topic = `servicelocation/${this.getStoreValue('service_location_uuid')}/${subscribeTopic}/${path}`;
    const data = JSON.stringify(message);

    this.log('[MQTT] Publish:', topic, data);

    if (!this.mqtt.connected) {
      this.error('[MQTT] Client not connected');

      throw new Error('Could not send message to server');
    }

    await this.mqtt.publish(topic, data);
  }

  /*
  | MQTT Events
  */

  async onParseMessage(topic, message) {
    if (blank(message)) {
      this.unsetWarning().catch(this.error);
      return;
    }

    const dataStr = message.toString();
    const data = JSON.parse(dataStr);

    await this.onMessage(topic, data);

    this.unsetWarning().catch(this.error);
  }

  async onConnect() {
    this.log('[MQTT] onConnect()');

    try {
      this.log(`[MQTT] Subscribed to ${this.topic}`);

      await this.mqtt.subscribe(this.topic);
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

}

module.exports = MqttDevice;
