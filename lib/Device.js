'use strict';

const { OAuth2Device } = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  | Device events
  */

  // Device deleted
  async onOAuth2Deleted() {
    this.unregisterTimer().catch(this.error);

    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    // Set default data
    await this.setDefaults();

    // Register capability listeners
    await this.registerCapabilityListeners();
  }

  // Device destroyed
  async onOAuth2Uninit() {
    this.unregisterTimer().catch(this.error);

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
      this.error(err.message);
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      result = null;
    }
  }

  /*
  | Timer functions
  */

  // Register timer
  async registerTimer() {
    // Synchronize device
    await this.sync();

    if (this.syncDeviceTimer) return;

    this.syncDeviceTimer = this.homey.setInterval(this.sync.bind(this), (1000 * this.constructor.SYNC_INTERVAL));

    this.log('Timer registered');
  }

  // Unregister timer
  async unregisterTimer() {
    if (!this.syncDeviceTimer) return;

    this.homey.clearTimeout(this.syncDeviceTimer);
    this.syncDeviceTimer = null;

    this.log('Timer unregistered');
  }

  /*
  | Listener functions
  */

  // Register capability listeners
  async registerCapabilityListeners() {
    // Handled in subclass
  }

  /*
  | Support functions
  */

  // Set default class data
  async setDefaults() {
    this.latestRecordTime = null;
    this.syncDeviceTimer = null;
  }

  // Set MQTT warning message
  setMqttWarning(locale) {
    this.setWarning(this.homey.__(locale, { service: this.homey.__('mqtt') })).catch(this.error);
  }

}

module.exports = Device;
