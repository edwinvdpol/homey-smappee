'use strict';

const GeniusDriver = require('../genius/driver');

class PlusDriver extends GeniusDriver {

  /*
  | Pairing functions
  */

  // Return devices while pairing
  async getPairDevices({ oAuth2Client }) {
    return oAuth2Client.discoverPlusDevices();
  }

  // Return device ID while pairing
  getPairDeviceId(device) {
    return `PL-${device.serviceLocationId}`;
  }

}

module.exports = PlusDriver;
