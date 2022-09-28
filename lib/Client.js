'use strict';

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

  // Return service locations
  async getLocations() {
    this.log('GET /servicelocation');

    const result = await this.get({
      path: '/servicelocation',
      query: '',
      headers: {},
    });

    return collect(result.serviceLocations);
  }

  // Return metering configuration by service location ID
  async getMetering(serviceLocationId) {
    const path = `/servicelocation/${serviceLocationId}/meteringconfiguration`;

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  // Return smart devices
  async getSmartDevices(serviceLocationId) {
    const path = `/servicelocation/${serviceLocationId}/smartdevices`;

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  /*
  | Charging point actions
  */

  // Return charging sessions for charging station
  async getChargingStationSessions(serialNumber, start, end, active) {
    const path = `/chargingstations/${serialNumber}/sessions?range=${start},${end}&active=${active}`;

    this.log('GET', path);

    const result = await this.get({
      path,
      query: '',
      headers: {},
    });

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
    const result = await this.getAggregation(serviceLocationId, `switch/${id}/consumption`, aggregation, this.startOfDay(), this.endOfDay());

    return collect(result.records || []);
  }

  // Return latest switch consumption
  async getLatestSwitchConsumption(id, serviceLocationId) {
    const records = await this.getSwitchConsumption(id, serviceLocationId, 1);

    return records.last() || {};
  }

  // Return switch state
  async getSwitchState(id, serviceLocationId) {
    return this.get({
      path: `/servicelocation/${serviceLocationId}/actuator/${id}/state`,
      query: '',
      headers: {},
    });
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
    const result = await this.getAggregation(serviceLocationId, `sensor/${id}/consumption`, aggregation, this.startOfYesterday(), this.endOfDay(), fillGaps);

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
      return this.discoverMeteringDevicesAtLocation(location, type);
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
      }).all();
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
  async discoverSmartDevicesAtLocation(location, type) {
    // Get smart devices
    const data = await this.getSmartDevices(location.serviceLocationId);

    const devices = collect(data)
      .transform((device) => {
        device.serviceLocationId = location.serviceLocationId;
        return device;
      });

    if (type) {
      devices.where('type.category', type.toUpperCase());
    }

    return devices.all();
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

    return stations.map((station) => {
      const smartStation = smartStations.firstWhere('uuid', station.serialNumber);
      const stationChargers = collect(station.chargers);

      return stationChargers.map((charger) => {
        const smartCharger = smartChargers.firstWhere('uuid', charger.uuid);

        const serviceLocationUuid = collect(smartCharger.properties)
          .where('spec.updateChannel.protocol', 'MQTT')
          .pluck('spec.updateChannel.name').first()
          .split('/')[1];

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
          serviceLocationUuid,
        };
      }).all();
    }).flatten(1).all();
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
    const devices = await this.getLocations();

    return devices
      .filter((data) => data.deviceSerialNumber.startsWith('50'))
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
    let path = `/servicelocation/${serviceLocationId}/${uri}?aggregation=${aggregation}&from=${start}&to=${end}`;

    if (fillGaps) {
      path += '&fillGaps=true';
    }

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
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
  | Client events
  */

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

    // Unauthorized
    if (status === 401) {
      return new Error(this.homey.__('errors.401'));
    }

    // Device / page not found
    if (status === 404) {
      return new Error(this.homey.__('errors.404'));
    }

    // API internal server error
    if (status >= 500 && status < 600) {
      return new Error(this.homey.__('errors.50x'));
    }

    // Custom error message
    if (error) {
      return new Error(error);
    }

    // Invalid response
    return new Error(this.homey.__('errors.response'));
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

    this.error('Invalid API response:', result);

    throw new Error(this.homey.__('errors.response'));
  }

  // Request error
  async onRequestError({ err }) {
    this.error('Request error:', err.message);

    throw new Error(this.homey.__('errors.50x'));
  }

  // Refresh token
  // async onRefreshToken() {
  //   const token = this.getToken();
  //   if (!token) {
  //     throw new OAuth2Error('Missing Token');
  //   }
  //
  //   this.debug('Refreshing token...');
  //
  //   if (!token.isRefreshable()) {
  //     throw new OAuth2Error('Token cannot be refreshed');
  //   }
  //
  //   const body = new URLSearchParams();
  //   body.append('grant_type', 'refresh_token');
  //   body.append('client_id', this.homey.settings.get(this.homey.env.SMAPPEE_CLIENT_ID_SETTING) || '');
  //   body.append('client_secret', this.homey.settings.get(this.homey.env.SMAPPEE_CLIENT_SECRET_SETTING) || '');
  //   body.append('refresh_token', token.refresh_token);
  //
  //   const response = await fetch(this._tokenUrl, {
  //     body,
  //     method: 'POST',
  //   });
  //   if (!response.ok) {
  //     this._token = null;
  //     this.emit('expired');
  //     this.save();
  //     return this.onHandleRefreshTokenError({ response });
  //   }
  //
  //   this._token = await this.onHandleRefreshTokenResponse({ response });
  //
  //   this.debug('Refreshed token!', this._token);
  //   this.save();
  //
  //   return this.getToken();
  // }

  // Get token by code
  // async onGetTokenByCode({ code }) {
  //   const body = new URLSearchParams();
  //   body.append('grant_type', 'authorization_code');
  //   body.append('client_id', this.homey.settings.get(this.homey.env.SMAPPEE_CLIENT_ID_SETTING) || '');
  //   body.append('client_secret', this.homey.settings.get(this.homey.env.SMAPPEE_CLIENT_SECRET_SETTING) || '');
  //   body.append('code', code);
  //   body.append('redirect_uri', this._redirectUrl);
  //
  //   const response = await fetch(this._tokenUrl, {
  //     body,
  //     method: 'POST',
  //   });
  //   if (!response.ok) {
  //     return this.onHandleGetTokenByCodeError({ response });
  //   }
  //
  //   this._token = await this.onHandleGetTokenByCodeResponse({ response });
  //   return this.getToken();
  // }

}

module.exports = Client;
