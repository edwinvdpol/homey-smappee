'use strict';

const Homey = require('homey');
const { OAuth2Client } = require('homey-oauth2app');
const { collect } = require('collect.js');
const OAuth2Error = require('homey-oauth2app/lib/OAuth2Error');
const { blank, filled } = require('./Utils');

class Client extends OAuth2Client {

  static API_URL = 'https://app1pub.smappee.net/dev/v3';
  static TOKEN_URL = 'https://app1pub.smappee.net/dev/v3/oauth2/token';
  static AUTHORIZATION_URL = 'https://app1pub.smappee.net/dev/v3/oauth2/authorize';
  static SCOPES = [];

  /*
  | General actions
  */

  // Return service location information
  async getLocation(id, type = null) {
    let path = `/servicelocation/${id}`;

    if (type !== null) {
      path += `/${type}`;
    }

    return this._get(path);
  }

  // Return service locations
  async getLocations() {
    const result = await this._get('/servicelocation');

    return collect(result.serviceLocations || []);
  }

  // Return metering configuration by service location ID
  async getMetering(serviceLocationId) {
    return this.getLocation(serviceLocationId, 'meteringconfiguration');
  }

  // Return smart devices at given service location
  async getSmartDevices(serviceLocationId) {
    return this.getLocation(serviceLocationId, 'smartdevices');
  }

  // Return smart device at given service location
  async getSmartDevice(serviceLocationId, deviceId) {
    return this.getLocation(serviceLocationId, `smartdevices/${deviceId}`);
  }

  /*
  | Service location actions
  */

  // Return service location consumption
  async getServiceLocationConsumption(serviceLocationId, aggregation) {
    const result = await this.getAggregation(serviceLocationId, '/consumption', aggregation, this.startOfDay(), this.endOfDay());

    return collect(result.consumptions || []);
  }

  // Return latest service location consumption
  async getLatestServiceLocationConsumption(serviceLocationId) {
    const consumptions = await this.getServiceLocationConsumption(serviceLocationId, 1);

    return consumptions.last() || {};
  }

  /*
  | Charging point actions
  */

  // Return charging sessions for charging station
  async getChargingStationSessions(serialNumber, start, end, active) {
    const result = await this._get(`/chargingstations/${serialNumber}/sessions?range=${start},${end}&active=${active}`);

    return collect(result || []);
  }

  // Return charging sessions for charging station since last week
  async getLatestChargingStationSessions(serialNumber, active = null) {
    return this.getChargingStationSessions(serialNumber, this.startOfWeekAgo(), this.endOfDay(), active);
  }

  // Return charging sessions for charging point since last week
  async getLatestChargingPointSessions(stationSerialNumber, serialNumber, active = null) {
    const sessions = await this.getLatestChargingStationSessions(stationSerialNumber, active);

    return sessions.where('serialNumber', serialNumber);
  }

  /*
  | Chargingstation actions
  */

  // Return LED brightness
  async getLedBrightness(serviceLocationId, ledId) {
    const result = await this.getSmartDevice(serviceLocationId, ledId);

    // Configuration properties must exist
    if (blank(result)) return 0;
    if (blank(result.configurationProperties)) return 0;

    for (const config of result.configurationProperties) {
      if (blank(config.spec)) continue;
      if (blank(config.spec.name)) continue;

      if (config.spec.name.endsWith('brightness')) {
        return Number(config.value) || 0;
      }
    }

    return 0;
  }

  // Set LED brightness
  async setLedBrightness(serviceLocationId, ledId, brightness) {
    const path = `/servicelocation/${serviceLocationId}/smartdevices/${ledId}`;
    const json = {
      configurationProperties: [{
        value: brightness,
        spec: { name: 'etc.smart.device.type.car.charger.led.config.brightness' },
      }],
    };

    this.log('PATCH', path, JSON.stringify(json));

    return this.patch({
      path,
      query: '',
      json,
      body: '',
      headers: {},
    });
  }

  // Set charging mode
  async setChargingMode(serialNumber, position, mode) {
    const path = `/chargingstations/${serialNumber}/connectors/${position}/mode`;
    const json = {
      mode: mode.toUpperCase(),
    };

    this.log('PUT', path, JSON.stringify(json));

    return this.put({
      path,
      query: '',
      json,
      body: '',
      headers: {},
    });
  }

  /*
  | Switch actions
  */

  // Return switch consumption
  async getSwitchConsumption(id, serviceLocationId, aggregation) {
    const result = await this.getAggregation(serviceLocationId, `/switch/${id}/consumption`, aggregation, this.startOfDay(), this.endOfDay());

    return collect(result.records || []);
  }

  // Return latest switch consumption
  async getLatestSwitchConsumption(id, serviceLocationId) {
    const records = await this.getSwitchConsumption(id, serviceLocationId, 1);

    return records.last() || {};
  }

  // Return switch state
  async getSwitchState(id, serviceLocationId) {
    return this.getLocation(serviceLocationId, `actuator/${id}/state`);
  }

  // Set actuator state
  async setActuatorState(id, serviceLocationId, state, duration = 0) {
    const path = `/servicelocation/${serviceLocationId}/actuator/${id}/${state}`;

    this.log('POST', path);

    await this.post({
      path,
      query: '',
      json: {
        duration,
      },
      body: null,
      headers: {},
    });
  }

  /*
  | Sensor actions
  */

  // Return sensor consumption
  async getSensorConsumption(id, serviceLocationId, aggregation, fillGaps = true) {
    const result = await this.getAggregation(serviceLocationId, `/sensor/${id}/consumption`, aggregation, this.startOfYesterday(), this.endOfDay(), fillGaps);

    const records = collect(result.records || []);

    return records.isNotEmpty()
      ? records.takeUntil((item) => item.timestamp > new Date().getTime())
      : records;
  }

  // Return initial sensor consumption
  async getInitialSensorConsumption(id, serviceLocationId) {
    const records = await this.getSensorConsumption(id, serviceLocationId, 1);

    if (records.isEmpty()) {
      return {};
    }

    const result = records.last((item) => item.temperature > 0) || {};
    const last = records.last();

    result.value1 = last.value1 || null;
    result.value2 = last.value2 || null;

    return result;
  }

  // Return latest filled sensor consumption
  async getLatestFilledSensorConsumption(id, serviceLocationId) {
    const records = await this.getSensorConsumption(id, serviceLocationId, 1, false);

    return records.last() || {};
  }

  /*
  | Device discovery functions
  */

  // Discover metering devices with given type
  async discoverMeteringDevices(type) {
    const locations = await this.getLocations();

    const devices = await Promise.all(locations.map(async (location) => {
      const metering = await this.discoverMeteringDevicesAtLocation(location, type);

      return metering.all();
    }));

    return collect(devices).flatten(1);
  }

  // Discover metering devices at given service location
  async discoverMeteringDevicesAtLocation(location, type) {
    // Get metering configuration
    const data = await this.getMetering(location.serviceLocationId);

    return collect(data[type])
      .transform((d) => {
        d.serviceLocationId = location.serviceLocationId;
        d.serviceLocationUuid = location.serviceLocationUuid;
        return d;
      });
  }

  // Discover smart devices with given type
  async discoverSmartDevices(type = null) {
    const locations = await this.getLocations();

    const devices = await Promise.all(locations.map(async (location) => {
      return this.discoverSmartDevicesAtLocation(location, type);
    }));

    return collect(devices).flatten(1);
  }

  // Discover smart devices at given service location
  async discoverSmartDevicesAtLocation(location, type = null) {
    // Get smart devices
    const data = await this.getSmartDevices(location.serviceLocationId);

    let devices = collect(data)
      .transform((device) => {
        device.serviceLocationId = location.serviceLocationId;
        return device;
      });

    if (filled(type)) {
      devices = devices.where('type.category', type.toUpperCase());
    }

    return devices.all();
  }

  // Discover Connect devices
  async discoverConnectDevices() {
    const locations = await this.getLocations();

    const devices = locations
      .filter((data) => data.deviceSerialNumber.startsWith('51'))
      .all();

    return Promise.all(devices.map(async (device) => {
      const measurements = await this.discoverMeteringDevicesAtLocation(device, 'measurements');

      device.solar = measurements.where('type', 'PRODUCTION').isNotEmpty();

      return device;
    }));
  }

  // Discover Energy devices
  async discoverEnergyDevices() {
    const locations = await this.getLocations();

    return locations
      .filter((data) => data.deviceSerialNumber.startsWith('10'))
      .all();
  }

  // Discover EV wall devices
  async discoverEVWallDevices() {
    const stations = await this.discoverMeteringDevices('chargingStations');
    const smartDevices = await this.discoverSmartDevices();

    stations.filter((station) => {
      return station.serialNumber.startsWith('61')
          || station.serialNumber.startsWith('62');
    });

    const smartStations = smartDevices.where('type.category', 'CHARGINGSTATION');
    const smartChargers = smartDevices.where('type.category', 'CARCHARGER');

    const devices = await Promise.all(stations.map(async (station) => {
      const smartStation = smartStations.firstWhere('uuid', station.serialNumber);
      const stationChargers = collect(station.chargers);

      return Promise.all(stationChargers.map(async (charger) => {
        const smartCharger = smartChargers.firstWhere('uuid', charger.uuid);

        const serviceLocationUuid = collect(smartCharger.properties)
          .where('spec.updateChannel.protocol', 'MQTT')
          .pluck('spec.updateChannel.name').first()
          .split('/')[1];

        const location = {
          serviceLocationId: station.id,
        };

        const ledDevices = await this.discoverSmartDevicesAtLocation(location, 'LED');
        const ledId = filled(ledDevices) ? ledDevices[0].id : null;

        return {
          id: smartCharger.id,
          uuid: smartCharger.uuid,
          name: smartCharger.name,
          icon: smartCharger.type.logoURL || null,
          position: charger.position,
          minPower: charger.minPower,
          maxPower: charger.maxPower,
          minCurrent: charger.minCurrent,
          maxCurrent: charger.maxCurrent,
          serialNumber: charger.serialNumber,
          serviceLocationId: station.id,
          station: {
            id: smartStation.id,
            name: smartStation.name,
            serialNumber: station.serialNumber,
          },
          ledId,
          serviceLocationUuid,
        };
      }));
    }));

    return collect(devices).flatten(1).unique('id').all();
  }

  // Discover Gas & Water devices
  async discoverGasWaterDevices() {
    const devices = await this.discoverMeteringDevices('sensors');

    return devices
      .filter((data) => data.name.startsWith('30'))
      .all();
  }

  // Discover Genius devices
  async discoverGeniusDevices() {
    const locations = await this.getLocations();

    const devices = locations
      .filter((data) => data.deviceSerialNumber.startsWith('50'))
      .all();

    return Promise.all(devices.map(async (device) => {
      const measurements = await this.discoverMeteringDevicesAtLocation(device, 'measurements');

      device.solar = measurements.where('type', 'PRODUCTION').isNotEmpty();

      return device;
    }));
  }

  // Discover Solar devices
  async discoverSolarDevices() {
    const locations = await this.getLocations();

    return locations
      .filter((data) => data.deviceSerialNumber.startsWith('11'))
      .all();
  }

  // Discover Switch devices
  async discoverSwitchDevices() {
    const devices = await this.discoverMeteringDevices('actuators');

    return devices
      .filter((data) => data.serialNumber.startsWith('40'))
      .all();
  }

  /*
  | Support functions
  */

  async getAggregation(serviceLocationId, uri, aggregation, start, end, fillGaps = false) {
    let path = `/servicelocation/${serviceLocationId}${uri}?aggregation=${aggregation}&from=${start}&to=${end}`;

    if (fillGaps) {
      path += '&fillGaps=true';
    }

    return this._get(path);
  }

  // Return end of day in epoch time
  endOfDay() {
    const end = new Date();

    end.setUTCHours(23, 59, 59, 999);

    return end.getTime();
  }

  // Return start of day in epoch time
  startOfDay() {
    const start = new Date();

    start.setUTCHours(0, 0, 0, 0);

    return start.getTime();
  }

  // Return start of week ago in epoch time
  startOfWeekAgo() {
    const weekInMs = 7 * 24 * 60 * 60 * 1000;

    return this.startOfDay() - weekInMs;
  }

  // Return start of yesterday in epoch time
  startOfYesterday() {
    const dayInMs = 24 * 60 * 60 * 1000;

    return this.startOfDay() - dayInMs;
  }

  /*
  | Support functions
  */

  // Perform GET request
  async _get(path) {
    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  /*
  | Client events
  */

  // Client initialized
  async onInit() {
    this.log('Initialized');
  }

  // Client destroyed
  async onUninit() {
    this.log('Destroyed');
  }

  // Get token by code
  async onGetTokenByCode({ code }) {
    this._clientId = this.homey.settings.get(Homey.env.SMAPPEE_CLIENT_ID_SETTING) || '';
    this._clientSecret = this.homey.settings.get(Homey.env.SMAPPEE_CLIENT_SECRET_SETTING) || '';

    return super.onGetTokenByCode({ code });
  }

  // Authorization URL
  onHandleAuthorizationURL({ scopes, state } = {}) {
    this._clientId = this.homey.settings.get(Homey.env.SMAPPEE_CLIENT_ID_SETTING) || '';

    return super.onHandleAuthorizationURL({ scopes, state });
  }

  // Request response is not OK
  async onHandleNotOK({
    body, status, statusText, headers,
  }) {
    this.error('Request not OK', JSON.stringify({
      body,
      status,
      statusText,
      headers,
    }));

    let error = null;

    if (filled(body.Message)) {
      error = body.Message;
    }

    if (filled(body.message)) {
      error = body.message;
    }

    // Client errors
    if (status === 401 || status === 403 || status === 404) {
      return new Error(this.homey.__(`errors.${status}`));
    }

    // Internal server error
    if (status >= 500 && status < 600) {
      return new Error(this.homey.__('errors.50x'));
    }

    // Custom error message
    if (error) {
      return new Error(error);
    }

    // Unknown error
    return new Error(this.homey.__('errors.unknown'));
  }

  // Handle response
  async onHandleResponse({
    response,
    status,
    statusText,
    headers,
    ok,
  }) {
    if (status === 204) {
      return undefined;
    }

    let body = await response.text();

    try {
      body = JSON.parse(body);
    } catch (err) {
    }

    if (ok) {
      return body;
    }

    const err = await this.onHandleNotOK({
      body,
      status,
      statusText,
      headers,
    });

    if (!(err instanceof Error)) {
      throw new OAuth2Error('Invalid onHandleNotOK return value, expected: instanceof Error');
    }

    throw err;
  }

  // Handle result
  async onHandleResult({
    result, status, statusText, headers,
  }) {
    if (blank(result) || typeof result === 'string' || typeof result === 'object') {
      // this.log('Response', JSON.stringify(result).slice(0, 150));

      return result;
    }

    this.error('Invalid response', result);

    throw new Error(this.homey.__('errors.50x'));
  }

  // Refresh token
  async onRefreshToken() {
    this._clientId = this.homey.settings.get(Homey.env.SMAPPEE_CLIENT_ID_SETTING) || '';
    this._clientSecret = this.homey.settings.get(Homey.env.SMAPPEE_CLIENT_SECRET_SETTING) || '';

    return super.onRefreshToken();
  }

  // Request error
  async onRequestError({ err }) {
    this.error('Request error', err.message);

    throw new Error(this.homey.__('errors.network'));
  }

}

module.exports = Client;
