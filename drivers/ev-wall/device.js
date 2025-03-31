'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank, filled } = require('../../lib/Utils');
const ChargingState = require('../../models/ChargingState');

class EVWallDevice extends MqttDevice {

  static SYNC_INTERVAL = 660; // 11 minutes

  /*
  | Device events
  */

  // Charging mode capability changed
  async onCapabilityChargingMode(value) {
    this.log(`User changed capability 'charging_mode' to '${value}'`);

    await this.setChargingMode(value);
  }

  // Dim (LED brightness) changed
  async onCapabilityDim(value) {
    value *= 100;

    this.log(`User changed capability 'dim' to '${value}'`);

    await this.setBrightness(value);
  }

  // Device initialized
  async onOAuth2Init() {
    // Migrate
    await this.migrate();

    // Register timer
    this.registerTimer();

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
    this.log('[Settings] Updating');

    for (const name of changedKeys) {
      const newValue = newSettings[name];

      this.log(`[Settings] '${name}' is now '${newValue}'`);
    }

    this.log('[Settings] Updated');
  }

  /*
  | Device actions
  */

  // LED brightness
  async setBrightness(percentage) {
    if (!this.hasCapability('dim')) {
      this.error('LED brightness not supported');
      throw new Error(this.homey.__('error.led'));
    }

    percentage *= 100;

    this.log(`Set LED brightness to '${percentage}%'`);

    await this.oAuth2Client.setLedBrightness(this.serviceLocationId, this.getStoreValue('led_id'), percentage);
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
    const result = this.latestRecordTime
      ? await this.oAuth2Client.getLatestServiceLocationConsumption(this.serviceLocationId, this.latestRecordTime)
      : await this.oAuth2Client.getInitialServiceLocationConsumption(this.serviceLocationId);

    if (this.hasCapability('dim')) {
      result.led_brightness = await this.oAuth2Client.getLedBrightness(this.serviceLocationId, this.getStoreValue('led_id'));
    }

    return result;
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    this.log('[Sync]', JSON.stringify(data));

    // LED brightness (MQTT and sync)
    if (this.hasCapability('dim') && 'led_brightness' in data) {
      this.setCapabilityValue('dim', (data.led_brightness / 100)).catch(this.error);
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

    // Consumption (sync)
    if (this.hasCapability('meter_power') && 'consumption' in data) {
      let current = this.latestRecordTime ? this.getCapabilityValue('meter_power') : 0;
      current += data.consumption;

      this.setCapabilityValue('meter_power', current).catch(this.error);
    }

    // Availability (MQTT)
    if ('available' in data) {
      if (data.available) {
        this.setAvailable().catch(this.error);
      } else {
        this.setUnavailable(this.homey.__('error.unavailable')).catch(this.error);
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
    this.log('[Migrate] Started');

    // Add `meter_power` capability
    if (!this.hasCapability('meter_power')) {
      this.addCapability('meter_power').catch(this.error);
      this.log('[Migrate] Added `meter_power` capability');
    }

    // Add `charging` capability
    if (!this.hasCapability('charging')) {
      this.addCapability('charging').catch(this.error);
      this.log('[Migrate] Added `charging` capability');
    }

    // Add `dim` capability
    if (!this.hasCapability('dim') && filled(this.getStoreValue('led_id'))) {
      this.addCapability('dim').catch(this.error);
      this.log('[Migrate] Added `dim` capability');
    }

    // Remove `measure_power.alwayson` capability
    if (this.hasCapability('measure_power.alwayson')) {
      this.removeCapability('measure_power.alwayson').catch(this.error);
      this.log('[Migrate] Removed `measure_power.alwayson` capability');
    }

    this.log('[Migrate] Finished');
  }

}

module.exports = EVWallDevice;
