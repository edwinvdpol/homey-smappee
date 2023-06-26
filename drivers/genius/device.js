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

    this.log('Handle power data', JSON.stringify(data).slice(0, 150));

    if (filled(data.solarPower)) {
      this.setCapabilityValue('measure_power', Math.abs(data.solarPower)).catch(this.error);
    }

    if (filled(data.consumptionPower)) {
      this.setCapabilityValue('measure_power.consumption', data.consumptionPower).catch(this.error);
    }

    if (filled(data.alwaysOn)) {
      this.setCapabilityValue('measure_power.alwayson', data.alwaysOn).catch(this.error);
    }
  }

}

module.exports = GeniusDevice;
