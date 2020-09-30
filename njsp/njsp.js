#!/usr/bin/env node
const config = require("../config.js");
const njsp = require("nodejs-server-pages");

var root = {
    "default": "../ws/default"
};
var lobby = new URL(config.lobby);
root["host:" + lobby.host] = "../ws/lobby";

njsp.createServer();
njsp.createWSServer({root});
