'use strict';

const { OAuth2App } = require('homey-oauth2app');
const Client = require('./Client');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  /*
  | Application events
  */

  // Application initialized
  async onOAuth2Init() {
    this.log('Initialized');
  }

  // Application destroyed
  async onOAuth2Uninit() {
    this.log('Destroyed');
  }

}

module.exports = App;
