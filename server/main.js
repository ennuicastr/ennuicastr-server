#!/usr/bin/env node
/* The main entry point and server manager. This doesn't actually listen for
 * connections, it merely responds to requests by the web server component to
 * start recordings, responds with recording IDs, and deletes expired
 * recordings periodically. */

const cp = require("child_process");
const fs = require("fs");
const net = require("net");

const Turn = require("node-turn");

const config = require("../config.js");
const db = require("../db.js").db;

const server = net.createServer();
const sockPath = config.sock || "/tmp/ennuicastr-server.sock";

// Handle uncaught exceptions from the TURN server
process.on("uncaughtException", (ex) => {
    console.error(ex);
});

try {
    fs.unlinkSync(sockPath);
} catch (ex) {}
server.listen(sockPath);

const turnServer = new Turn({
    authMech: "long-term",
    credentials: {}
});
turnServer.start();

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
        if (pmsg.c === "ready") {
            // Enable this ID on the Turn server
            turnServer.addUser(pmsg.r.rid.toString(36), pmsg.r.key.toString(36));
            p.on("end", () => {
                turnServer.removeUser(pmsg.r.rid.toString(36));
            });
        }

        // Tell the web client
        try {
            sock.write(JSON.stringify(pmsg) + "\n");
        } catch (ex) {}
    });
}

// Periodically delete expired recordings
async function checkExpiry() {
    try {
        var expired = await db.allP("SELECT * FROM recordings WHERE expiry <= datetime('now');");
        for (var ei = 0; ei < expired.length; ei++) {
            var rec = expired[ei];

            // Delete the files
            ["header1", "header2", "data", "users", "info"].forEach((footer) => {
                try {
                    fs.unlinkSync(config.rec + "/" + rec.rid + ".ogg." + footer);
                } catch (ex) {}
            });

            // Then move the row to old_recordings
            while (true) {
                try {
                    await db.runP("BEGIN TRANSACTION;");

                    // Insert the new row
                    await db.runP("INSERT INTO old_recordings " +
                                  "( uid,  rid,  name,  init,  start,  end," +
                                  "  expiry,  tracks,  cost) VALUES " +
                                  "(@UID, @RID, @NAME, @INIT, @START, @END," +
                                  " @EXPIRY, @TRACKS, @COST);", {
                        "@UID": rec.uid,
                        "@RID": rec.rid,
                        "@NAME": rec.name,
                        "@INIT": rec.init,
                        "@START": rec.start,
                        "@END": rec.end,
                        "@EXPIRY": rec.expiry,
                        "@TRACKS": rec.tracks,
                        "@COST": rec.cost
                    });

                    // And drop the old
                    var wrid = {"@RID": rec.rid};
                    await db.runP("DELETE FROM recordings WHERE rid=@RID;", wrid);
                    await db.runP("DELETE FROM recording_share WHERE rid=@RID;", wrid);
                    await db.runP("DELETE FROM recording_share_tokens WHERE rid=@RID;", wrid);

                    await db.runP("COMMIT;");
                    break;
                } catch (ex) {
                    await db.runP("ROLLBACK;");
                }
            }
        }
    } catch (ex) {
        console.error(ex + "\n\n" + ex.stack);
    }

    // Check again in an hour
    setTimeout(checkExpiry, 1000*60*60);
}

checkExpiry();
