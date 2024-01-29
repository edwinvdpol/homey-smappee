'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank, filled } = require('../../lib/Utils');

class GeniusDevice extends MqttDevice {

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

    let power = 0;

    if (this.hasCapability('measure_power.production') && filled(data.solarPower)) {
      power = Math.abs(data.solarPower);

      this.setCapabilityValue('measure_power.production', power).catch(this.error);
    }

    if (filled(data.consumptionPower)) {
      if (this.hasCapability('measure_power.consumption')) {
        const consumption = Math.abs(data.consumptionPower);

        power -= consumption;

        this.setCapabilityValue('measure_power.consumption', consumption).catch(this.error);
      } else {
        power = -Math.abs(data.consumptionPower);
      }
    }

    if (this.hasCapability('measure_power.alwayson') && filled(data.alwaysOn)) {
      this.setCapabilityValue('measure_power.alwayson', data.alwaysOn).catch(this.error);
    }

    this.setCapabilityValue('measure_power', power).catch(this.error);

    this.unsetWarning().catch(this.error);
  }

  /*
  | MQTT functions
  */

  subscribeTopic() {
    return 'power';
  }

}

module.exports = GeniusDevice;
