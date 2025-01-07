'use strict';

const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('@drenso/homey-log');
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

    this.log('Initialized');
  }

  // Application destroyed
  async onOAuth2Uninit() {
    this.log('Destroyed');
  }

}

module.exports = App;
