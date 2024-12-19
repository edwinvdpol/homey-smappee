'use strict';

const { OAuth2Device } = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  | Device events
  */

  // Device added
  async onOAuth2Added() {
    this.log('Added');
  }

  // Device deleted
  async onOAuth2Deleted() {
    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    // Connecting to API
    await this.setUnavailable(this.homey.__('authentication.connecting'));

    // Set default data
    this.setDefaults();

    // Register capability listeners
    this.registerCapabilityListeners();

    // Synchronize device
    await this.sync();

    this.log('Initialized');
  }

  // Device destroyed
  async onOAuth2Uninit() {
    this.log('Destroyed');
  }

  /*
  | Synchronization functions
  */

  // Synchronize
  async sync() {
    let result;

    try {
      this.log('[Sync] Get last measures from API');

      result = await this.getSyncData();

      await this.handleSyncData(result);

      // Set latest record timestamp
      if (result.timestamp) {
        this.latestRecordTime = result.timestamp;
      }
    } catch (err) {
      this.error('[Sync]', err.toString());
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      result = null;
    }
  }

  // Return data which need to be synced
  async getSyncData() {
    return {};
  }

  // Set device data
  async handleSyncData(data) {
    //
  }

  /*
  | Listener functions
  */

  // Register capability listeners
  registerCapabilityListeners() {
    if (this.hasCapability('button.reset_water_meter')) {
      this.registerCapabilityListener('button.reset_water_meter', this.onMaintenanceResetWaterMeter.bind(this));
    }

    if (this.hasCapability('charging_mode')) {
      this.registerCapabilityListener('charging_mode', this.onCapabilityChargingMode.bind(this));
    }

    if (this.hasCapability('onoff')) {
      this.registerCapabilityListener('onoff', this.onCapabilityOnOff.bind(this));
    }

    this.log('Capability listeners registered');
  }

  /*
  | Support functions
  */

  // Set default data
  setDefaults() {
    this.updating = null;
    this.latestRecordTime = null;

    this.serviceLocationId = this.getStoreValue('service_location_id');
    this.serviceLocationUuid = this.getStoreValue('service_location_uuid');
  }

}

module.exports = Device;
