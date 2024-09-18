'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank } = require('../../lib/Utils');

class PlugDevice extends MqttDevice {

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
    if (topic.endsWith('state')) {
      await this.handleSyncData({ state: data.value });
    }
  }

  /*
  | Synchronization functions
  */

  // Return data which need to be synced
  async getSyncData() {
    const result = {};
    result.state = await this.oAuth2Client.getActuatorState(this.getStoreValue('id'), this.serviceLocationId);

    return result;
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

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

module.exports = PlugDevice;
