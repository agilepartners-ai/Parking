// Expo's default Metro config already understands npm workspaces (it watches the monorepo root).
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);
