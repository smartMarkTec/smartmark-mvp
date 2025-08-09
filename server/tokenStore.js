// server/tokenStore.js
// Shared token store so all modules can read the current FB user token.

let state = {
  fbUserToken: null, // long-lived user token with ads_read + ads_management
};

module.exports = {
  setFbUserToken(token) {
    state.fbUserToken = token || null;
  },
  getFbUserToken() {
    return state.fbUserToken || null;
  }
};
