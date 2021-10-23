<?JS
/*
 * Copyright (c) 2020, 2021 Yahweasel
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

/* FIXME: There's a lot of duplication between this file, dl/index.jss, and to
 * a lesser degree, the downloader ws.js. Some of this should be integrated in
 * rec.js */

function error(msg) {
    writeHead(500, {"content-type": "application/json"});
    write(JSON.stringify({error: msg}));
}

if (!request.query.i || !request.query.k)
    return error("Invalid query");

const rid = Number.parseInt(request.query.i, 36);
const key = Number.parseInt(request.query.k, 36);

const cproc = require("child_process");
const fs = require("fs");

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;

const recInfo = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
if (!recInfo || recInfo.wskey !== key)
    return error("Invalid ID or key");

if (!recInfo.purchased)
    return error("Only purchased recordings may use this utility");

// Give plenty of time
response.setTimeLimit(1000*60*60*3);

// Handler for raw parts
async function sendPart(part, writer) {
    await new Promise(function(res, rej) {
        var st = fs.createReadStream(config.rec + "/" + rid + ".ogg." + part);
        st.on("data", writer);
        st.on("end", res);
    });
}

writeHead(200, {"content-type": "application/json"});

if (request.query.f === "vosk" && request.query.t) {
    // Give the Vosk transcript for a track
    const track = +request.query.t;
    const base = config.rec + "/" + rid + ".ogg.";
    let input = "cat " +
        base + "header1 " +
        base + "header2 " +
        base + "data | " +
        config.repo + "/cook/oggmeta";
    try {
        fs.accessSync(base + "captions");
        input = "cat " + base + "captions";
    } catch (ex) {}

    // Get the input
    const inpProc = cproc.spawn("/bin/sh", [
        "-c", input
    ], {stdio: ["ignore", "pipe", "ignore"]});

    // Voskify it
    const voskProc = cproc.spawn(config.repo + "/cook/vtt.js", ["-v", ""+track], {
        stdio: ["pipe", "pipe", "ignore"]
    });
    inpProc.stdout.pipe(voskProc.stdin);

    // And output it
    voskProc.stdout.on("data", write);
    await new Promise(res => voskProc.stdout.on("end", res));

} else {
    // Output info
    let info = {};
    try {
        info = JSON.parse(fs.readFileSync(config.rec + "/" + rid + ".ogg.info"));
    } catch (ex) {}

    write("{\"info\":{\"transcription\":" +
        (!!info.transcription) +
        "},\"tracks\":{\n");
    await sendPart("users", write);
    write("},\"sfx\":");

    await new Promise((res, rej) => {
        let p = cproc.spawn(config.repo + "/cook/sfx-partwise.sh",
            [config.rec, ""+rid],
            {
            stdio: ["ignore", "pipe", "ignore"]
        });
        p.stdout.on("data", write);
        p.stdout.on("end", res);
    });

    write("}\n");

}
?>
