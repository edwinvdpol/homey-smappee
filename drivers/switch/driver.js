'use strict';

const Driver = require('../../lib/Driver');

class SwitchDriver extends Driver {

  /*
  | Device events
  */

  // Driver initialized
  async onOAuth2Init() {
    // Register flow cards
    this.registerDeviceTriggerFlowCards();

    // Initialise parent driver
    await super.onOAuth2Init();
  }

  /*
  | Pairing functions
  */

  // Return devices while pairing
  async getPairDevices({ oAuth2Client }) {
    return oAuth2Client.discoverSwitchDevices();
  }

  // Return capabilities while pairing
  getPairCapabilities(device) {
    return [
      'connection_state',
      'measure_power',
      'onoff',
    ];
  }

  // Return device ID while pairing
  getPairDeviceId(device) {
    return `SW-${device.serviceLocationId}-${device.id}`;
  }

  // Return settings value while pairing
  getPairSettings(device) {
    return {
      serial_number: device.serialNumber,
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    return {
      id: device.id,
      monitor_id: device.monitorId,
      service_location_id: device.serviceLocationId,
      service_location_uuid: device.serviceLocationUuid,
    };
  }

  /*
  | Flow card functions
  */

  // Register device trigger flow cards
  registerDeviceTriggerFlowCards() {
    // When connection state changed to ...
    this.homey.flow.getDeviceTriggerCard('connection_state_changed').registerRunListener(async ({ device, state }) => {
      return device.getCapabilityValue('connection_state') === state;
    });
  }

}

module.exports = SwitchDriver;
