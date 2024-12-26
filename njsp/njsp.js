#!/usr/bin/env node
const config = require("../config.js");
const njsp = require("nodejs-server-pages");

let root = {
    "default": "../ws/default"
};

njsp.createServer({errDB: "nodejs-server-pages-error.db"});
njsp.createWSServer({root, errDB: "nodejs-server-pages-error.db"});
