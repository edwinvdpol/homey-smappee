'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank } = require('../../lib/Utils');

class EnergyDevice extends MqttDevice {

  /*
  | Device events
  */

  // MQTT message received
  async onMessage(topic, data) {
    await this.handleSyncData(data);
  }

  /*
  | Synchronization functions
  */

  // Return data which need to be synced
  async getSyncData() {
    return {};
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    this.log('[Sync]', JSON.stringify(data).slice(0, 150));

    if (this.hasCapability('measure_power') && 'consumptionPower' in data) {
      this.setCapabilityValue('measure_power', data.consumptionPower).catch(this.error);
    }

    if (this.hasCapability('measure_power.alwayson') && 'alwaysOn' in data) {
      this.setCapabilityValue('measure_power.alwayson', data.alwaysOn).catch(this.error);
    }

    this.unsetWarning().catch(this.error);
  }

  /*
  | MQTT functions
  */

  subscribeTopic() {
    return 'power';
  }

}

module.exports = EnergyDevice;
