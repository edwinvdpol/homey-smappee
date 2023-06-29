'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { filled, blank } = require('../../lib/Utils');

class EVWallDevice extends MqttDevice {

  /*
  | Device events
  */

  // Target temperature capability changed
  async onCapabilityChargingMode(mode) {
    this.log(`Charging mode changed to ${mode}`);

    await this.setChargingMode(mode);
  }

  // MQTT message received
  async onMessage(topic, data) {
    if (topic.endsWith('chargingstate')) {
      await this.handleSyncData(data);
    }
  }

  /*
  | Device actions
  */

  // Activate charging mode
  async setChargingMode(mode) {
    const position = this.getStoreValue('position');
    const stationSerialNumber = this.getStore().station.serialNumber;

    this.log(`Set position '${position}' charging mode to '${mode}'`);

    await this.oAuth2Client.setChargingMode(stationSerialNumber, position, mode);

    this.setCapabilityValue('charging_mode', mode).catch(this.error);
  }

  /*
  | Synchronization functions
  */

  subscribeTopic() {
    return '#';
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    this.log('Handle data', JSON.stringify(data).slice(0, 150));

    // Cable connected (MQTT)
    if (this.hasCapability('cable_connected') && filled(data.chargingState)) {
      const connected = data.chargingState !== 'STOPPED';

      this.setCapabilityValue('cable_connected', connected).catch(this.error);
    }

    // Charging mode (MQTT)
    if (this.hasCapability('charging_mode') && filled(data.chargingMode)) {
      this.setCapabilityValue('charging_mode', data.chargingMode.toLowerCase()).catch(this.error);
    }

    // Availability (MQTT)
    if (filled(data.available)) {
      if (data.available) {
        this.setAvailable().catch(this.error);
      } else {
        this.setUnavailable(this.homey.__('errors.unavailable')).catch(this.error);
      }
    }
  }

  /*
  | Listener functions
  */

  // Register capability listeners
  async registerCapabilityListeners() {
    this.registerCapabilityListener('charging_mode', this.onCapabilityChargingMode.bind(this));
  }

}

module.exports = EVWallDevice;
