<?JS
/*
 * Copyright (c) 2020 Yahweasel
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

const uid = await include("../uid.jss");
if (!uid) return;

const net = require("net");
const config = require("../config.js");
const db = require("../db.js").db;

function fail(msg) {
    writeHead(500, {"content-type": "application/json"});
    if (msg) write(JSON.stringify(msg));
}

if (typeof request.body !== "object" ||
    request.body === null)
    return fail();

// Check that this user isn't over the simultaneous recording limit (note: 0x30 == finished)
var recordings = await db.allP("SELECT rid FROM recordings WHERE uid=@UID AND status<0x30;", {"@UID": uid});
if (recordings.length >= config.limits.simultaneous)
    return fail({"error": "You may not have more than " + config.limits.simultaneous + " simultaneous recordings."});

// Get the request into the correct format
var rec = request.body;
if (typeof rec.n !== "string" ||
    typeof rec.m !== "string" ||
    typeof rec.f !== "string")
    return fail();

var dname = rec.m;
rec = {
    uid,
    name: rec.n,
    hostname: dname,
    format: (rec.f==="flac")?"flac":"opus",
    continuous: !!rec.c,
    rtc: !!rec.r,
    universalMonitor: !!rec.um
};

// Add these defaults to the database
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        await db.runP("DELETE FROM defaults WHERE uid=@UID;", {"@UID": uid});
        await db.runP("INSERT INTO defaults " +
                      "( uid,  name,  dname,  format,  continuous,  rtc,  universal_monitor) VALUES " +
                      "(@UID, @NAME, @DNAME, @FORMAT, @CONTINUOUS, @RTC, @UNIVERSAL_MONITOR);", {
            "@UID": uid,
            "@NAME": rec.name,
            "@DNAME": dname,
            "@FORMAT": rec.format,
            "@CONTINUOUS": rec.continuous,
            "@RTC": rec.rtc,
            "@UNIVERSAL_MONITOR": rec.universalMonitor
        });

        await db.runP("COMMIT;");
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");

    }
}

var resolve;
var p = new Promise(function(r) {
    resolve = r;
});

// Connect to the server socket
var sock = net.createConnection(config.sock);
sock.write(JSON.stringify({c: "rec", r: rec}) + "\n");

// And wait for the recording to start
var buf = Buffer.alloc(0);
sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    var i;
    for (i = 0; i < buf.length && buf[i] !== 10; i++) {}
    if (i === buf.length) return;
    var msg = buf.slice(0, i);
    buf = buf.slice(i+1);

    try {
        msg = JSON.parse(msg.toString("utf8"));
    } catch (ex) {
        return fail();
    }

    if (msg.c === "ready") {
        // Ready!
        resolve(msg.r);
    }
});

rec = await p;

// Now it's ready
writeHead(200, {"content-type": "application/json"});
write(JSON.stringify(rec));
?>
