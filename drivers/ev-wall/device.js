'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank } = require('../../lib/Utils');
const ChargingState = require('../../models/ChargingState');

class EVWallDevice extends MqttDevice {

  /*
  | Device events
  */

  // Target temperature capability changed
  async onCapabilityChargingMode(mode) {
    this.log(`Charging mode changed to '${mode}'`);

    await this.setChargingMode(mode);
  }

  // Device initialized
  async onOAuth2Init() {
    // Migrate
    await this.migrate();

    // Initialize parent
    await super.onOAuth2Init();
  }

  // MQTT message received
  async onMessage(topic, data) {
    // Charging state
    if (topic.endsWith('chargingstate')) {
      this.log('[ChargingState]', JSON.stringify(data));

      data = new ChargingState(data);

      await this.handleSyncData(data.capabilities);
    }

    // Power state
    if (topic.endsWith('power')) {
      await this.handleSyncData(data);
    }

    // Updated message
    if (topic.endsWith('updated')) {
      this.log('[Updated]', JSON.stringify(data));

      data = this.getSyncDataFromUpdateMessage(data);

      await this.handleSyncData(data);
    }

    data = null;
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
    const ledId = this.getStoreValue('led_id');

    if (blank(ledId)) {
      this.error('LED brightness not supported');
      throw new Error(this.homey.__('errors.led'));
    }

    this.log(`Set LED brightness to '${percentage}%'`);

    await this.oAuth2Client.setLedBrightness(this.serviceLocationId, ledId, percentage);
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
    const ledId = this.getStoreValue('led_id');

    if (blank(ledId)) return {};

    const brightness = await this.oAuth2Client.getLedBrightness(this.serviceLocationId, ledId);

    return {
      led_brightness: brightness,
    };
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    this.log('[Sync]', JSON.stringify(data));

    // Always on power (MQTT)
    if (this.hasCapability('measure_power.alwayson') && 'alwaysOn' in data) {
      this.setCapabilityValue('measure_power.alwayson', data.alwaysOn).catch(this.error);
    }

    // LED brightness (MQTT and sync)
    if ('led_brightness' in data && !this.updating) {
      this.setSettings(data).catch(this.error);
    }

    // Cable connected (MQTT)
    if (this.hasCapability('cable_connected') && 'cableConnected' in data) {
      this.setCapabilityValue('cable_connected', data.cableConnected).catch(this.error);
    }

    // Charging (MQTT)
    if (this.hasCapability('charging') && 'charging' in data) {
      this.setCapabilityValue('charging', data.charging).catch(this.error);
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

  // Migrate device properties
  async migrate() {
    // Add charging capability
    if (!this.hasCapability('charging')) {
      this.addCapability('charging').catch(this.error);
    }
  }

}

module.exports = EVWallDevice;
