#!/usr/bin/env node
const config = require("../config.js");
const njsp = require("nodejs-server-pages");

const ez = new URL(config.ennuizel);

let root = {
    "default": "../ws/default"
};
root["host:" + ez.hostname] = "../ws/ez";

njsp.createServer();
njsp.createWSServer({root});
