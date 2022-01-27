<?JS
/*
 * Copyright (c) 2020-2022 Yahweasel
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

const config = require("../config.js");
const db = require("../db.js").db;
const id36 = require("../id36.js");
const recM = require("../rec.js");

function fail(msg) {
    writeHead(500, {"content-type": "application/json"});
    if (msg) write(JSON.stringify(msg));
}

if (typeof request.body !== "object" ||
    request.body === null)
    return fail();

// Get the request into the correct format
let rec = request.body;
if (typeof rec.n !== "string" ||
    typeof rec.m !== "string" ||
    typeof rec.f !== "string")
    return fail();

let dname = rec.m.slice(0, config.limits.recUsernameLength);
let persist = !!rec.persist;
rec = {
    uid,
    name: rec.n.slice(0, config.limits.recNameLength),
    hostname: dname,
    format: (rec.f==="flac")?"flac":"opus",
    continuous: !!rec.c,
    rtc: !!rec.r,
    recordOnly: !!rec.x,
    videoRec: !!rec.v,
    rtennuiAudio: !!rec.xra,
    transcription: !!rec.t,
    universalMonitor: !!rec.r
};

// Add these defaults to the database
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        await db.runP("DELETE FROM defaults WHERE uid=@UID;", {"@UID": uid});
        await db.runP("INSERT INTO defaults " +
                      "( uid,  name,  dname,  format,  continuous,  rtc,  recordOnly,  videoRec,  rtennuiAudio, transcription,  universal_monitor) VALUES " +
                      "(@UID, @NAME, @DNAME, @FORMAT, @CONTINUOUS, @RTC, @RECORDONLY, @VIDEOREC, @RTENNUIAUDIO, @TRANSCRIPTION, @UNIVERSAL_MONITOR);", {
            "@UID": uid,
            "@NAME": rec.name,
            "@DNAME": dname,
            "@FORMAT": rec.format,
            "@CONTINUOUS": rec.continuous,
            "@RTC": rec.rtc,
            "@RECORDONLY": rec.recordOnly,
            "@VIDEOREC": rec.videoRec,
            "@RTENNUIAUDIO": rec.rtennuiAudio,
            "@TRANSCRIPTION": rec.transcription,
            "@UNIVERSAL_MONITOR": rec.universalMonitor
        });

        await db.runP("COMMIT;");
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");

    }
}

// If we're creating a persistent link, create it
let lid;
if (persist) {
    let lkey = id36.genInt();
    let lmaster = id36.genInt();
    while (true) {
        try {
            lid = id36.genInt();
            await db.runP("INSERT INTO lobbies2 " +
                          "( uid,  lid,  name,  key,  master,  config,  rid," +
                          " lock)" +
                          " VALUES " +
                          "(@UID, @LID, @NAME, @KEY, @MASTER, @CONFIG, -1," +
                          " datetime('now', '-1 day'));", {
                "@UID": uid,
                "@LID": lid,
                "@NAME": rec.name,
                "@KEY": lkey,
                "@MASTER": lmaster,
                "@CONFIG": JSON.stringify(rec)
            });
            break;

        } catch (ex) {}
    }
}

// Create the recording
rec = await recM.rec(rec, persist ? {lid} : {});

if (typeof rec === "string")
    return fail({error: rec});

// Now it's ready
writeHead(200, {"content-type": "application/json"});
write(JSON.stringify(rec));
?>
