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

  /*
  | Pairing functions
  */

  async onPair(session) {
    await super.onPair(session);

    session.setHandler('login', async (data) => {
      const clientId = data.username.trim();
      const clientSecret = data.password.trim();

      if (clientId.length < 4) {
        throw new Error(this.homey.__('errors.clientId'));
      }

      if (clientSecret.length < 6) {
        throw new Error(this.homey.__('errors.clientSecret'));
      }

      this.homey.settings.set(Homey.env.SMAPPEE_CLIENT_ID_SETTING, clientId);
      this.homey.settings.set(Homey.env.SMAPPEE_CLIENT_SECRET_SETTING, clientSecret);

      // Show the next view
      await session.nextView();
    });
  }

  // Pair devices
  async onPairListDevices({ oAuth2Client }) {
    this.log(`Pairing ${this.id}s...`);

    this.log('Get devices from API');
    const devices = await this.getPairDevices({ oAuth2Client });

    return devices.map((device) => this.getDeviceData(device)).filter((e) => e);
  }

  // Return data to create the device
  getDeviceData(device) {
    const data = {
      name: device.name,
      data: {
        id: device.id,
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
