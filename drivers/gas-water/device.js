'use strict';

const semverLte = require('semver/functions/lte');
const Device = require('../../lib/Device');
const { blank } = require('../../lib/Utils');

class GasWaterDevice extends Device {

  static TIMER_INTERVAL = 60; // Seconds

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    // Migrate
    await this.migrate();

    // Initialize parent
    await super.onOAuth2Init();
  }

  // Timer action
  async onTimerInterval() {
    await this.sync();
  }

  /*
  | Synchronization functions
  */

  // Return data which need to be synced
  async getSyncData() {
    return this.latestRecordTime
      ? this.oAuth2Client.getLatestFilledSensorConsumption(this.getStoreValue('id'), this.getStoreValue('service_location_id'))
      : this.oAuth2Client.getInitialSensorConsumption(this.getStoreValue('id'), this.getStoreValue('service_location_id'));
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    // Reset meters when timestamp already known
    if (data.timestamp && this.latestRecordTime === data.timestamp) {
      data.value1 = 0;
      data.value2 = 0;
    } else {
      this.log('Sync]', JSON.stringify(data));
    }

    // Current battery percentage
    if (this.hasCapability('measure_battery') && 'battery' in data) {
      this.setCapabilityValue('measure_battery', data.battery).catch(this.error);
    }

    // Current humidity
    if (this.hasCapability('measure_humidity') && 'humidity' in data) {
      this.setCapabilityValue('measure_humidity', data.humidity).catch(this.error);
    }

    // Current temperature
    if (this.hasCapability('measure_temperature') && 'temperature' in data) {
      this.setCapabilityValue('measure_temperature', data.temperature).catch(this.error);
    }

    // Get store
    let store = this.getStore();

    // Gas meter
    if (this.hasCapability('meter_gas')) {
      const field = `value${store.gas_channel}`;
      const value = (data[field] || 0) / store.gas_ppu;

      this.setCapabilityValue('meter_gas', value).catch(this.error);
    }

    // Water meter
    if (this.hasCapability('meter_water')) {
      const field = `value${store.water_channel}`;
      const value = (data[field] || 0) / store.water_ppu;

      this.setCapabilityValue('meter_water', value).catch(this.error);
    }

    // Water measure
    if (this.hasCapability('measure_water')) {
      const field = `value${store.water_channel}`;
      const value = (data[field] || 0) / store.water_ppu;

      this.setCapabilityValue('measure_water', value).catch(this.error);
    }

    data = null;
    store = null;
  }

  /*
  | Support functions
  */

  // Migrate device properties
  async migrate() {
    // App version <= 1.2.0
    if (semverLte(this.homey.manifest.version, '1.2.0')) {
      // Correct water capability
      if (!this.hasCapability('meter_water')) return;
      if (this.getStoreValue('water_uom') === 'm3') return;

      this.removeCapability('meter_water').catch(this.error);
      this.addCapability('measure_water').catch(this.error);

      const message = this.homey.__('notifications.water_capability_updated', { name: this.getName() });
      this.homey.notifications.createNotification({ excerpt: message }).catch(this.error);
    }
  }

}

module.exports = GasWaterDevice;
