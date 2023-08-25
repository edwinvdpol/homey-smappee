'use strict';

const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('homey-log');
const Homey = require('homey');
const Client = require('./Client');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  /*
  | Application events
  */

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    this.homey.on('unload', () => this.onUninit());

    this.log('Initialized');
  }

  // Application destroyed
  async onUninit() {
    this.homey.settings.unset(Homey.env.SMAPPEE_CLIENT_ID_SETTING);
    this.homey.settings.unset(Homey.env.SMAPPEE_CLIENT_SECRET_SETTING);

    this.log('Destroyed');
  }

}

module.exports = App;
