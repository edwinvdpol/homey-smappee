'use strict';

const Homey = require('homey');
const { OAuth2Client } = require('homey-oauth2app');
const { collect } = require('collect.js');
const OAuth2Error = require('homey-oauth2app/lib/OAuth2Error');
const { blank, filled } = require('./Utils');
const { Aggregation } = require('./Enums');

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
  async getServiceLocationConsumption(id, aggregation, from, until = null, fillGaps = true) {
    if (until === null) {
      until = new Date().getTime();
    }

    const result = await this.getAggregation(id, '/consumption', aggregation, from, until, fillGaps);

    return collect(result.consumptions || []);
  }

  // Return initial service location consumption
  async getInitialServiceLocationConsumption(id) {
    let history = await this.getHistoricalServiceLocationConsumption(id);
    const timestamp = history.timestamp || this.startOfYesterday();

    const latest = await this.getLatestServiceLocationConsumption(id, timestamp);

    const result = {
      timestamp: latest.timestamp || timestamp,
      consumption: (history.consumption + latest.consumption),
      solar: (history.solar + latest.solar),
      gridImport: (history.gridImport + latest.gridImport),
      gridExport: (history.gridExport + latest.gridExport),
    };

    history = null;

    return result;
  }

  // Return historical service location consumption
  async getHistoricalServiceLocationConsumption(id) {
    let consumptions = await this.getServiceLocationConsumption(id, Aggregation.Monthly, 1262304000);

    const result = {
      consumption: 0,
      solar: 0,
      gridImport: 0,
      gridExport: 0,
    };

    if (consumptions.isEmpty()) return result;

    const last = consumptions.last();

    result.timestamp = last.timestamp;
    result.consumption = last.consumption ? (consumptions.sum('consumption') / 1000) : 0;
    result.solar = last.solar ? (consumptions.sum('solar') / 1000) : 0;
    result.gridImport = last.gridImport ? (consumptions.sum('gridImport') / 1000) : 0;
    result.gridExport = last.gridExport ? (consumptions.sum('gridExport') / 1000) : 0;

    consumptions = null;

    return result;
  }

  // Return latest service location consumption
  async getLatestServiceLocationConsumption(id, from) {
    from += 5000;

    let consumptions = await this.getServiceLocationConsumption(id, Aggregation.FiveMinutes, from);

    const result = {
      consumption: 0,
      solar: 0,
      gridImport: 0,
      gridExport: 0,
    };

    if (consumptions.isEmpty()) return result;

    const last = consumptions.last();

    result.timestamp = last.timestamp;
    result.consumption = last.consumption ? (consumptions.sum('consumption') / 1000) : 0;
    result.solar = last.solar ? (consumptions.sum('solar') / 1000) : 0;
    result.gridImport = last.gridImport ? (consumptions.sum('gridImport') / 1000) : 0;
    result.gridExport = last.gridExport ? (consumptions.sum('gridExport') / 1000) : 0;

    consumptions = null;

    return result;
  }

  // Return input channels at given service location
  async getServiceLocationInputChannels(location) {
    // Get metering configuration
    const data = await this.getMetering(location.serviceLocationId);

    if (!('channelsConfiguration' in data)) return collect();
    const config = data.channelsConfiguration;

    if (!('inputChannels' in config)) return collect();

    return collect(config.inputChannels);
  }

  // Return whether the service location has solar support
  async serviceLocationHasSolar(location) {
    const channels = await this.getServiceLocationInputChannels(location);

    return channels
      .where('inputChannelType', 'PRODUCTION')
      .where('inputChannelConnection', 'GRID')
      .isNotEmpty();
  }

  /*
  | Actuator actions
  */

  // Return actuator state
  async getActuatorState(id, serviceLocationId) {
    return this.getLocation(serviceLocationId, `actuator/${id}/state`);
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
    return this._patch(`/servicelocation/${serviceLocationId}/smartdevices/${ledId}`, {
      configurationProperties: [{
        value: brightness,
        spec: { name: 'etc.smart.device.type.car.charger.led.config.brightness' },
      }],
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
    const records = await this.getSwitchConsumption(id, serviceLocationId, Aggregation.FiveMinutes);

    return records.last() || {};
  }

  // Set actuator state
  async setActuatorState(id, serviceLocationId, state, duration = 0) {
    return this._post(
      `/servicelocation/${serviceLocationId}/actuator/${id}/${state}`,
      { duration },
    );
  }

  /*
  | Sensor actions
  */

  // Return sensor consumption
  async getSensorConsumption(id, serviceLocationId, aggregation, from, until = null, fillGaps = true) {
    if (until === null) {
      until = new Date().getTime();
    }

    const result = await this.getAggregation(serviceLocationId, `/sensor/${id}/consumption`, aggregation, from, until, fillGaps);

    return collect(result.records || []);
  }

  // Return initial sensor consumption
  async getInitialSensorConsumption(id, serviceLocationId) {
    let history = await this.getHistoricalSensorConsumption(id, serviceLocationId);
    const timestamp = history.timestamp || this.startOfYesterday();

    const latest = await this.getLatestSensorConsumption(id, serviceLocationId, timestamp);

    const result = {
      timestamp: latest.timestamp || timestamp,
      value1: (history.value1 + latest.value1),
      value2: (history.value2 + latest.value2),
    };

    history = null;

    if (latest.temperature) {
      result.temperature = latest.temperature;
    }

    if (latest.humidity) {
      result.humidity = latest.humidity;
    }

    if (latest.battery) {
      result.battery = latest.battery;
    }

    return result;
  }

  // Return historical sensor consumption
  async getHistoricalSensorConsumption(id, serviceLocationId) {
    let records = await this.getSensorConsumption(id, serviceLocationId, Aggregation.Monthly, 1262304000);

    if (records.isEmpty()) return { value1: 0, value2: 0 };

    const last = records.last();

    const result = {
      timestamp: last.timestamp,
      value1: last.value1 ? (records.sum('value1') / 1000) : 0,
      value2: last.value2 ? (records.sum('value2') / 1000) : 0,
    };

    records = null;

    return result;
  }

  // Return latest sensor consumption
  async getLatestSensorConsumption(id, serviceLocationId, from) {
    from += 5000;

    let records = await this.getSensorConsumption(id, serviceLocationId, Aggregation.FiveMinutes, from);

    if (records.isEmpty()) return { value1: 0, value2: 0 };

    const last = records.last((item) => item.battery && item.battery > 0) || {};

    const result = {
      timestamp: records.last().timestamp,
      value1: last.value1 ? (records.sum('value1') / 1000) : 0,
      value2: last.value2 ? (records.sum('value2') / 1000) : 0,
    };

    records = null;

    if (last.temperature) {
      result.temperature = last.temperature;
    }

    if (last.humidity) {
      result.humidity = last.humidity;
    }

    if (last.battery) {
      result.battery = last.battery;
    }

    return result;
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
    const sensors = await this.discoverMeteringDevices('sensors');

    return sensors
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

  // Discover Comfort Plug devices
  async discoverPlugDevices() {
    const devices = await this.discoverMeteringDevices('actuators');

    return devices
      .filter((data) => data.type === 'COMFORT_PLUG')
      .all();
  }

  // Discover Plus devices
  async discoverPlusDevices() {
    const locations = await this.getLocations();

    const devices = locations
      .filter((data) => data.deviceSerialNumber.startsWith('20'))
      .all();

    return Promise.all(devices.map(async (device) => {
      device.solar = await this.serviceLocationHasSolar(device);

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
      .filter((data) => data.type === 'SWITCH')
      .all();
  }

  /*
   * Device functions
   */

  // Get Gas & Water device
  async getGasWaterDevice(id) {
    const devices = await this.discoverGasWaterDevices();

    return collect(devices).where('id', id).first();
  }

  /*
  | Support functions
  */

  async getAggregation(serviceLocationId, uri, aggregation, start, end, fillGaps = false) {
    start = String(start).padEnd(13, '0');
    end = String(end).padEnd(13, '0');

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

  // Perform PATCH request
  async _patch(path, json = null) {
    this.log('PATCH', path, JSON.stringify(json));

    return this.patch({
      path,
      query: '',
      json,
      body: null,
      headers: {},
    });
  }

  // Perform POST request
  async _post(path, json = null) {
    this.log('POST', path, JSON.stringify(json));

    return this.post({
      path,
      query: '',
      json,
      body: null,
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

    let error;

    // Client errors
    if (status === 401 || status === 403 || status === 404) {
      error = new Error(this.homey.__(`error.${status}`));
    }

    // Internal server error
    if (status >= 500 && status < 600) {
      error = new Error(this.homey.__('error.50x'));
    }

    // Custom error message #1
    if (filled(body.Message)) {
      error = new Error(body.Message);
    }

    // Custom error message #2
    if (filled(body.message)) {
      error = new Error(body.message);
    }

    // Unknown error
    if (blank(error)) {
      error = new Error(this.homey.__('error.unknown'));
    }

    error.status = status;
    error.statusText = statusText;

    return error;
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
      return result;
    }

    this.error('[Response]', result);

    throw new Error(this.homey.__('error.50x'));
  }

  // Refresh token
  async onRefreshToken() {
    this.log('[Token] Refreshing');

    this._clientId = this.homey.settings.get(Homey.env.SMAPPEE_CLIENT_ID_SETTING) || '';
    this._clientSecret = this.homey.settings.get(Homey.env.SMAPPEE_CLIENT_SECRET_SETTING) || '';

    return super.onRefreshToken();
  }

  // Request error
  async onRequestError({ err }) {
    this.error('[Request]', err.message);

    throw new Error(this.homey.__('error.network'));
  }

}

module.exports = Client;
