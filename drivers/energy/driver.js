'use strict';

const Driver = require('../../lib/Driver');

class EnergyDriver extends Driver {

  /*
  | Pairing functions
  */

  // Return devices while pairing
  async getPairDevices({ oAuth2Client }) {
    return oAuth2Client.discoverEnergyDevices();
  }

  // Return capabilities while pairing
  getPairCapabilities(device) {
    return [
      'measure_power',
      'measure_power.alwayson',
    ];
  }

  // Return settings value while pairing
  getPairSettings(device) {
    return {
      serial_number: device.deviceSerialNumber,
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    return {
      id: device.serviceLocationId,
      service_location_id: device.serviceLocationId,
      service_location_uuid: device.serviceLocationUuid,
    };
  }

}

module.exports = EnergyDriver;
