/*
 * Copyright (c) 2018-2020 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

/*
 * EnnuiCastr: Multi-user synchronized recording via the web
 *
 * This is the server for a single recording session.
 */

const fs = require("fs");
const http = require("http");
const https = require("https");
const ws = require("ws");

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const ogg = require("./ogg.js");
const prot = require(config.clientRepo + "/protocol.js");

// A precompiled Opus header, modified from one made by opusenc
const opusHeader = [
    Buffer.from([0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 0x01, 0x01,
        0x38, 0x01, 0x80, 0xBB, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0x4F, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73, 0x0A, 0x00,
        0x00, 0x00, 0x65, 0x6E, 0x6E, 0x75, 0x69, 0x63, 0x61, 0x73, 0x74,
        0x72])
];

// A precompiled FLAC header, modified from one made by flac
const flacHeader48k =
    Buffer.from([0x7F, 0x46, 0x4C, 0x41, 0x43, 0x01, 0x00, 0x00, 0x03, 0x66,
        0x4C, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22, 0x03, 0xC0, 0x03, 0xC0, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x0B, 0xB8, 0x01, 0x70, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00]);


// A precompiled FLAC header for 44.1k
const flacHeader44k =
    Buffer.from([0x7F, 0x46, 0x4C, 0x41, 0x43, 0x01, 0x00, 0x00, 0x03, 0x66,
        0x4C, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22, 0x03, 0x72, 0x03, 0x72, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x0A, 0xC4, 0x41, 0x70, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00]);

// FLAC tags to say we're ennuicastr
const flacTags =
    Buffer.from([0x04, 0x00, 0x00, 0x41, 0x0A, 0x00, 0x00, 0x00, 0x65, 0x6E,
        0x6E, 0x75, 0x69, 0x63, 0x61, 0x73, 0x74, 0x72]);

// Set up the EnnuiCastr server
var hss;
try {
    hss = https.createServer({
        cert: fs.readFileSync(config.cert + "/fullchain.pem", "utf8"),
        key: fs.readFileSync(config.cert + "/privkey.pem", "utf8")
    });
} catch (ex) {
    hss = http.createServer();
}
const hs = hss;

/* Our data gets written to five files:
 *   header1 and header2 are the Ogg file headers. Because of how Ogg works,
 * this has to be two files.
 *   data is the actual recorded data.
 *   users is the user information for each track, written such that you can
 * parse it as JSON if you're careful about it.
 *   info is the information on the recording, currently just the start
 * time/cutoff time.
 */
var outHeader1 = null,
    outHeader = null,
    outData = null,
    outUsers = null,
    outInfo = null;

// Metadata
var recInfo = null;
var port = null, tryPort;
var startTime = process.hrtime();
var connections = [null];
var tracks = [null];
var ipToNick = {};
var anonCt = 1;

// We need to try ports until we find one that works
function tryListenHTTPS() {
    tryPort = 36678 + ~~(Math.random()*16384);
    hs.listen(tryPort);
}

hs.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        // Try again
        tryListenHTTPS();
    } else {
        process.exit(1);
    }
});

hs.on("listening", function() {
    port = tryPort;

    if (recInfo)
        recvRecInfo(recInfo);
});

tryListenHTTPS();


// Start the websock server
const wss = new ws.Server({
    server: hs
});


// Connections to the websock
wss.on("connection", (ws, wsreq) => {
    // Make sure we're ready
    if (!recInfo || !recInfo.rid) {
        ws.close();
        return;
    }

    // ID and flags for this client. id is 0 until the user is logged in
    var id = 0, flags = 0, nick = "", track = null;

    // Set to true when this sock is dead and any lingering data should be ignored
    var dead = false;
    function die() {
        ws.close();
        dead = true;
        if (id)
            connections[id] = null;
    }

    // The first message must be login
    ws.once("message", (msg) => {
        if (dead) return;
        msg = Buffer.from(msg);
        var p = prot.parts.login;
        var pf = prot.flags;
        if (msg.length < p.length) return die();

        var cmd = msg.readUInt32LE(0);
        if (cmd !== prot.ids.login) return die();

        var mrid = msg.readUInt32LE(p.id);
        if (mrid !== recInfo.rid) return die();

        var key = msg.readUInt32LE(p.key);

        /* We need to get the flags before checking the key so we can check the
         * master key */
        flags = msg.readUInt32LE(p.flags);
        var ct = flags & pf.connectionTypeMask;
        if (ct === pf.connectionType.master) {
            if (key !== recInfo.master) return die();
        } else {
            if (key !== recInfo.key) return die();
        }

        // Acknowledge the connection
        p = prot.parts.ack;
        var ret = Buffer.alloc(p.length);
        ret.writeUInt32LE(prot.ids.ack, 0);
        ret.writeUInt32LE(prot.ids.login, p.ackd);
        ws.send(ret);

        // OK, the connection is acceptable. Now switch off its type
        switch (ct) {
            case pf.connectionType.data:
                return connData(msg);
            case pf.connectionType.ping:
                return connPing();
            case pf.connectionType.master:
                return connMaster();
            default:
                return die();
        }
    });

    // Data connection
    function connData(msg) {
        var ip = wsreq.connection.remoteAddress;

        /* This is the only kind of connection for which we care about a nick,
         * so get it */
        nick = "";
        try {
            nick = msg.toString("utf8", prot.parts.login.nick);
        } catch (ex) {}
        if (nick === "") {
            // Check if we've already cached the nick for this IP
            if (ip in ipToNick)
                nick = ipToNick[ip];
        }
        if (nick === "") {
            // Give them an anonymous name
            nick = "Anonymous " + (anonCt++);
        }
        ipToNick[ip] = nick;

        // Now check for the type
        if ((flags & prot.flags.dataTypeMask) === prot.flags.dataType.flac) {
            if (recInfo.format !== "flac") return die();

            // With a FLAC connection, we need info first
            ws.once("message", flacInfoMsg);
            return;
        }

        // It's an Opus connection
        acceptConnData("opus", 48000);
    }

    // Expect the FLAC info message
    function flacInfoMsg(msg) {
        if (dead) return;
        msg = Buffer.from(msg);

        var p = prot.parts.info;
        if (msg.length < p.length) return die();

        var cmd = msg.readUInt32LE(0);
        if (cmd !== prot.ids.info) return die();

        var key = msg.readUInt32LE(p.key);
        if (cmd !== prot.info.sampleRate) return die();

        var value = msg.readUInt32LE(p.value);

        // Finally ready to accept
        acceptConnData("flac", (value===44100)?44100:48000);
    }

    // Accept a data connection
    function acceptConnData(format, sampleRate) {
        // Look for an existing, matching track
        for (var i = 1; i < tracks.length; i++) {
            var maybe = tracks[i];
            if (maybe.nick === nick &&
                maybe.format === format &&
                maybe.sampleRate === sampleRate &&
                !connections[i]) {
                // Found one!
                id = i;
                connections[id] = ws;
                track = tracks[id];
                break;
            }
        }

        // Or make one if we need to
        if (!id) {
            id = tracks.length;
            track = {nick, format, sampleRate, packetNo: 0};
            tracks.push(track);
            connections.push(ws);
            outUsers.write(JSON.stringify(track) + ",\n");

            // Write out the headers for this user
            var headers;
            if (format === "flac") {
                if (sampleRate === 44100)
                    headers = [flacHeader48k, flacTags];
                else
                    headers = [flacHeader44k, flacTags];
            } else {
                headers = opusHeader;
            }
            outHeader1.write(0, id, track.packetNo++, headers[0], ogg.BOS);
            outHeader2.write(0, id, track.packetNo++, headers[1]);
        }

        // Now this connection is totally ready
        ws.on("message", dataMsg);
    }

    // Normal incoming data message
    function dataMsg(msg) {
        if (dead) return;
        msg = Buffer.from(msg); // Just in case
        if (msg.length < 4) return die();
        var cmd = msg.readUInt32LE(0);
        var ret;

        switch (cmd) {
            case prot.ids.data:
                var p = prot.parts.data;
                if (msg.length < p.length)
                    return die();

                var granulePos = msg.readUIntLE(p.granulePos, 6);
                var chunk = msg.slice(p.length);
                outData.write(granulePos, id, track.packetNo++, chunk);
                break;

            case prot.ids.rtc:
                var p = prot.parts.rtc;
                if (msg.length < p.length)
                    return die();

                var target = msg.readUInt32LE(p.peer);
                if (!connections[target])
                    break; // Just drop it

                // Relay it to the target, with the source
                msg.writeUInt32LE(id, p.peer);
                connections[target].send(msg);
                break;

            default:
                return die();
        }
    }

    // Ping connection
    function connPing() {
        ws.on("message", pingMsg);
    }

    function pingMsg(msg) {
        if (dead) return;
        msg = Buffer.from(msg); // Just in case
        if (msg.length < 4) return die();
        var cmd = msg.readUInt32LE(0);
        var ret;

        switch (cmd) {
            case prot.ids.ping:
                var p = prot.parts.ping;
                if (msg.length !== p.length)
                    return die();

                var op = prot.parts.pong;
                ret = Buffer.alloc(op.length);
                ret.writeUInt32LE(prot.ids.pong, 0);
                msg.copy(ret, op.clientTime, p.clientTime);
                var tm = process.hrtime(startTime);
                ret.writeDoubleLE(tm[0]*1000 + (tm[1]/1000000), op.serverTime);
                ws.send(ret);
                break;

            default:
                return die();
        }
    }

    // Master connection (currently unsupported)
    function connMaster() {
        return die();
    }

    ws.on("close", () => {
        if (dead) return;
        die();
    });
});

// Data from the server
process.on("message", (msg) => {
    if (msg.c === "info")
        recvRecInfo(msg.r);
});

// Once we get the recording info, we can start
async function recvRecInfo(r) {
    recInfo = r;
    if (!port)
        return; // wait until we have all our info

    r.port = port;

    // Make the recording key and master key
    r.key = ~~(Math.random()*2000000000);
    r.master = ~~(Math.random()*2000000000);

    // Make a recording ID
    var rid;
    while (true) {
        try {
            rid = ~~(Math.random()*2000000000);
            await db.runP("INSERT INTO recordings " +
                          "( uid,  rid,  port,  name,  format,  continuous," +
                          "  rtc,  key,  master," +
                          "  status,  init,  expiry,  tracks,  cost) VALUES " +
                          "(@UID, @RID, @PORT, @NAME, @FORMAT, @CONTINUOUS," +
                          " @RTC, @KEY, @MASTER," +
                          " 0, datetime('now'), datetime('now', '1 month'), 0, 0);", {
                "@UID": r.uid,
                "@RID": rid,
                "@PORT": port,
                "@NAME": r.name,
                "@FORMAT": r.format,
                "@CONTINUOUS": r.continuous,
                "@RTC": r.rtc,
                "@KEY": r.key,
                "@MASTER": r.master
            });
            break;

        } catch (ex) {}
    }

    // Open all the output files
    function s(footer) {
        return fs.createWriteStream(config.rec + "/" + rid + ".ogg." + footer);
    }
    function o(footer) {
        return new ogg.OggEncoder(s(footer));
    }
    outHeader1 = o("header1");
    outHeader2 = o("header2");
    outData = o("data");
    outUsers = s("users");
    outInfo = s("info");

    // Write out the info we have, which may be extended later
    outInfo.write(JSON.stringify(r) + ",\n");

    // Now we're ready!
    r.rid = rid;
    process.send({c: "ready", r});
}
