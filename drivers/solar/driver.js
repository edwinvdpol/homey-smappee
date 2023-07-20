'use strict';

const EnergyDriver = require('../energy/driver');

class SolarDriver extends EnergyDriver {

  /*
  | Pairing functions
  */

  // Return devices while pairing
  async getPairDevices({ oAuth2Client }) {
    return oAuth2Client.discoverSolarDevices();
  }

  // Return device ID while pairing
  getPairDeviceId(device) {
    return `SO-${device.serviceLocationId}`;
  }

}

module.exports = SolarDriver;
