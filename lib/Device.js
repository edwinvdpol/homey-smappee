'use strict';

const { OAuth2Device } = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    // Set default data
    await this.setDefaults();

    // Wait for driver to become ready
    await this.driver.ready();

    // Register capability listeners
    await this.registerCapabilityListeners();
  }

  // Device deleted
  async onOAuth2Deleted() {
    // Stop polling
    await this.stopPolling();

    this.log('Deleted');
  }

  /*
  | Synchronization functions
  */

  // Synchronize
  async sync() {
    try {
      const result = await this.getSyncData();

      await this.handleSyncData(result);

      // Set latest record timestamp
      if (result.timestamp) {
        this.latestRecordTime = result.timestamp;
      }
    } catch (err) {
      this.error(err.message);
      this.setUnavailable(err.message).catch(this.error);
    }
  }

  /*
  | Polling functions
  */

  // Start polling
  async enablePolling() {
    // Synchronize device
    await this.sync();

    if (this.timer) {
      return;
    }

    this.timer = this.homey.setInterval(this.sync.bind(this), (1000 * this.constructor.POLL_INTERVAL));

    this.log(`Polling enabled (${this.constructor.POLL_INTERVAL} seconds)`);
  }

  // Stop polling
  async stopPolling() {
    if (!this.timer) {
      return;
    }

    this.homey.clearTimeout(this.timer);
    this.timer = null;

    this.log('Polling stopped');
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
    // Reset properties
    this.latestRecordTime = null;
    this.timer = null;
  }

  // Set MQTT warning message
  setMqttWarning(locale) {
    this.setWarning(this.homey.__(locale, { service: this.homey.__('mqtt') })).catch(this.error);
  }

}

module.exports = Device;
