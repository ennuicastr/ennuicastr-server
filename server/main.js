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

// Current sockets listening for lobby updates
var lobbyListeners = {};

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

                case "lobby-listen":
                    // Listen for lobby updates
                    return lobbyListen(sock);

                case "lobby-update":
                    // Send a lobby update
                    return lobbyUpdate(sock, msg);

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
        if (pmsg.c === "ready") {
            // If they wanted a lobby, associate it
            if (msg.r.lid) {
                await db.runP("UPDATE lobbies SET associated=TRUE, rid=@RID WHERE uid=@UID AND lid=@LID;", {
                    "@RID": pmsg.r.rid,
                    "@UID": msg.r.uid,
                    "@LID": msg.r.lid
                });
                lobbyUpdate(null, {c: "lobby-update", l: msg.r.lid});

                // And dissociate it when done
                p.on("end", () => {
                    db.runP("UPDATE lobbies SET associated=FALSE, rid=0 WHERE uid=@UID AND lid=@LID AND rid=@RID;", {
                        "@UID": msg.r.uid,
                        "@LID": msg.r.lid,
                        "@RID": pmsg.r.rid
                    });
                });
            }
        }

        // Tell the web client
        try {
            sock.write(JSON.stringify(pmsg) + "\n");
        } catch (ex) {}
    });
}

// Listen for lobby updates
function lobbyListen(sock) {
    var id;
    do {
        id = Math.random();
        if (!(id in lobbyListeners)) {
            lobbyListeners[id] = sock;
            break;
        }
    } while (true);

    // Stop listening when it disconnects
    sock.on("close", () => {
        delete lobbyListeners[id];
    });
    sock.on("error", () => {
        delete lobbyListeners[id];
    });

    // And ack
    try {
        sock.write(JSON.stringify({c: "lobby-listen-ack"}) + "\n");
    } catch (ex) {}
}

// Send a lobby update
function lobbyUpdate(sock, msg) {
    msg = JSON.stringify(msg) + "\n";
    for (var id in lobbyListeners) {
        try {
            lobbyListeners[id].write(msg);
        } catch (ex) {}
    }

    // And ack
    if (sock) {
        try {
            sock.write(JSON.stringify({c: "lobby-update-ack"}) + "\n");
        } catch (ex) {}
    }
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
