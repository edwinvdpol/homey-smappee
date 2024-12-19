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
    const water = channels.where('type', 'water').first();
    const gas = channels.where('type', 'gas').first();

    const capabilities = [
      'measure_battery',
      'measure_humidity',
      'measure_temperature',
    ];

    if (gas && gas.enabled && gas.uom === 'm3') {
      capabilities.push('meter_gas');
    }

    if (water && water.enabled) {
      capabilities.push('button.reset_water_meter');

      if (water.uom === 'm3') {
        capabilities.push('meter_water');
      }
    }

    return capabilities;
  }

  // Return device ID while pairing
  getPairDeviceId(device) {
    return `GW-${device.serviceLocationId}-${device.id}`;
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
    const water = channels.where('type', 'water').first();
    const gas = channels.where('type', 'gas').first();

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
