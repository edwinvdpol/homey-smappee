'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank, filled } = require('../../lib/Utils');

class SwitchDevice extends MqttDevice {

  static SYNC_INTERVAL = 60; // Seconds

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    // Reset capabilities
    this.setCapabilityValue('measure_power', 0).catch(this.error);

    // Initialise MQTT device
    await super.onOAuth2Init();

    // Register timer and synchronize
    await this.registerTimer();
  }

  // On/off capability changed
  async onCapabilityOnOff(on) {
    this.log(`Capability 'onoff' is now '${on}'`);

    if (this.mqtt) {
      await this.publish('setstate', {
        value: on ? 'ON' : 'OFF',
        since: new Date().getTime(),
      });

      return;
    }

    await this.oAuth2Client.setActuatorState(
      this.getStoreValue('id'),
      this.getStoreValue('service_location_id'),
      on ? 'ON_ON' : 'OFF_OFF',
    );
  }

  // MQTT message received
  async onMessage(topic, data) {
    if (topic.endsWith('connectionState')) {
      await this.handleSyncData({ connectionState: data.value });
    }

    if (topic.endsWith('state')) {
      await this.handleSyncData({ state: data.value });
    }
  }

  /*
  | Synchronization functions
  */

  subscribeTopic() {
    return `plug/${this.getStoreValue('id')}/#`;
  }

  // Return data which need to be synced
  async getSyncData() {
    const result = await this.oAuth2Client.getLatestSwitchConsumption(this.getStoreValue('monitor_id'), this.getStoreValue('service_location_id'));
    result.state = await this.oAuth2Client.getSwitchState(this.getStoreValue('id'), this.getStoreValue('service_location_id'));

    return result;
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    // Show log when timestamp is different
    if (blank(data.timestamp) || this.latestRecordTime !== data.timestamp) {
      this.log('Handle data:', JSON.stringify(data));
    }

    // Active power (Watt)
    if (filled(data.active)) {
      this.setCapabilityValue('measure_power', data.active * 12).catch(this.error);
    }

    // Connection state
    if (filled(data.connectionState)) {
      this.setCapabilityValue('connection_state', data.connectionState.toLowerCase()).catch(this.error);
    }

    // On/off state
    if (filled(data.state)) {
      const on = data.state === 'ON_ON' || data.state === 'ON';

      this.setCapabilityValue('onoff', on).catch(this.error);
    }
  }

  /*
  | Listener functions
  */

  // Register capability listeners
  async registerCapabilityListeners() {
    this.registerCapabilityListener('onoff', this.onCapabilityOnOff.bind(this));
  }

}

module.exports = SwitchDevice;
