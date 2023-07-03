'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { filled, blank } = require('../../lib/Utils');

class EVWallDevice extends MqttDevice {

  /*
  | Device events
  */

  // Target temperature capability changed
  async onCapabilityChargingMode(mode) {
    this.log(`Charging mode changed to '${mode}'`);

    await this.setChargingMode(mode);
  }

  // MQTT message received
  async onMessage(topic, data) {
    if (topic.endsWith('chargingstate')) {
      await this.handleSyncData(data);
    }

    if (topic.endsWith('power')) {
      await this.handleSyncData(data);
    }
  }

  // Settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Updating settings...');

    // LED brightness updated
    if (changedKeys.includes('led_brightness')) {
      const percentage = Number(newSettings.led_brightness);

      this.log(`LED brightness is now '${percentage}'`);

      await this.setBrightness(percentage);
    }
  }

  /*
  | Device actions
  */

  // Activate charging mode
  async setChargingMode(mode) {
    const stationSerialNumber = this.getStore().station.serialNumber;
    const position = this.getStoreValue('position');

    this.log(`Set position '${position}' charging mode to '${mode}'`);

    await this.oAuth2Client.setChargingMode(stationSerialNumber, position, mode);

    this.setCapabilityValue('charging_mode', mode).catch(this.error);
  }

  // LED brightness
  async setBrightness(percentage) {
    const serviceLocationId = this.getStoreValue('service_location_id');
    const ledId = this.getStoreValue('led_id') || null;

    if (blank(ledId)) {
      this.error('LED brightness not supported');
      throw new Error(this.homey.__('errors.led'));
    }

    this.log(`Set LED brightness to '${percentage}%'`);

    await this.oAuth2Client.setBrightness(serviceLocationId, ledId, percentage);
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

    // Always on power (MQTT)
    if (this.hasCapability('measure_power.alwayson') && filled(data.alwaysOn)) {
      this.setCapabilityValue('measure_power.alwayson', data.alwaysOn).catch(this.error);
    }

    // Cable connected (MQTT)
    if (this.hasCapability('cable_connected') && filled(data.chargingState)) {
      const connected = data.chargingState !== 'STOPPED';

      this.setCapabilityValue('cable_connected', connected).catch(this.error);
    }

    // Charging mode (MQTT)
    if (this.hasCapability('charging_mode') && filled(data.chargingMode)) {
      this.setCapabilityValue('charging_mode', data.chargingMode.toLowerCase()).catch(this.error);
    }

    // Consumption power (MQTT)
    if (this.hasCapability('measure_power') && filled(data.consumptionPower)) {
      this.setCapabilityValue('measure_power', data.consumptionPower).catch(this.error);
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
    if (this.hasCapability('charging_mode')) {
      this.registerCapabilityListener('charging_mode', this.onCapabilityChargingMode.bind(this));
    }
  }

}

module.exports = EVWallDevice;
