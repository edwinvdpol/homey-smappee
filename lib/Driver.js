'use strict';

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

  // Pair devices
  async onPairListDevices({ oAuth2Client }) {
    this.log('Listing devices');

    const devices = await this.getPairDevices({ oAuth2Client });

    return devices.map((device) => this.getDeviceData(device)).filter((e) => e);
  }

  // Return data to create the device
  getDeviceData(device) {
    return {
      name: device.name,
      data: {
        id: device.id,
      },
      settings: this.getPairSettings(device),
      store: this.getPairStore(device),
      capabilities: this.getPairCapabilities(device),
    };
  }

}

module.exports = Driver;
