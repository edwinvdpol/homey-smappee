'use strict';

const Driver = require('../../lib/Driver');

class SwitchDriver extends Driver {

  /*
  | Pairing functions
  */

  // Return devices while pairing
  async getPairDevices({ oAuth2Client }) {
    return oAuth2Client.discoverPlugDevices();
  }

  // Return capabilities while pairing
  getPairCapabilities(device) {
    return ['onoff'];
  }

  // Return device ID while pairing
  getPairDeviceId(device) {
    return `CP-${device.serviceLocationId}-${device.id}`;
  }

  // Return store value while pairing
  getPairStore(device) {
    return {
      id: device.id,
      service_location_id: device.serviceLocationId,
      service_location_from: device.serviceLocationFrom,
      service_location_uuid: device.serviceLocationUuid,
    };
  }

}

module.exports = SwitchDriver;
