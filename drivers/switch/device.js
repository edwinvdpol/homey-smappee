'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank } = require('../../lib/Utils');

class SwitchDevice extends MqttDevice {

  /*
  | Device events
  */

  // On/off capability changed
  async onCapabilityOnOff(on) {
    this.log(`Capability 'onoff' is now '${on}'`);

    await this.oAuth2Client.setActuatorState(
      this.getStoreValue('id'),
      this.serviceLocationId,
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
    const result = await this.oAuth2Client.getLatestSwitchConsumption(this.getStoreValue('monitor_id'), this.serviceLocationId);
    result.state = await this.oAuth2Client.getActuatorState(this.getStoreValue('id'), this.serviceLocationId);

    return result;
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    // Show log when timestamp is different
    if (blank(data.timestamp) || this.latestRecordTime !== data.timestamp) {
      this.log('[Sync]', JSON.stringify(data));
    }

    // Active power (Watt)
    if (this.hasCapability('measure_power') && 'active' in data) {
      this.setCapabilityValue('measure_power', data.active * 12).catch(this.error);
    }

    // Connection state
    if (this.hasCapability('connection_state') && 'connectionState' in data) {
      const state = data.connectionState.toLowerCase();

      this.setCapabilityValue('connection_state', state).catch(this.error);

      if (state === 'disconnected') {
        this.setWarning(this.homey.__('warning.disconnected')).catch(this.error);
      } else if (state === 'unreachable') {
        this.setWarning(this.homey.__('warning.unreachable')).catch(this.error);
      } else {
        this.unsetWarning().catch(this.error);
      }
    }

    // On/off state
    if (this.hasCapability('onoff') && 'state' in data) {
      const on = data.state === 'ON_ON' || data.state === 'ON';

      this.setCapabilityValue('onoff', on).catch(this.error);
    }

    this.setAvailable().catch(this.error);
  }

  /*
  | MQTT functions
  */

  subscribeTopic() {
    return `plug/${this.getStoreValue('id')}/#`;
  }

}

module.exports = SwitchDevice;
