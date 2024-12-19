'use strict';

const Device = require('../../lib/Device');
const { blank, filled } = require('../../lib/Utils');

class GasWaterDevice extends Device {

  static SYNC_INTERVAL = 780; // 13 minutes

  /*
  | Device events
  */

  // Reset water meter
  async onCapabilityResetWaterMeter() {
    this.log('[Maintenance] Reset water meter');

    // Device does not have water enabled
    if (!this.getStoreValue('water_enabled')) {
      this.error('[Maintenance] Device does not have water enabled');
      throw new Error(this.homey.__('error.water_disabled'));
    }

    this.log('[Maintenance] Get device from API');
    const sensor = await this.oAuth2Client.getGasWaterDevice(this.getStoreValue('id'));

    // Device not found
    if (blank(sensor)) {
      this.error('[Maintenance] Device not found in Smappee account');
      throw new Error(this.homey.__('error.404'));
    }

    this.log('[Maintenance] Device found:', JSON.stringify(sensor));

    // Wait for driver
    await this.driver.ready();
    const store = this.driver.getPairStore(sensor);

    // Check unit of measure
    if (store.water_uom !== 'm3') {
      this.error(`[Maintenance] Water unit of measure is ${store.water_uom} instead of m³`);
      throw new Error(this.homey.__('error.water_uom', { uom: store.water_uom }));
    }

    // Update store
    this.setStoreValue('water_uom', store.water_uom).catch(this.error);
    this.setStoreValue('water_ppu', store.water_ppu).catch(this.error);

    // Remove `measure_water` capability
    if (this.hasCapability('measure_water')) {
      this.removeCapability('measure_water').catch(this.error);
      this.log('[Maintenance] Removed `measure_water` capability');
    }

    // Add `meter_water` capability
    if (!this.hasCapability('meter_water')) {
      await this.addCapability('meter_water');
      this.log('[Maintenance] Added `meter_water` capability');
    }

    // Reset to defaults
    this.setDefaults();

    // Synchronize
    this.sync().catch(this.error);

    this.log('[Maintenance] Reset water meter done!');
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

  /*
  | Synchronization functions
  */

  // Return data which need to be synced
  async getSyncData() {
    return this.latestRecordTime
      ? this.oAuth2Client.getLatestSensorConsumption(this.getStoreValue('id'), this.serviceLocationId, this.latestRecordTime)
      : this.oAuth2Client.getInitialSensorConsumption(this.getStoreValue('id'), this.serviceLocationId);
  }

  // Set device data
  async handleSyncData(data) {
    if (blank(data)) return;

    // Show log when timestamp is newer
    if (!this.latestRecordTime || this.latestRecordTime < data.timestamp) {
      this.log('Sync]', JSON.stringify(data));
    }

    // Battery percentage
    if (this.hasCapability('measure_battery') && 'battery' in data) {
      this.setCapabilityValue('measure_battery', data.battery).catch(this.error);
    }

    // Humidity
    if (this.hasCapability('measure_humidity') && 'humidity' in data) {
      this.setCapabilityValue('measure_humidity', data.humidity).catch(this.error);
    }

    // Temperature
    if (this.hasCapability('measure_temperature') && 'temperature' in data) {
      this.setCapabilityValue('measure_temperature', data.temperature).catch(this.error);
    }

    // Get store
    let store = this.getStore();

    // Gas meter
    if (this.hasCapability('meter_gas')) {
      const field = `value${store.gas_channel}`;
      const raw = filled(data[field]) ? data[field] : null;

      if (raw) {
        let current = this.latestRecordTime ? this.getCapabilityValue('meter_gas') : 0;
        current += (raw / store.gas_ppu);

        this.setCapabilityValue('meter_gas', current).catch(this.error);
      }
    }

    // Water meter
    if (this.hasCapability('meter_water')) {
      const field = `value${store.water_channel}`;
      const raw = filled(data[field]) ? data[field] : null;

      if (raw) {
        let current = this.latestRecordTime ? this.getCapabilityValue('meter_water') : 0;
        current += (raw / store.water_ppu);

        this.setCapabilityValue('meter_water', current).catch(this.error);
      }
    }

    this.setAvailable().catch(this.error);

    data = null;
    store = null;
  }

  /*
  | Support functions
  */

  // Migrate device properties
  async migrate() {
    this.log('[Migrate] Started');

    if (this.getStore().water_enabled) {
      if (!this.hasCapability('button.reset_water_meter')) {
        this.addCapability('button.reset_water_meter').catch(this.error);
        this.log('[Migrate] Added reset water meter button capability');
      }

      if (this.getStore().water_uom !== 'm3') {
        const message = this.homey.__('notification.water_capability_updated', { name: this.getName() });
        this.homey.notifications.createNotification({ excerpt: message }).catch(this.error);
        this.log('[Migrate] Notification created');
      }
    }

    this.log('[Migrate] Finished');
  }

}

module.exports = GasWaterDevice;
