// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
// A standalone mobile install may not have a root monorepo node_modules folder.
const fs = require('fs');
config.watchFolders = config.watchFolders.filter(folder => fs.existsSync(folder));
config.resolver.nodeModulesPaths = config.resolver.nodeModulesPaths.filter(folder => fs.existsSync(folder));

module.exports = config;
