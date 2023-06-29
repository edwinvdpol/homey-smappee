'use strict';

const Device = require('../../lib/Device');
const { blank, filled } = require('../../lib/Utils');

class GasWaterDevice extends Device {

  static SYNC_INTERVAL = 60; // Seconds

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    // Initialise parent device
    await super.onOAuth2Init();

    // Enable polling and synchronize
    await this.registerTimer();
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
      this.log('Handle data', JSON.stringify(data));
    }

    // Current battery percentage
    if (this.hasCapability('measure_battery') && filled(data.battery)) {
      this.setCapabilityValue('measure_battery', data.battery).catch(this.error);
    }

    // Current humidity
    if (this.hasCapability('measure_humidity') && filled(data.humidity)) {
      this.setCapabilityValue('measure_humidity', data.humidity).catch(this.error);
    }

    // Current temperature
    if (this.hasCapability('measure_temperature') && filled(data.temperature)) {
      this.setCapabilityValue('measure_temperature', data.temperature).catch(this.error);
    }

    // Get store
    const store = this.getStore();

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
  }

}

module.exports = GasWaterDevice;
