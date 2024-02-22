'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank } = require('../../lib/Utils');

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
    // Charging state
    if (topic.endsWith('chargingstate')) {
      await this.handleSyncData(data);
    }

    // Power state
    if (topic.endsWith('power')) {
      await this.handleSyncData(data);
    }

    // Updated message
    if (topic.endsWith('updated')) {
      data = this.getSyncDataFromUpdateMessage(data);

      await this.handleSyncData(data);
    }
  }

  // Settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.updating = true;

    this.log('[Settings] Updating');

    // LED brightness updated
    if (changedKeys.includes('led_brightness')) {
      const percentage = Number(newSettings.led_brightness);

      this.log(`LED brightness is now '${percentage}'`);

      await this.setBrightness(percentage);
    }

    this.updating = false;

    this.log('[Settings] Updated');
  }

  /*
  | Device actions
  */

  // LED brightness
  async setBrightness(percentage) {
    const serviceLocationId = this.getStoreValue('service_location_id');
    const ledId = this.getStoreValue('led_id') || null;

    if (blank(ledId)) {
      this.error('LED brightness not supported');
      throw new Error(this.homey.__('errors.led'));
    }

    this.log(`Set LED brightness to '${percentage}%'`);

    await this.oAuth2Client.setLedBrightness(serviceLocationId, ledId, percentage);
  }

  // Activate charging mode
  async setChargingMode(mode) {
    const stationSerialNumber = this.getStore().station.serialNumber;
    const position = this.getStoreValue('position');

    this.log(`Set position '${position}' charging mode to '${mode}'`);

    await this.oAuth2Client.setChargingMode(stationSerialNumber, position, mode);

    this.setCapabilityValue('charging_mode', mode).catch(this.error);
  }

  /*
  | Synchronization functions
  */

  // Return data which need to be synced
  async getSyncData() {
    const ledId = this.getStoreValue('led_id') || null;

    if (blank(ledId)) return {};

    const brightness = await this.oAuth2Client.getLedBrightness(this.getStoreValue('service_location_id'), ledId);

    return {
      led_brightness: brightness,
    };
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    this.log('[Sync]', JSON.stringify(data).slice(0, 150));

    // Always on power (MQTT)
    if (this.hasCapability('measure_power.alwayson') && 'alwaysOn' in data) {
      this.setCapabilityValue('measure_power.alwayson', data.alwaysOn).catch(this.error);
    }

    // LED brightness (MQTT and sync)
    if ('led_brightness' in data && !this.updating) {
      this.setSettings(data).catch(this.error);
    }

    // Cable connected (MQTT)
    if (this.hasCapability('cable_connected') && 'chargingState' in data) {
      const connected = data.chargingState !== 'STOPPED';

      this.setCapabilityValue('cable_connected', connected).catch(this.error);
    }

    // Charging mode (MQTT)
    if (this.hasCapability('charging_mode') && 'chargingMode' in data) {
      this.setCapabilityValue('charging_mode', data.chargingMode.toLowerCase()).catch(this.error);
    }

    // Consumption power (MQTT)
    if (this.hasCapability('measure_power') && 'consumptionPower' in data) {
      this.setCapabilityValue('measure_power', data.consumptionPower).catch(this.error);
    }

    // Availability (MQTT)
    if ('available' in data) {
      if (data.available) {
        this.setAvailable().catch(this.error);
      } else {
        this.setUnavailable(this.homey.__('errors.unavailable')).catch(this.error);
      }
    }

    this.unsetWarning().catch(this.error);
  }

  /*
  | MQTT functions
  */

  subscribeTopic() {
    return '#';
  }

  /*
  | Support functions
  */

  // Get synchronization data from update message
  getSyncDataFromUpdateMessage(data) {
    const updated = {};

    if ('configurationPropertyValues' in data) {
      for (const config of data.configurationPropertyValues) {
        if (!('propertySpecName' in config)) continue;
        if (blank(config.propertySpecName)) continue;

        // LED brightness
        if (config.propertySpecName.endsWith('brightness')) {
          updated.led_brightness = Number(config.value) || 0;
        }
      }
    }

    return updated;
  }

}

module.exports = EVWallDevice;
