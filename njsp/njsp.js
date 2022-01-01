#!/usr/bin/env node
const config = require("../config.js");
const njsp = require("nodejs-server-pages");

const client = new URL(config.client);
const ez = new URL(config.ennuizel);

let root = {
    "default": "../ws/default"
};
root["host:" + client.hostname] = "../ws/client";
root["host:" + ez.hostname] = "../ws/ez";

njsp.createServer({errDB: "nodejs-server-pages-error.db"});
njsp.createWSServer({root, errDB: "nodejs-server-pages-error.db"});
