#!/usr/bin/env node
/* The main entry point and server manager. This doesn't actually listen for
 * connections, it merely responds to requests by the web server component to
 * start recordings, responds with recording IDs, and deletes expired
 * recordings periodically. */

const cp = require("child_process");
const fs = require("fs");
const net = require("net");

const config = require("../config.js");

const server = net.createServer();
const sockPath = config.sock || "/tmp/ennuicastr-server.sock";

try {
    fs.unlinkSync(sockPath);
} catch (ex) {}
server.listen(sockPath);

server.on("connection", (sock) => {
    var buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        handleData();
    });

    // Handle commands in the buffer
    function handleData() {
        while (true) {
            // Commands are line-separated JSOn
            var i = 0;
            for (i = 0; i < buf.length && buf[i] !== 10; i++) {}
            if (i === buf.length) break;
            var msg = buf.slice(0, i);
            buf = buf.slice(i+1);

            try {
                msg = JSON.parse(msg.toString("utf8"));
            } catch (ex) {
                return sock.destroy();
            }

            if (typeof msg !== "object" || msg === null)
                return sock.destroy();

            switch (msg.c) {
                case "rec":
                    // Start a recording
                    return startRec(sock, msg);

                default:
                    return sock.destroy();
            }
        }
    }
});

// Start a recording
function startRec(sock, msg) {
    var p = cp.fork("./ennuicastr.js", {
        detached: true
    });

    p.send({c:"info",r:msg.r});

    p.on("message", (pmsg) => {
        try {
            sock.write(JSON.stringify(pmsg) + "\n");
        } catch (ex) {}
    });
}
