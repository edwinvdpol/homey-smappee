'use strict';

const Homey = require('homey');
const { OAuth2Driver } = require('homey-oauth2app');
const { collect } = require('collect.js');

class Driver extends OAuth2Driver {

  /*
  | Driver events
  */

  // Driver initialized
  async onOAuth2Init() {
    this.log('Initialized');
  }

  /*
  | Pairing functions
  */

  onPair(session) {
    super.onPair(session);

    const onLogin = async ({ username, password }) => {
      const clientId = username.trim();
      const clientSecret = password.trim();

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
    this.log(`Pairing ${this.id}s...`);

    this.log('Get devices from API');
    const devices = await this.getPairDevices({ oAuth2Client });

    return collect(devices.map((device) => this.getDeviceData(device)).filter((e) => e))
      .unique('name')
      .all();
  }

  // Return data to create the device
  getDeviceData(device) {
    const dataId = device.id || device.serviceLocationId;

    const data = {
      name: device.name,
      data: {
        id: `${this.id}-${dataId}`,
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
