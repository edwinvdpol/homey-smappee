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
    this.available = data.available || true;
    this.chargingState = data.chargingState || null;
    this.chargingMode = data.chargingMode || null;
    this.state = { current: '', previous: '' };

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
      chargingState: this.getChargingState(),
    };
  }

  // Return the charging state
  getChargingState() {
    if (!this.isCableConnected()) {
      return 'plugged_out';
    }

    if (this.isCharging()) {
      return 'plugged_in_charging';
    }

    return 'plugged_in';

    // possible options:
    // plugged_in_discharging
    // plugged_in_paused

    // plugged_in_charging
    // plugged_in
    // plugged_out
  }

  // Return whether the cable is connected
  isCableConnected() {
    if (this.state.current.startsWith('B')) {
      return true;
    }

    return this.isCharging();
  }

  // Return whether charging is active
  isCharging() {
    return this.state.current.startsWith('C');
  }

}

module.exports = ChargingState;
