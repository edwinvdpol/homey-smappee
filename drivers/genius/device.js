'use strict';

const MqttDevice = require('../../lib/MqttDevice');
const { blank } = require('../../lib/Utils');

class GeniusDevice extends MqttDevice {

  static SYNC_INTERVAL = 840; // 14 minutes

  /*
  | Device events
  */

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
    await this.handleSyncData(data);
  }

  /*
  | Synchronization functions
  */

  // Return data which need to be synced
  async getSyncData() {
    return this.latestRecordTime
      ? this.oAuth2Client.getLatestServiceLocationConsumption(this.serviceLocationId, this.latestRecordTime)
      : this.oAuth2Client.getInitialServiceLocationConsumption(this.serviceLocationId);
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    this.log('[Sync]', JSON.stringify(data));

    // Consumption power (MQTT)
    if (this.hasCapability('measure_power') && 'consumptionPower' in data) {
      this.setCapabilityValue('measure_power', data.consumptionPower).catch(this.error);
    }

    // Solar power (MQTT)
    if (this.hasCapability('measure_power.production') && 'solarPower' in data) {
      this.setCapabilityValue('measure_power.production', data.solarPower).catch(this.error);
    }

    // Always on (MQTT)
    if (this.hasCapability('measure_power.alwayson') && 'alwaysOn' in data) {
      this.setCapabilityValue('measure_power.alwayson', data.alwaysOn).catch(this.error);
    }

    // Consumption (sync)
    if (this.hasCapability('meter_power') && 'consumption' in data) {
      let current = this.latestRecordTime ? this.getCapabilityValue('meter_power') : 0;
      current += data.consumption;

      this.setCapabilityValue('meter_power', current).catch(this.error);
    }

    this.unsetWarning().catch(this.error);
    this.setAvailable().catch(this.error);
  }

  /*
  | MQTT functions
  */

  subscribeTopic() {
    return 'power';
  }

  /*
  | Support functions
  */

  // Migrate device properties
  async migrate() {
    this.log('[Migrate] Started');

    // Add `meter_power` capability
    if (!this.hasCapability('meter_power')) {
      this.addCapability('meter_power').catch(this.error);
      this.log('[Migrate] Added `meter_power` capability');
    }

    this.log('[Migrate] Finished');
  }

}

module.exports = GeniusDevice;
