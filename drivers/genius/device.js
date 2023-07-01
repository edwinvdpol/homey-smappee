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

  subscribeTopic() {
    return 'power';
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    // this.log('Handle data', JSON.stringify(data).slice(0, 150));

    let power = 0;

    if (this.hasCapability('measure_power.production') && filled(data.solarPower)) {
      const solar = Math.abs(data.solarPower);
      power = solar;

      this.setCapabilityValue('measure_power.production', solar).catch(this.error);
    }

    if (filled(data.consumptionPower)) {
      power -= Number(data.consumptionPower);

      if (this.hasCapability('measure_power.consumption')) {
        this.setCapabilityValue('measure_power.consumption', data.consumptionPower).catch(this.error);
      }
    }

    if (this.hasCapability('measure_power.alwayson') && filled(data.alwaysOn)) {
      this.setCapabilityValue('measure_power.alwayson', data.alwaysOn).catch(this.error);
    }

    this.setCapabilityValue('measure_power', power).catch(this.error);
  }

}

module.exports = GeniusDevice;
