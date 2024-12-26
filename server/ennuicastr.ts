/*
 * Copyright (c) 2018-2024 Yahweasel
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

const cproc = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const ws = require("ws");

const pauseable = require("pauseable");

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const id36 = require("../id36.js");
const ogg = require("./ogg.js");
const prot = require(config.clientRepo + "/protocol.js");
const recM = require("../rec.js");

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
    outHeader2 = null,
    outData = null,
    outUsers = null,
    outInfo = null;

// Recording info for this recording
var recInfo = null;

// The port we're using
var port = null, tryPort;

// When the recording started (now)
var startTime = process.hrtime();

// When the recording began, as in when record was clicked
var beginTime = null;

// When we last paused as a granule position and time
var lastPaused = 0;
var lastPausedT = 0;

// When we last resumed as a granule position and time
var lastResumed = 0;
var lastResumedT = 0;

// When we last paused or resumed, in recording time
var lastEventRecTime = 0;

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

// Temporary banning by IP addresses
var ipBan = {};

// Counter so we can give new "Anonymous (x)" names to anonymous users
var anonCt = 1;

// Information on available sounds
var sounds = {
    list: null,
    urls: {},
    durations: {},
    msgs: {},
    timeouts: {}
};

/* How many non-Chrome users are there? (Because non-Chrome users can't use
 * simulcast on Jitsi) */
let nonChromeCt = 0;

/* How many Safari users are there? (Because Safari + Jitsi + P2P = fail) */
let safariCt = 0;

// Allowable Jitsi features
let jitsiFeatures: any = {};

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

    var ip = wsreq.connection.remoteAddress;
    ws.ecRemoteAddress = ip;

    // Ignore it if it's banned
    if (ipBan[ip]) {
        ws.close();
        return;
    }

    // ID and flags for this client. id is 0 until the user is logged in

    /* ID for this client. 0 until login has succeeded, remains 0 for non-data
     * connections */
    let id = 0;

    /* Master "ID". Masters don't really have an ID, but having an index is
     * always nice */
    let mid = 0;

    /* The sample rate set during connection. Retained in case they change
     * their device and change it */
    let setSampleRate = 0;

    // Connection flags
    let flags = 0;

    // User's nick
    let nick = "";

    // Track metadata for this client (only if data)
    let track = null;

    // Last granule position of normal data received from this client
    let lastGranule = 0;

    // Last granule position for subtracks received from this client
    let lastSubtrackGranules: Record<number, number> = {};

    // Is this a non-Chrome user?
    let nonChrome: boolean = false;

    // Is this a Safari user?
    let safari: boolean = false;

    // Log of recent messages to prevent floods
    var floodLog = [];
    var floodLogSz = 0;

    // Make sure we pingpong
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    var interval = setInterval(() => {
        if (!ws.isAlive) {
            die();
            return;
        }
        ws.isAlive = false;
        ws.ping(()=>{});
    }, 30000);

    /* Interval for pinging the client on socks that don't regularly
     * communicate back and forth */
    let pingInterval = null;

    // Enable pinging on this sock
    function sendPings() {
        let pingMsg = Buffer.alloc(4);
        pingMsg.writeUInt32LE(prot.ids.ping, 0);
        pingInterval = setInterval(() => {
            ws.send(pingMsg);
        }, 15000);
    }

    // Set to true when this sock is dead and any lingering data should be ignored
    var dead = false;
    function die(expected?: boolean) {
        if (dead)
            return;

        if (!expected) {
            // Report this
            log("rec-die", "Unexpected disconnection of user " + id + ":\n" + new Error().stack, {uid: recInfo.uid, rid: recInfo.rid});
        }

        ws.close();
        dead = true;
        if (id)
            connections[id] = null;
        if (mid)
            masters[mid] = null;
        if (interval) {
            clearTimeout(interval);
            interval = null;
        }
        if (pingInterval) {
            clearTimeout(pingInterval);
            pingInterval = null;
        }

        // If this was a data connection, inform others of their disconnection
        if (id) {
            var p = prot.parts.info;
            let ret = Buffer.alloc(p.length);
            ret.writeUInt32LE(prot.ids.info, 0);
            ret.writeUInt32LE(prot.info.peerLost, p.key);
            ret.writeUInt32LE(id, p.value);
            for (var ci = 1; ci < connections.length; ci++) {
                if (ci === id || !connections[ci]) continue;
                connections[ci].send(Buffer.from(ret));
            }
            log("rec-part", "User " + JSON.stringify(nick) + " (" + id + ") parted", {uid: recInfo.uid, rid: recInfo.rid});
        }

        // And possibly free up non-Chrome features
        let doSignal = false;
        if (nonChrome && --nonChromeCt === 0) {
            delete jitsiFeatures.disableSimulcast;
            doSignal = true;
        }
        if (safari && --safariCt === 0) {
            delete jitsiFeatures.disableP2P;
            doSignal = true;
        }
        if (doSignal)
            signalJitsi();
    }

    ws.on("error", die);
    ws.on("close", function() { die(true); });

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

        // Extract the nick
        nick = "";
        try {
            nick = msg.toString("utf8", p.nick).slice(0, config.limits.recUsernameLength);
        } catch (ex) {}

        // Acknowledge the connection
        p = prot.parts.ack;
        let ret = Buffer.alloc(p.length);
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

        /* This is the only kind of connection for which we care about a nick,
         * so make sure it has one */
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
        var rtc = !!(flags & prot.flags.features.rtc);
        setSampleRate = sampleRate;

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

        // Don't go over the limit
        if (!id && tracks.length > config.limits.tracksPaid) {
            // FIXME: Distinct tracksFree and tracksPaid
            var p = prot.parts.nack;
            var textBuf = Buffer.from("This recording is limited to " + config.limits.tracksPaid + " tracks (users).");
            let ret = Buffer.alloc(p.length + textBuf.length);
            ret.writeUInt32LE(prot.ids.nack, 0);
            ret.writeUInt32LE(prot.ids.login, p.ackd);
            ret.writeUInt32LE(0, p.code);
            textBuf.copy(ret, p.msg);
            ws.send(ret);
            return die();
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

        log("rec-join", "User " + JSON.stringify(nick) + " (" + id + ") joined", {uid: recInfo.uid, rid: recInfo.rid});

        presence[id] = true;

        // Decide Jitsi state based on their user agent
        let ua = wsreq.headers["user-agent"] || "";
        if (ua.indexOf("Chrome") < 0) {
            let doSignal = false;

            // Non-Chrome user!
            nonChrome = true;
            if (nonChromeCt++ === 0) {
                // Need to update everyone on the Jitsi features
                jitsiFeatures.disableSimulcast = true;
                doSignal = true;
            }
            if (ua.indexOf("Safari") >= 0) {
                // Safari user!
                safari = true;
                if (safariCt++ === 0) {
                    jitsiFeatures.disableP2P = true;
                    doSignal = true;
                }
            }
            if (doSignal)
                signalJitsi();
        }

        // Send them the Jitsi state
        signalJitsi(ws);

        // Send them their own ID
        var p = prot.parts.info;
        let ret = Buffer.alloc(p.length);
        ret.writeUInt32LE(prot.ids.info, 0);
        ret.writeUInt32LE(prot.info.id, p.key);
        ret.writeUInt32LE(id, p.value);
        ws.send(Buffer.from(ret));

        // Send them the current mode
        var mode = Buffer.alloc(p.length + 16);
        mode.writeUInt32LE(prot.ids.info, 0);
        mode.writeUInt32LE(prot.info.mode, p.key);
        mode.writeUInt32LE(recInfo.mode, p.value);
        mode.writeDoubleLE(Math.max(lastPausedT, lastResumedT), p.value + 4);
        mode.writeDoubleLE(lastEventRecTime, p.value + 12);
        ws.send(Buffer.from(mode));

        // Send them the recording name
        var textBuf = Buffer.from(recInfo.name+"");
        var recNameBuf = Buffer.alloc(p.length + textBuf.length - 4);
        recNameBuf.writeUInt32LE(prot.ids.info, 0);
        recNameBuf.writeUInt32LE(prot.info.recName, p.key);
        textBuf.copy(recNameBuf, p.value);
        ws.send(recNameBuf);

        // And possibly the start time
        if (recInfo.mode >= prot.mode.rec) {
            var st = Buffer.alloc(p.length + 4);
            st.writeUInt32LE(prot.ids.info, 0);
            st.writeUInt32LE(prot.info.startTime, p.key);
            st.writeDoubleLE(beginTime, p.value);
            ws.send(st);
        }

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

        if (recInfo.universalMonitor) {
            // Inform them of currently connected users
            p = prot.parts.user;
            for (var i = 1; i < tracks.length; i++) {
                var otrack = tracks[i];
                if (id === i || !otrack || !connections[i]) continue;
                var nickBuf = Buffer.from(otrack.nick, "utf8");
                ret = Buffer.alloc(p.length + nickBuf.length);
                ret.writeUInt32LE(prot.ids.user, 0);
                ret.writeUInt32LE(i, p.index);
                ret.writeUInt32LE(1, p.status);
                nickBuf.copy(ret, p.nick);
                ws.send(ret);
            }

            // And speaking status
            p = prot.parts.speech;
            for (var i = 1; i < connections.length; i++) {
                if (!speakingStatus[i]) continue;
                ret = Buffer.alloc(p.length);
                ret.writeUInt32LE(prot.ids.speech, 0);
                ret.writeUInt32LE((i<<1)|1, p.indexStatus);
                ws.send(ret);
            }
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
        if (recInfo.universalMonitor) {
            connections.forEach((connection) => {
                if (connection)
                    connection.send(ret);
            });
        }

        // And of their nonexistence when they disconnect
        ws.on("close", () => {
            ret.writeUInt32LE(0, p.status);
            masters.forEach((master) => {
                if (master)
                    master.send(ret);
            });
            if (recInfo.universalMonitor) {
                connections.forEach((connection) => {
                    if (connection && connection !== ws)
                        connection.send(ret);
                });
            }

            // Consider ending the recording
            if (recInfo.mode === prot.mode.rec) {
                connections[id] = null;
                id = 0;
                var empty = connections.every((el)=>el===null);
                if (empty)
                    stopRec();
            }
        });

        // Give them any existing sounds
        for (let key in sounds.msgs) {
            let msg = sounds.msgs[key];
            ws.send(msg);
        }

        // Inform masters for credit rate
        informMastersCredit();

        // Now this connection is totally ready
        sendPings();
        ws.on("message", dataMsg);
    }

    // Normal incoming data message
    function dataMsg(msg) {
        if (dead) return;
        msg = Buffer.from(msg); // Just in case
        if (msg.length < 4) return die();
        var cmd = msg.readUInt32LE(0);
        let ret;

        switch (cmd) {
            case prot.ids.data:
            case prot.ids.datax:
            {
                let p = (cmd === prot.ids.datax)
                    ? prot.parts.datax
                    : prot.parts.data;
                if (msg.length < p.length)
                    return die();

                // Just ignore data in the wrong mode
                if (recInfo.mode < prot.mode.rec ||
                    recInfo.mode >= prot.mode.finished)
                    break;

                let chunk = msg.slice(p.length);

                // Handle datax
                let localTrack = track;
                let localId = id;
                let subId = 0;
                if (cmd === prot.ids.datax) {
                    localId |= 0x80000000;

                    /* Our extended data is given with the high bit set in the
                     * ID and a 32-bit value at the beginning of the data block */
                    subId = msg.readInt32LE(p.track);
                    let chunkPrefix = new Buffer(4);
                    chunkPrefix.writeInt32LE(subId);
                    chunk = Buffer.concat([chunkPrefix, chunk]);

                    // Get the sub-track for this
                    if (!track.subTracks)
                        track.subTracks = {};
                    if (!track.subTracks[subId]) {
                        recMeta({c:"subtrack", id, subId});
                        track.subTracks[subId] = {packetNo: 0};
                    }
                    localTrack = track.subTracks[subId];
                }

                // Get the granule position
                let granulePos = msg.readUIntLE(p.granulePos, 6);

                // Fix any weirdness
                let dataLastGranule = lastGranule;
                if (cmd === prot.ids.datax)
                    dataLastGranule = lastSubtrackGranules[subId] || 0;
                let latestAcceptable = curGranule() + 30*48000;
                if (granulePos < dataLastGranule)
                    granulePos = dataLastGranule;
                else if (granulePos > latestAcceptable)
                    granulePos = latestAcceptable;
                if (cmd === prot.ids.datax)
                    lastSubtrackGranules[subId] = granulePos;
                else
                    lastGranule = granulePos;

                // Check for abuse
                if (floodDetect({p: granulePos, l: chunk.length}))
                    return die();

                // Account for pauses
                if (granulePos >= lastPaused &&
                    (granulePos < lastResumed || recInfo.mode === prot.mode.paused))
                    break;

                // Then write it out
                outData.write(granulePos, localId, localTrack.packetNo++, chunk);

                // Are they actually speaking?
                let speaking = true;
                let continuous = !!(flags & prot.flags.features.continuous);
                let flac = (flags & prot.flags.dataTypeMask) === prot.flags.dataType.flac;
                if (continuous)
                    speaking = !!(chunk[0]);
                else if (flac)
                    speaking = (chunk.length >= 16);
                else
                    speaking = (chunk.length >= 8);

                // Update masters
                speechStatus(id, speaking);

                // If we're buffering, keep waiting
                if (recInfo.mode === prot.mode.buffering)
                    awaitBuffering();

                break;
            }

            case prot.ids.text:
                var p = prot.parts.text;
                if (msg.length < p.length)
                    return die();

                // Get out the message
                var text = "";
                try {
                    text = msg.toString("utf8", p.text);
                } catch (ex) {
                    return die();
                }

                // Sanitize it
                text = (nick + ": " + text.replace(/[\x00-\x1f\x7f]/g, "")).slice(0, 2048);

                // Check for abuse
                if (floodDetect({p: lastGranule, l: text.length}))
                    return die();

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

                // Don't record it if we're not in the right mode
                if (recInfo.mode !== prot.mode.rec &&
                    recInfo.mode !== prot.mode.buffering)
                    break;

                // Record it
                recMeta({c:"text",text});

                break;

            case prot.ids.caption:
            {
                const p = prot.parts.caption.cs;
                if (msg.length < p.length)
                    return die();

                // Get out the message
                let text = "";
                let caption: any;
                try {
                    text = msg.toString("utf8", p.data);
                    caption = JSON.parse(text);
                } catch (ex) {
                    return die();
                }

                // Check for abuse
                if (floodDetect({p: lastGranule, l: text.length}))
                    return die();

                // Don't record it if we're not in the right mode
                if (recInfo.mode !== prot.mode.rec &&
                    recInfo.mode !== prot.mode.buffering)
                    break;

                // Record it
                recMeta({c:"caption", id, caption});

                break;
            }

            case prot.ids.info:
            {
                // There are only two C->S pieces of info
                let p = prot.parts.info;
                if (msg.length < p.length) return die();

                let key = msg.readUInt32LE(p.key);
                let value = msg.readUInt32LE(p.value);
                switch (key) {
                    case prot.info.sampleRate:
                        // If a user changes their input device, they can send sample rate again
                        if (value !== setSampleRate) return die();
                        break;

                    case prot.info.allowAdmin:
                    case prot.info.adminState:
                    {
                        // Forward admin information to the relevant admin
                        let master = masters[value];
                        if (!master) break;
                        msg.writeUInt32LE(id, p.value);
                        master.send(msg);
                        break;
                    }

                    default:
                        return die();
                }
                break;
            }

            case prot.ids.rtc:
            {
                let p = prot.parts.rtc;
                if (msg.length < p.length)
                    return die();

                let target = msg.readUInt32LE(p.peer);
                if (!connections[target])
                    break; // Just drop it

                // Relay it to the target, with the source
                msg.writeUInt32LE(id, p.peer);
                connections[target].send(msg);
                break;
            }

            case prot.ids.ctcp:
            {
                let p = prot.parts.ctcp;
                if (msg.length < p.length)
                    return die();

                let target = msg.readUInt32LE(p.peer);
                if (!connections[target])
                    break; // Just drop it

                msg.writeUInt32LE(id, p.peer);
                connections[target].send(msg);
                break;
            }

            case prot.ids.error:
                // Error message
                var text = "";
                try {
                    text = msg.toString("utf8", 4);
                } catch (ex) {
                    return die();
                }

                // Log it
                log("client-error", text, {uid: recInfo.uid, rid: recInfo.rid});
                break;

            default:
                return die();
        }
    }

    // Log data and check for flooding
    function floodDetect(d) {
        floodLog.push(d);
        floodLogSz += d.l;

        // Remove everything older than 1 second
        var early = d.p - 48000;
        while (floodLog[0].p < early) {
            floodLogSz -= floodLog[0].l;
            floodLog.shift();
        }

        // And make sure we're not being flooded
        if (floodLogSz > 48000*256)
            return true;
        return false;
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
        let ret;

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
        let ret = Buffer.alloc(p.length + 4);
        ret.writeUInt32LE(prot.ids.info, 0);
        ret.writeUInt32LE(prot.info.creditCost, p.key);
        var neededSubscription = ((recInfo.format==="flac"||recInfo.continuous)?2:1);
        if (recInfo.subscription >= neededSubscription)
            ret.writeUInt32LE(0, p.value);
        else
            ret.writeUInt32LE(config.creditCost.currency, p.value);
        ret.writeUInt32LE(config.creditCost.credits, p.value + 4);
        ws.send(ret);

        // Inform them of the credit situation
        informMastersCredit({only: mid});

        // Inform them of currently connected users
        p = prot.parts.user;
        for (var i = 1; i < tracks.length; i++) {
            var track = tracks[i];
            if (!track) continue;
            var nickBuf = Buffer.from(track.nick, "utf8");
            let ret = Buffer.alloc(p.length + nickBuf.length);
            ret.writeUInt32LE(prot.ids.user, 0);
            ret.writeUInt32LE(i, p.index);
            ret.writeUInt32LE((connections[i])?1:0, p.status);
            nickBuf.copy(ret, p.nick);
            ws.send(ret);
        }

        // Inform them of available sounds
        Promise.all([]).then(function() {
            if (!sounds.list)
                return db.allP("SELECT * FROM sounds WHERE uid=@UID ORDER BY name ASC, sid ASC;", {"@UID": recInfo.uid});

        }).then(function(rows) {
            if (!sounds.list && rows) {
                var key = Buffer.from(recInfo.extra.assetKey, "binary");
                sounds.list = [];
                rows.forEach((row) => {
                    var encd = Buffer.from(id36.enc(row.sid, key), "binary").toString("base64");
                    var url = "sound.jss?" + recInfo.rid.toString(36) + "-" + encd;
                    sounds.urls[":" + row.sid] = url;
                    sounds.durations[":" + row.sid] = row.duration;
                    sounds.list.push({
                        i: row.sid,
                        u: url,
                        n: row.name
                    });
                });
            }

            if (sounds.list && sounds.list.length) {
                var p = prot.parts.info;
                var jsonBuf = Buffer.from(JSON.stringify(sounds.list), "utf8");
                let ret = Buffer.alloc(p.length + jsonBuf.length - 4);
                ret.writeUInt32LE(prot.ids.info, 0);
                ret.writeUInt32LE(prot.info.sounds, p.key);
                jsonBuf.copy(ret, p.value);
                ws.send(ret);
            }
        });

        // And prepare for messages
        sendPings();
        ws.on("message", masterMsg);
    }

    // No actual master messages are supported
    function masterMsg(msg) {
        if (dead) return;
        msg = Buffer.from(msg); // Just in case
        if (msg.length < 4) return die();
        var cmd = msg.readUInt32LE(0);
        let ret;

        switch (cmd) {
            case prot.ids.mode:
                var p = prot.parts.mode;
                if (msg.length !== p.length)
                    return die();
                var toMode = msg.readUInt32LE(p.mode);

                if (toMode === recInfo.mode) {
                    // Nothing to do
                } else if (toMode > recInfo.mode) {
                    // Delegate to specialized functions for starting or stopping
                    if (toMode === prot.mode.rec)
                        startRec();
                    else if (toMode === prot.mode.paused)
                        pauseRec();
                    else if (toMode === prot.mode.finished)
                        endRec();
                    else
                        return die();

                } else if (toMode === prot.mode.rec &&
                           recInfo.mode === prot.mode.paused) {
                    resumeRec();

                } else {
                    // Invalid mode change!
                    return die();
                }
                break;

            case prot.ids.sound:
            {
                var p = prot.parts.sound.cs;
                if (msg.length <= p.length)
                    return die();
                var status = !!msg.readUInt8(p.status);
                var sid = "";
                try {
                    sid = msg.toString("utf8", p.id);
                } catch (ex) {}
                var csid = ":" + sid;
                if (!(csid in sounds.urls))
                    break;
                var url = sounds.urls[csid];
                let duration = sounds.durations[csid];

                // Send the request along
                p = prot.parts.sound.sc;
                var urlBuf = Buffer.from(url, "utf8");
                let ret = Buffer.alloc(p.length + urlBuf.length);
                ret.writeUInt32LE(prot.ids.sound, 0);
                ret.writeDoubleLE(curTime(), p.time);
                ret.writeUInt8(status?1:0, p.status);
                urlBuf.copy(ret, p.url);
                connections.forEach((connection) => {
                    if (connection)
                        connection.send(ret);
                });

                // Remember it for later
                if (sounds.timeouts[csid])
                    clearTimeout(sounds.timeouts[csid]);
                if (status) {
                    sounds.msgs[csid] = ret;
                    sounds.timeouts[csid] = setTimeout(function() {
                        delete sounds.msgs[csid];
                        delete sounds.timeouts[csid];
                    }, duration * 1000);
                } else {
                    delete sounds.msgs[csid];
                    delete sounds.timeouts[csid];
                }

                // Don't record it if we're not in the right mode
                if (recInfo.mode !== prot.mode.rec &&
                    recInfo.mode !== prot.mode.buffering)
                    break;

                // Record it
                recMeta({c:"sound",sid,status:+status});
                break;
            }

            case prot.ids.admin:
                var p = prot.parts.admin;
                var acts = prot.flags.admin.actions;
                if (msg.length < p.length)
                    return die();
                var target = msg.readUInt32LE(p.target);
                if (~target === 0)
                    target = -1;
                var action = msg.readUInt32LE(p.action);

                if (action === acts.kick) {
                    // This we do ourselves!
                    target = connections[target];
                    if (target) {
                        // Set a one-minute ban so they don't instantly reconnect
                        ipBan[target.ecRemoteAddress] = true;
                        setTimeout(function() {
                            delete ipBan[target.ecRemoteAddress];
                        }, 60000);

                        // And close the connection
                        target.close();
                    }

                } else {
                    if (action === acts.request) {
                        /* They've requested admin access. Build a new message
                         * that tells the target *who* is requesting admin
                         * access. */
                        if (target < 0)
                            break;
                        var nickBuf = Buffer.from(nick || "Anonymous", "utf8");
                        msg = Buffer.alloc(p.length + nickBuf.length);
                        msg.writeUInt32LE(prot.ids.admin, 0);
                        msg.writeUInt32LE(target, p.target);
                        msg.writeUInt32LE(action, p.action);
                        nickBuf.copy(msg, p.argument);
                    }

                    // Just forward it to the affected party/ies
                    if (target < 0) {
                        connections.forEach((connection) => {
                            if (connection)
                                connection.send(msg);
                        });
                    } else {
                        msg.writeUInt32LE(mid, p.target);
                        target = connections[target];
                        if (target)
                            target.send(msg);
                    }

                }
                break;

            default:
                return die();
        }
    }

    // Signal all connections or one connection about the Jitsi state
    function signalJitsi(connection?: WebSocket) {
        let p = prot.parts.info;
        let jitsiStr = JSON.stringify(jitsiFeatures);
        while (jitsiStr.length < 4)
            jitsiStr += " ";
        let jitsiBuf = Buffer.from(jitsiStr, "utf8");
        let ret = Buffer.alloc(p.value + jitsiBuf.length);
        ret.writeUInt32LE(prot.ids.info, 0);
        ret.writeUInt32LE(prot.info.jitsi, p.key);
        jitsiBuf.copy(ret, p.value);

        if (connection) {
            connection.send(Buffer.from(ret));
        } else {
            for (let ci = 1; ci < connections.length; ci++) {
                if (!connections[ci]) continue;
                connections[ci].send(Buffer.from(ret));
            }
        }
    }

    ws.on("close", () => {
        if (dead) return;
        die();
    });
});

// Data from the server
process.on("message", (msg: any) => {
    if (msg.c === "info")
        recvRecInfo(msg.r);
});

// Record to the metadata track
function recMeta(data, opt?: any) {
    opt = opt || {};

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

    // Get the time
    opt.time = opt.time || curGranule();

    // Write this data
    outData.write(opt.time, 0, track.packetNo++, data);
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
    r.key = id36.genInt();
    r.master = id36.genInt();
    r.wskey = id36.genInt();
    if (!r.extra)
        r.extra = {};
    r.extra.assetKey = id36.genKey().toString("binary");

    // Make a recording ID
    var rid;
    while (true) {
        try {
            rid = id36.genInt();
            await db.runP("INSERT INTO recordings " +
                          "( uid,  rid,  port,  name,  format," +
                          "  continuous,  rtc,  recordOnly,  videoRec," +
                          "  transcription,  key,  master,  wskey,  extra," +
                          "  status,  init,  expiry,  tracks,  cost, purchased)" +
                          " VALUES " +
                          "(@UID, @RID, @PORT, @NAME, @FORMAT," +
                          " @CONTINUOUS, @RTC, @RECORDONLY, @VIDEOREC," +
                          " @TRANSCRIPTION, @KEY, @MASTER, @WSKEY, @EXTRA," +
                          " 0, datetime('now'), datetime('now', '1 month'), 0, 0, '');", {
                "@UID": r.uid,
                "@RID": rid,
                "@PORT": port,
                "@NAME": r.name,
                "@FORMAT": r.format,
                "@CONTINUOUS": r.continuous,
                "@RTC": r.rtc,
                "@RECORDONLY": r.recordOnly,
                "@VIDEOREC": r.videoRec,
                "@TRANSCRIPTION": r.transcription,
                "@KEY": r.key,
                "@MASTER": r.master,
                "@WSKEY": r.wskey,
                "@EXTRA": JSON.stringify(r.extra)
            });
            break;

        } catch (ex) {}
    }

    // Check the user's subscription status for pricing
    var row = await db.getP("SELECT subscription FROM credits WHERE uid=@UID;", {"@UID": r.uid});
    if (row)
        r.subscription = row.subscription;
    else
        r.subscription = 0;

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

// Quit if the recording is unused
var preRecordingInterval = setInterval(function() {
    if (!recInfo)
        process.exit(1);
    if (recInfo.mode !== prot.mode.init) {
        clearInterval(preRecordingInterval);
        return;
    }
    for (var connection of connections) {
        if (connection)
            return;
    }

    // Since we never did a recording, delete it
    clearInterval(preRecordingInterval);
    (async function() {
        console.error(await recM.del(recInfo.rid, recInfo.uid, {force: true, forget: true}));
        process.exit(1);
    })();
}, 1000*60*60);

// Current time in ms from start time
function curTime() {
    var tm = process.hrtime(startTime);
    return tm[0]*1000 + (tm[1]/1000000);
}

// Current time in granule pos
function curGranule(ct?: number) {
    return Math.round((ct || curTime()) * 48);
}

// General mode-update. Updates recInfo.mode and informs clients
function modeUpdate(toMode, time) {
    if (recInfo.mode === toMode)
        return;

    recInfo.mode = toMode;
    var op = prot.parts.info;
    let ret = Buffer.alloc(op.length + 16);
    ret.writeUInt32LE(prot.ids.info, 0);
    ret.writeUInt32LE(prot.info.mode, op.key);
    ret.writeUInt32LE(toMode, op.value);
    ret.writeDoubleLE(time, op.value + 4);
    ret.writeDoubleLE(lastEventRecTime, op.value + 12);

    connections.forEach((connection) => {
        if (connection)
            connection.send(ret);
    });
}

// Start recording
async function startRec() {
    // Update the mode
    beginTime = lastResumedT = curTime();
    lastResumed = curGranule(beginTime);
    lastEventRecTime = 0;
    modeUpdate(prot.mode.rec, beginTime);
    recMeta({c: "start"}, {time: lastResumed});

    // Tell the users the start time
    var op = prot.parts.info;
    let ret = Buffer.alloc(op.length + 4);
    ret.writeUInt32LE(prot.ids.info, 0);
    ret.writeUInt32LE(prot.info.startTime, op.key);
    ret.writeDoubleLE(beginTime, op.value);

    connections.forEach((connection) => {
        if (connection)
            connection.send(ret);
    });

    // Update the status in the database
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
    chargeCreditsTimeout = pauseable.setTimeout(chargeCreditsLoop, 1000*60);

    // And log it
    log("recording-start", JSON.stringify(recInfo), {uid: recInfo.uid, rid: recInfo.rid});
}

// Pause recording
async function pauseRec() {
    // Update the mode
    lastPausedT = curTime();
    lastPaused = curGranule(lastPausedT);
    lastEventRecTime += lastPausedT - lastResumedT;
    modeUpdate(prot.mode.paused, lastPausedT);

    // Record it in the metadata
    recMeta({c: "pause"}, {time: lastPaused});

    // Pause crediting
    if (chargeCreditsTimeout)
        chargeCreditsTimeout.pause();

    // FIXME: Limit how long you can sit around paused
}

// Resume a paused recording
async function resumeRec() {
    // Update the mode
    lastResumedT = curTime();
    lastResumed = curGranule(lastResumedT);
    modeUpdate(prot.mode.rec, lastResumedT);

    // Record it in the metadata
    recMeta({c: "resume"}, {time: lastResumed});

    // Resume crediting
    if (chargeCreditsTimeout)
        chargeCreditsTimeout.resume();
}

/* End the recording. This is distinct from stopRec, because it still has to
 * wait for buffers. */
function endRec() {
    lastPausedT = curTime();
    lastPaused = curGranule(lastPausedT);
    lastEventRecTime += lastPausedT - lastResumedT;
    modeUpdate(prot.mode.buffering, curTime());

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
    modeUpdate(prot.mode.finished, curTime());

    // Finish charging credits
    if (chargeCreditsTimeout) {
        chargeCreditsTimeout.clear();
        chargeCreditsTimeout = null;
        await chargeCredits();
    }

    // Update the status in the database
    while (true) {
        try {
            await db.runP("UPDATE recordings SET status=@MODE, end=datetime('now') WHERE rid=@RID;", {
                    "@MODE": prot.mode.finished,
                    "@RID": recInfo.rid
                    });
            break;
        } catch (ex) {}
    }

    // Shut it all down after everyone's disconnected
    var postRecordingInterval = setInterval(function() {
        for (var connection of connections) {
            if (connection)
                return;
        }

        clearInterval(postRecordingInterval);
        wss.close();
        hs.close();

        outHeader1.end();
        outHeader2.end();
        outData.end();
        outUsers.end();
        outInfo.end();

        setTimeout(function() {
            process.exit(0);
        }, 60000);
    }, 1000*60*5);

    // Log it
    log("recording-end", JSON.stringify(recInfo), {uid: recInfo.uid, rid: recInfo.rid});
}

// Calculate the credit rate currently in use
function calculateCredits(reset?: boolean) {
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
async function informMastersCredit(opts: {
    charge?: number,
    only?: number
} = {}) {
    // Get the total for the recording so far
    var row = await db.getP("SELECT cost FROM recordings WHERE rid=@RID;", {"@RID": recInfo.rid});
    var cost = (row?row.cost:0);

    // Determine the charge rate
    let charge = opts.charge;
    if (typeof charge === "undefined")
        charge = calculateCredits();

    // Make the informational command
    let op = prot.parts.info;
    let ret = Buffer.alloc(op.length + 4);
    ret.writeUInt32LE(prot.ids.info, 0);
    ret.writeUInt32LE(prot.info.creditRate, op.key);
    ret.writeUInt32LE(cost, op.value);
    ret.writeUInt32LE(charge, op.value + 4);

    // And inform them
    if (opts.only) {
        const master = masters[opts.only];
        if (master)
            master.send(ret);

    } else {
        for (const master of masters) {
            if (!master)
                return;
            master.send(ret);
        }

    }
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
    informMastersCredit({charge});
}

// Apply credits automatically every minute
var chargeCreditsTimeout = null;
async function chargeCreditsLoop() {
    if (chargeCreditsTimeout) {
        chargeCreditsTimeout.clear();
        chargeCreditsTimeout = null;
    }

    await chargeCredits();

    // Do another round
    if (recInfo.mode === prot.mode.rec ||
        recInfo.mode === prot.mode.paused) {
        chargeCreditsTimeout = pauseable.setTimeout(chargeCreditsLoop, 1000*60);
        if (recInfo.mode === prot.mode.paused)
            chargeCreditsTimeout.pause();
    }
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
    let ret = Buffer.alloc(p.length);
    ret.writeUInt32LE(prot.ids.speech, 0);
    ret.writeUInt32LE((id<<1) + (speaking?1:0), p.indexStatus);
    masters.forEach((master) => {
        if (master)
            master.send(ret);
    });

    // Update regular users if we ought
    if (recInfo.universalMonitor) {
        connections.forEach((connection) => {
            if (connection)
                connection.send(ret);
        });
    }

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
