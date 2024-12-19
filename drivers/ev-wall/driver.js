'use strict';

const Driver = require('../../lib/Driver');

class EVWallDriver extends Driver {

  /*
  | Device events
  */

  // Driver initialized
  async onOAuth2Init() {
    // Register flow cards
    this.registerActionFlowCards();
    this.registerConditionFlowCards();

    // Initialise parent driver
    await super.onOAuth2Init();
  }

  /*
  | Pairing functions
  */

  // Return devices while pairing
  async getPairDevices({ oAuth2Client }) {
    return oAuth2Client.discoverEVWallDevices();
  }

  // Return capabilities while pairing
  getPairCapabilities(device) {
    return [
      'measure_power',
      'meter_power',
      'cable_connected',
      'charging',
      'charging_mode',
    ];
  }

  // Return device ID while pairing
  getPairDeviceId(device) {
    return `EV-${device.serviceLocationId}-${device.id}`;
  }

  // Return settings value while pairing
  getPairSettings(device) {
    return {
      serial_number: device.serialNumber,
      min_current: `${device.minCurrent} A`,
      max_current: `${device.maxCurrent} A`,
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    return {
      id: device.id,
      uuid: device.uuid,
      name: device.name,
      led_id: device.ledId,
      station: device.station,
      position: device.position,
      min_power: device.minPower,
      max_power: device.maxPower,
      service_location_id: device.serviceLocationId,
      service_location_uuid: device.serviceLocationUuid,
    };
  }

  /*
  | Register flow cards functions
  */

  // Register action flow cards
  registerActionFlowCards() {
    // ... then pause charging ...
    this.homey.flow.getActionCard('charging_mode_pause').registerRunListener(async ({ device }) => {
      await device.setChargingMode('paused');
    });

    // ... then set charging mode to smart ...
    this.homey.flow.getActionCard('charging_mode_smart').registerRunListener(async ({ device }) => {
      await device.setChargingMode('smart');
    });

    // ... then set charging mode to standard ...
    this.homey.flow.getActionCard('charging_mode_standard').registerRunListener(async ({ device }) => {
      await device.setChargingMode('normal');
    });
  }

  // Register condition flow cards
  registerConditionFlowCards() {
    // ... and cable is connected...
    this.homey.flow.getConditionCard('cable_connected').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('cable_connected') === true;
    });
  }

}

module.exports = EVWallDriver;
