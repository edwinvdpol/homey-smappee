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

    // Synchronize device
    await this.sync();

    // Register capability listeners
    await this.registerCapabilityListeners();

    // Register timer if needed
    await this.registerTimer();
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
    if (this.syncDeviceTimer) return;
    if (!this.constructor.TIMER_INTERVAL) return;

    this.syncDeviceTimer = this.homey.setInterval(this.onTimerInterval.bind(this), (1000 * this.constructor.TIMER_INTERVAL));

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
    this.updating = false;
    this.latestRecordTime = null;
    this.syncDeviceTimer = null;
  }

}

module.exports = Device;
