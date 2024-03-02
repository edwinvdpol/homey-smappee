'use strict';

/**
 * A = no EV connected
 * B = cable connected
 * C = charging
 * D = charging (deprecated status)
 * E = error
 * F = faulty (maintenance needed)
 * x1 = EV supply equipment not ready to supply energy
 * x2 = EV supply equipment ready to supply energy
 */
class ChargingState {

  constructor(data) {
    this.available = data.available || false;
    this.chargingState = data.chargingState || null;
    this.chargingMode = data.chargingMode || null;
    this.state = { current: null, previous: null };

    if ('iecStatus' in data) {
      this.state = data.iecStatus;
    }
  }

  // Return capability values
  get capabilities() {
    return {
      cableConnected: this.isCableConnected(),
      charging: this.isCharging(),
      chargingMode: this.chargingMode.toLowerCase(),
    };
  }

  // Return whether the cable is connected
  isCableConnected() {
    if (this.state.current === 'B1' || this.state.current === 'B2') {
      return true;
    }

    return this.isCharging();
  }

  // Return whether charging is active
  isCharging() {
    if (this.state.current === 'C1') {
      if (this.state.previous === 'C2') return true;

      return true;
    }

    return this.state.current === 'C2';
  }

}

module.exports = ChargingState;
