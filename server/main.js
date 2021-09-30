#!/usr/bin/env node
/* The main entry point and server manager. This doesn't actually listen for
 * connections, it merely responds to requests by the web server component to
 * start recordings, responds with recording IDs, and deletes expired
 * recordings periodically. */

const cproc = require("child_process");
const fs = require("fs");
const net = require("net");

const config = require("../config.js");
const db = require("../db.js").db;
const recM = require("../rec.js");

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
            // Commands are line-separated JSON
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
    var p = cproc.fork("./ennuicastr.js", {
        detached: true
    });

    p.send({c:"info",r:msg.r});

    p.on("message", async function(pmsg) {
        // Tell the web client
        try {
            sock.write(JSON.stringify(pmsg) + "\n");
        } catch (ex) {}
    });
}

// Periodically delete expired recordings
async function checkExpiry() {
    try {
        let expired = await db.allP("SELECT * FROM recordings WHERE expiry <= datetime('now');");
        for (let ei = 0; ei < expired.length; ei++) {
            let rec = expired[ei];
            await recM.del(rec.rid, rec.uid);
        }
    } catch (ex) {
        console.error(ex + "\n\n" + ex.stack);
    }

    // Check again in an hour
    setTimeout(checkExpiry, 1000*60*60);
}

checkExpiry();
