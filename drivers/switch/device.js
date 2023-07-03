'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank, filled } = require('../../lib/Utils');

class SwitchDevice extends MqttDevice {

  static SYNC_INTERVAL = 60; // Seconds

  /*
  | Device events
  */

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
      this.log('Handle data', JSON.stringify(data));
    }

    // Active power (Watt)
    if (this.hasCapability('measure_power') && filled(data.active)) {
      this.setCapabilityValue('measure_power', data.active * 12).catch(this.error);
    }

    // Connection state
    if (this.hasCapability('connection_state') && filled(data.connectionState)) {
      const state = data.connectionState.toLowerCase();

      this.setCapabilityValue('connection_state', state).catch(this.error);

      if (state === 'disconnected') {
        this.setWarning(this.homey('warnings.disconnected')).catch(this.error);
      } else if (state === 'unreachable') {
        this.setWarning(this.homey('warnings.unreachable')).catch(this.error);
      } else {
        this.unsetWarning().catch(this.error);
      }
    }

    // On/off state
    if (this.hasCapability('onoff') && filled(data.state)) {
      const on = data.state === 'ON_ON' || data.state === 'ON';

      this.setCapabilityValue('onoff', on).catch(this.error);
    }
  }

  /*
  | MQTT functions
  */

  subscribeTopic() {
    return `plug/${this.getStoreValue('id')}/#`;
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
