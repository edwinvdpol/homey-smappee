'use strict';

const Homey = require('homey');
const { OAuth2Driver } = require('homey-oauth2app');

class Driver extends OAuth2Driver {

  /*
  | Driver events
  */

  // Driver initialized
  async onOAuth2Init() {
    this.log('Initialized');
  }

  // Driver destroyed
  async onUninit() {
    this.log('Destroyed');
  }

  /*
  | Pairing functions
  */

  onPair(session) {
    super.onPair(session);

    const onLogin = async ({ username, password }) => {
      const clientId = username.replace(/\s/g, '');
      const clientSecret = password.replace(/\s/g, '');

      if (clientId.length < 4) {
        throw new Error(this.homey.__('errors.clientId'));
      }

      if (clientSecret.length < 6) {
        throw new Error(this.homey.__('errors.clientSecret'));
      }

      this.homey.settings.set(Homey.env.SMAPPEE_CLIENT_ID_SETTING, clientId);
      this.homey.settings.set(Homey.env.SMAPPEE_CLIENT_SECRET_SETTING, clientSecret);

      return true;
    };

    session.setHandler('login', onLogin);
  }

  // Pair devices
  async onPairListDevices({ oAuth2Client }) {
    this.log(`Pairing ${this.id}s`);

    const devices = await this.getPairDevices({ oAuth2Client });

    return devices.map((device) => this.getDeviceData(device)).filter((e) => e);
  }

  /**
   * @param {PairSession} session
   * @param {SensorDevice|Device} device
   */
  onRepair(session, device) {
    super.onRepair(session, device);

    const onLogin = async ({ username, password }) => {
      const clientId = username.replace(/\s/g, '');
      const clientSecret = password.trim().replace(/\s/g, '');

      if (clientId.length < 4) {
        throw new Error(this.homey.__('errors.clientId'));
      }

      if (clientSecret.length < 6) {
        throw new Error(this.homey.__('errors.clientSecret'));
      }

      this.homey.settings.set(Homey.env.SMAPPEE_CLIENT_ID_SETTING, clientId);
      this.homey.settings.set(Homey.env.SMAPPEE_CLIENT_SECRET_SETTING, clientSecret);

      await session.nextView();
    };

    session.setHandler('login', onLogin);
  }

  // Return data to create the device
  getDeviceData(device) {
    const data = {
      name: device.name.trim(),
      data: {
        id: this.getPairDeviceId(device),
      },
      settings: this.getPairSettings(device),
      store: this.getPairStore(device),
      capabilities: this.getPairCapabilities(device),
    };

    this.log('Device found', JSON.stringify(data));

    return data;
  }

}

module.exports = Driver;
