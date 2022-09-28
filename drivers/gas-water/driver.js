'use strict';

const { collect } = require('collect.js');
const Driver = require('../../lib/Driver');

class GasWaterDriver extends Driver {

  /*
  | Pairing functions
  */

  // Return devices while pairing
  async getPairDevices({ oAuth2Client }) {
    return oAuth2Client.discoverGasWaterDevices();
  }

  // Return capabilities while pairing
  getPairCapabilities(device) {
    const channels = collect(device.channels);

    const capabilities = [
      'measure_battery',
      'measure_humidity',
      'measure_temperature',
    ];

    if (channels.firstWhere('type', 'gas')) {
      capabilities.push('meter_gas');
    }

    if (channels.firstWhere('type', 'water')) {
      capabilities.push('meter_water');
    }

    return capabilities;
  }

  // Return settings value while pairing
  getPairSettings(device) {
    return {
      serial_number: device.name,
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    const channels = collect(device.channels);
    const water = channels.firstWhere('type', 'water');
    const gas = channels.firstWhere('type', 'gas');

    const store = {
      id: device.id,
      service_location_id: device.serviceLocationId,
      service_location_uuid: device.serviceLocationUuid,
    };

    if (water) {
      store.water_enabled = water.enabled;
      store.water_uom = water.uom;
      store.water_ppu = water.ppu;
      store.water_channel = water.channel;
    }

    if (gas) {
      store.gas_enabled = gas.enabled;
      store.gas_uom = gas.uom;
      store.gas_ppu = gas.ppu;
      store.gas_channel = gas.channel;
    }

    return store;
  }

}

module.exports = GasWaterDriver;
