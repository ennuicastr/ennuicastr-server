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

/* Header indicating continuous mode (i.e., data is continuous but has VAD
 * info) */
const vadHeader =
    Buffer.from([0x45, 0x43, 0x56, 0x41, 0x44, 0x44, 0x03, 0x00, 0x00, 0x03,
        0x01]);

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

// Header indicating a meta track
const metaHeader = [
    Buffer.from([0x45, 0x43, 0x4d, 0x45, 0x54, 0x41, 0x00, 0x00]),
    Buffer.from([0x00, 0x00])
];

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

// Recording info for this recording
var recInfo = null;

// The port we're using
var port = null, tryPort;

// When the recording started (now)
var startTime = process.hrtime();

// When the recording really started (mode=rec), as a granule position
var recGranule = null;

// Current active connections, by ID
var connections = [null], masters = [null];

// All tracks, whether connected or not
var tracks = [null];

// Whether any given track was present since the last credit check
var presence = [false];

// Whether each track is speaking
var speakingStatus = [null];

// Mapping of IP addresses to nicknames
var ipToNick = {};

// Counter so we can give new "Anonymous (x)" names to anonymous users
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
    // FIXME: Document these...
    var id = 0, mid = 0, flags = 0, nick = "", track = null;
    var lastGranule = 0;

    // Set to true when this sock is dead and any lingering data should be ignored
    var dead = false;
    function die() {
        if (dead)
            return;
        ws.close();
        dead = true;
        if (id)
            connections[id] = null;
        if (mid)
            masters[mid] = null;
    }

    ws.on("error", die);
    ws.on("close", die);

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

        // Check for continuous mode
        if (flags & prot.flags.features.continuous)
            if (!recInfo.continuous) return die();

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
        if (key !== prot.info.sampleRate) return die();

        var value = msg.readUInt32LE(p.value);

        // Finally ready to accept
        acceptConnData("flac", (value===44100)?44100:48000);
    }

    // Accept a data connection
    function acceptConnData(format, sampleRate) {
        var continuous = !!(flags & prot.flags.features.continuous);

        // Look for an existing, matching track
        for (var i = 1; i < tracks.length; i++) {
            var maybe = tracks[i];
            if (maybe.nick === nick &&
                maybe.format === format &&
                maybe.sampleRate === sampleRate &&
                maybe.continuous === continuous &&
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
            track = {nick, format, sampleRate, continuous, packetNo: 0};
            tracks.push(track);
            connections.push(ws);
            presence.push(true);
            outUsers.write(",\"" + id + "\":" + JSON.stringify(track) + "\n");

            // Write out the headers for this user
            var headers;
            if (format === "flac") {
                if (sampleRate === 44100)
                    headers = [flacHeader44k, flacTags];
                else
                    headers = [flacHeader48k, flacTags];
            } else {
                headers = opusHeader.slice(0);
            }
            if (continuous)
                headers[0] = Buffer.concat([vadHeader, headers[0]]);
            outHeader1.write(0, id, track.packetNo++, headers[0], ogg.BOS);
            outHeader2.write(0, id, track.packetNo++, headers[1]);

            // Mark it in the database
            setDBTrackCount(id);
        }

        presence[id] = true;

        // Send them the current mode
        var p = prot.parts.info;
        var ret = Buffer.alloc(p.length);
        ret.writeUInt32LE(prot.ids.info, 0);
        ret.writeUInt32LE(prot.info.mode, p.key);
        ret.writeUInt32LE(recInfo.mode, p.value);
        ws.send(Buffer.from(ret));

        // Send them a list of peers
        ret.writeUInt32LE(prot.info.peerContinuing, p.key);
        var ci;
        for (ci = 1; ci < connections.length; ci++) {
            if (ci === id || !connections[ci]) continue;
            ret.writeUInt32LE(ci, p.value);
            ws.send(Buffer.from(ret));
        }

        // And send them to every peer
        ret.writeUInt32LE(prot.info.peerInitial, p.key);
        ret.writeUInt32LE(id, p.value);
        for (ci = 1; ci < connections.length; ci++) {
            if (ci === id || !connections[ci]) continue;
            connections[ci].send(Buffer.from(ret));
        }

        // Inform masters of their existence
        p = prot.parts.user;
        var nickBuf = Buffer.from(nick, "utf8");
        ret = Buffer.alloc(p.length + nickBuf.length);
        ret.writeUInt32LE(prot.ids.user, 0);
        ret.writeUInt32LE(id, p.index);
        ret.writeUInt32LE(1, p.status);
        nickBuf.copy(ret, p.nick);
        masters.forEach((master) => {
            if (master)
                master.send(ret);
        });

        // And of their nonexistence when they disconnect
        ws.on("close", () => {
            ret.writeUInt32LE(0, p.status);
            masters.forEach((master) => {
                if (master)
                    master.send(ret);
            });

            // Consider ending the recording
            if (recInfo.mode === prot.mode.rec) {
                connections[id] = null;
                id = 0;
                var empty = connections.every((el)=>el===null);
                if (empty)
                    stopRec();
            }
        });

        // Inform masters for credit rate
        informMastersCredit();

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

                // Just ignore data in the wrong mode
                if (recInfo.mode !== prot.mode.rec &&
                    recInfo.mode !== prot.mode.buffering)
                    break;

                // Get the granule position
                var granulePos = msg.readUIntLE(p.granulePos, 6);

                // Fix any weirdness
                var latestAcceptable = curGranule() + 30*48000;
                if (granulePos < lastGranule)
                    granulePos = lastGranule;
                else if (granulePos > latestAcceptable)
                    granulePos = latestAcceptable;
                lastGranule = granulePos;

                // Then write it out (FIXME: check for wonky/too much data)
                var chunk = msg.slice(p.length);
                outData.write(granulePos, id, track.packetNo++, chunk);

                // Are they actually speaking?
                var speaking = true;
                var continuous = !!(flags & prot.flags.features.continuous);
                if (continuous)
                    speaking = !!(chunk[0]);

                // Update masters
                speechStatus(id, speaking);

                // If we're buffering, keep waiting
                if (recInfo.mode === prot.mode.buffering)
                    awaitBuffering();

                break;

            case prot.ids.text:
                var p = prot.parts.text;
                if (msg.length < p.length)
                    return die();

                // Just ignore data in the wrong mode
                if (recInfo.mode !== prot.mode.rec &&
                    recInfo.mode !== prot.mode.buffering)
                    break;

                // Get out the message
                var text = "";
                try {
                    text = msg.toString("utf8", p.text);
                } catch (ex) {
                    return die();
                }

                // Sanitize it
                text = (nick + ": " + text.replace(/[\x00-\x1f\x7f]/g, "")).slice(0, 2048);

                // Record it
                recMeta({c:"text",text});

                // Relay it
                var textBuf = Buffer.from(text);
                ret = Buffer.alloc(p.length + textBuf.length);
                ret.writeUInt32LE(prot.ids.text, 0);
                ret.writeUInt32LE(0, p.reserved);
                textBuf.copy(ret, p.text);
                connections.forEach((connection) => {
                    if (!connection || connection === ws)
                        return;
                    connection.send(ret);
                });
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
                ret.writeDoubleLE(curTime(), op.serverTime);
                ws.send(ret);
                break;

            default:
                return die();
        }
    }

    // Master connection
    function connMaster() {
        // Give ourself a master "ID"
        for (mid = 1; mid < masters.length; mid++) {
            if (!masters[mid])
                break;
        }
        if (mid === masters.length)
            masters.push(null);
        masters[mid] = ws;

        // Inform them of the credit cost
        var p = prot.parts.info;
        var ret = Buffer.alloc(p.length + 4);
        ret.writeUInt32LE(prot.ids.info, 0);
        ret.writeUInt32LE(prot.info.creditCost, p.key);
        ret.writeUInt32LE(config.creditCost.currency, p.value);
        ret.writeUInt32LE(config.creditCost.credits, p.value + 4);
        ws.send(ret);

        /* Inform them of the credit situation (FIXME: Needlessly informs all
         * masters) */
        informMastersCredit();

        // Inform them of currently connected users
        p = prot.parts.user;
        for (var i = 1; i < tracks.length; i++) {
            var track = tracks[i];
            if (!track) continue;
            var nickBuf = Buffer.from(track.nick, "utf8");
            var ret = Buffer.alloc(p.length + nickBuf.length);
            ret.writeUInt32LE(prot.ids.user, 0);
            ret.writeUInt32LE(i, p.index);
            ret.writeUInt32LE((connections[i])?1:0, p.status);
            nickBuf.copy(ret, p.nick);
            ws.send(ret);
        }

        // And prepare for messages
        ws.on("message", masterMsg);
    }

    // No actual master messages are supported
    function masterMsg(msg) {
        if (dead) return;
        msg = Buffer.from(msg); // Just in case
        if (msg.length < 4) return die();
        var cmd = msg.readUInt32LE(0);
        var ret;

        switch (cmd) {
            case prot.ids.mode:
                var p = prot.parts.mode;
                if (msg.length !== p.length)
                    return die();
                var toMode = msg.readUInt32LE(p.mode);

                if (toMode === recInfo.mode) {
                    // Nothing to do
                } else if (toMode > recInfo.mode &&
                           (toMode === prot.mode.rec ||
                            toMode === prot.mode.finished)) {
                    // Delegate to specialized functions for starting or stopping
                    if (toMode === prot.mode.rec)
                        startRec();
                    else if (toMode === prot.mode.finished)
                        endRec();

                } else {
                    // Invalid mode change!
                    return die();
                }
                break;

            default:
                return die();
        }
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

// Record to the metadata track
function recMeta(data) {
    try {
        data = Buffer.from(JSON.stringify(data));
    } catch (ex) {
        return; // !!!
    }

    var track = tracks[0];
    if (!track) {
        // We haven't started a metadata track yet
        track = tracks[0] = {packetNo: 0};
        outHeader1.write(0, 0, track.packetNo++, metaHeader[0], ogg.BOS);
        outHeader2.write(0, 0, track.packetNo++, metaHeader[1]);
    }

    // Write this data
    outData.write(curGranule(), 0, track.packetNo++, data);
}

// Once we get the recording info, we can start
async function recvRecInfo(r) {
    recInfo = r;
    if (!port)
        return; // wait until we have all our info

    r.port = port;

    // Our mode (status) always starts as init
    r.mode = prot.mode.init;

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
                          "  status,  init,  expiry,  tracks,  cost, purchased) VALUES " +
                          "(@UID, @RID, @PORT, @NAME, @FORMAT, @CONTINUOUS," +
                          " @RTC, @KEY, @MASTER," +
                          " 0, datetime('now'), datetime('now', '1 month'), 0, 0, '');", {
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

    // Write out the recording info
    outInfo.write(JSON.stringify(r));
    outUsers.write("\"0\":{}\n");

    // And log it
    log("recording-init", JSON.stringify(r), {uid: r.uid, rid});

    // Now we're ready!
    r.rid = rid;
    process.send({c: "ready", r});
}

// They have an hour to start recording
setTimeout(function() {
    if (!recInfo || recInfo.mode === prot.mode.init)
        process.exit(1);
}, 1000*60*60);

// Current time in ms from start time
function curTime() {
    var tm = process.hrtime(startTime);
    return tm[0]*1000 + (tm[1]/1000000);
}

// Current time in granule pos
function curGranule() {
    return Math.round(curTime() * 48);
}

// General mode-update. Updates recInfo.mode and informs clients
function modeUpdate(toMode) {
    if (recInfo.mode === toMode)
        return;

    recInfo.mode = toMode
    var op = prot.parts.info;
    var ret = Buffer.alloc(op.length);
    ret.writeUInt32LE(prot.ids.info, 0);
    ret.writeUInt32LE(prot.info.mode, op.key);
    ret.writeUInt32LE(toMode, op.value);

    connections.forEach((connection) => {
        if (connection)
            connection.send(ret);
    });
}

// Start recording
async function startRec() {
    // Update the mode
    recGranule = curGranule();
    modeUpdate(prot.mode.rec);

    // First update the status in the database
    while (true) {
        try {
            await db.runP("UPDATE recordings SET status=@MODE, start=datetime('now') WHERE rid=@RID;", {
                "@MODE": prot.mode.rec,
                "@RID": recInfo.rid
            });
            break;
        } catch (ex) {}
    }

    // Start crediting
    setTimeout(chargeCredits, 1000*60);

    // And log it
    log("recording-start", JSON.stringify(recInfo), {uid: recInfo.uid, rid: recInfo.rid});
}

/* End the recording. This is distinct from stopRec, because it still has to
 * wait for buffers. */
function endRec() {
    modeUpdate(prot.mode.buffering);

    // No update to the database, as we're still recording

    // Start our buffering timer
    awaitBuffering();
}

// Await buffer clearout
var awaitBufferingTimeout = null;
function awaitBuffering() {
    if (awaitBufferingTimeout)
        clearTimeout(awaitBufferingTimeout);
    awaitBufferingTimeout = setTimeout(() => {
        awaitBufferingTimeout = null;
        stopRec();
    }, 10000);
}

// Stop recording
async function stopRec() {
    modeUpdate(prot.mode.finished);

    // First update the status in the database
    while (true) {
        try {
            await db.runP("UPDATE recordings SET status=@MODE, end=datetime('now') WHERE rid=@RID;", {
                    "@MODE": prot.mode.finished,
                    "@RID": recInfo.rid
                    });
            break;
        } catch (ex) {}
    }

    // Give them two minutes, then shut it all down
    setTimeout(function() {
        connections.forEach((connection) => {
            if (connection)
                connection.close();
        });
        wss.close();
        hs.close();

        outHeader1.end();
        outHeader2.end();
        outData.end();
        outUsers.end();
        outInfo.end();
    }, 1000*60*2);

    /* Force the actual process exit after 5 minutes (timeouts and such will
     * keep it alive) */
    setTimeout(function() {
        process.exit(0);
    }, 1000*60*5);

    // And log it
    log("recording-end", JSON.stringify(recInfo), {uid: recInfo.uid, rid: recInfo.rid});
}

// Calculate the credit rate currently in use
function calculateCredits(reset) {
    // Count the number of HQ and RQ clients
    var rq = 0, hq = 0, charge = 0;
    for (var i = 1; i < connections.length; i++) {
        if (!presence[i] && !connections[i]) continue;
        if (reset && !connections[i]) presence[i] = false; // Don't count them next time
        var track = tracks[i];
        if (!track) continue;
        if (track.format === "flac" || track.continuous)
            hq++;
        else
            rq++;
    }

    // Calculate the base charge
    if (hq) {
        charge = config.recCost.hq.upton;

        if (hq < config.recCost.hq.n) {
            // Move in some of the rq too
            var ex = config.recCost.hq.n - hq;
            hq = 0;
            rq = Math.max(rq - ex, 0);

        } else {
            hq -= config.recCost.hq.n;

        }

    } else if (rq) {
        charge = config.recCost.basic.upton;
        rq = Math.max(rq - config.recCost.basic.n, 0);

    }

    // Add the >n charge
    charge += hq * config.recCost.hq.plus +
              rq * config.recCost.basic.plus;

    return charge;
}

// Inform masters of the credit rate
async function informMastersCredit(charge) {
    // Get the total for the recording so far
    var row = await db.getP("SELECT cost FROM recordings WHERE rid=@RID;", {"@RID": recInfo.rid});
    var cost = (row?row.cost:0);

    // Determine the charge rate
    if (typeof charge === "undefined")
        charge = calculateCredits();

    // Make the informational command
    var op = prot.parts.info;
    var ret = Buffer.alloc(op.length + 4);
    ret.writeUInt32LE(prot.ids.info, 0);
    ret.writeUInt32LE(prot.info.creditRate, op.key);
    ret.writeUInt32LE(cost, op.value);
    ret.writeUInt32LE(charge, op.value + 4);
    masters.forEach((master) => {
        if (!master)
            return;
        master.send(ret);
    });
}

// Apply credits for a minute
async function chargeCredits() {
    // Calculate the credit charge
    var charge = calculateCredits(true);

    // Add to the cost
    while (true) {
        try {
            await db.runP("UPDATE recordings SET cost=cost+@CHARGE WHERE rid=@RID;", {
                "@RID": recInfo.rid,
                "@CHARGE": charge
            });
            break;
        } catch (ex) {}
    }

    // Inform masters
    informMastersCredit(charge);

    // Do another round
    if (recInfo.mode === prot.mode.rec)
        setTimeout(chargeCredits, 1000*60);
}

// Update on a speaking status change
function speechStatus(id, speaking) {
    if (speaking && speakingStatus[id]) {
        // Just bump it
        clearTimeout(speakingStatus[id]);
        speakingStatus[id] = setTimeout(() => {
            speechStatus(id, false);
        }, 1000);
        return;

    } else if (!speaking && !speakingStatus[id]) {
        // No change
        return;

    }

    // Change to status, so send the packet
    var p = prot.parts.speech;
    var ret = Buffer.alloc(p.length);
    ret.writeUInt32LE(prot.ids.speech, 0);
    ret.writeUInt32LE((id<<1) + (speaking?1:0), p.indexStatus);
    masters.forEach((master) => {
        if (master)
            master.send(ret);
    });

    if (speaking) {
        // Set a timeout to undo it
        speakingStatus[id] = setTimeout(() => {
            speechStatus(id, false);
        }, 1000);

    } else {
        clearTimeout(speakingStatus[id]);
        speakingStatus[id] = null;

    }
}

// Update the track count in the database
async function setDBTrackCount(to) {
    while (true) {
        try {
            await db.runP("UPDATE recordings SET tracks=max(tracks, @TO) WHERE rid=@RID;", {
                "@RID": recInfo.rid,
                "@TO": to
            });
            break;
        } catch (ex) {}
    }
}
