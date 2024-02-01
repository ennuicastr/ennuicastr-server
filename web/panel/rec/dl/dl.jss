<?JS!
/*
 * Copyright (c) 2020-2024 Yahweasel
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

const config = require("../config.js");

const cproc = require("child_process");
const fs = require("fs");

const {rid, recInfo, uriName, safeName} = arguments[1];

if (!request.query.s && !recInfo.purchased) {
    // Trying to do a full download of an un-purchased recording
    writeHead(402);
    write("You must purchase this recording before downloading a non-sample version.");
    return;
}

// No need for compression, as the download is already compressed
response.compress(null);

var format = "flac", container = "zip", mext = "flac", ext = "zip",
    mime = "application/zip", thru = null;
switch (request.query.f) {
    case "aup":
        container = "aupzip";
        mext = "aup";
        break;
    case "aac":
        format = mext = "aac";
        break;
    case "opus":
        format = mext = "opus";
        break;
    case "vorbis":
        format = "vorbis";
        mext = "ogg";
        break;
    case "wav":
        format = mext = "wav";
        break;
    case "vtt":
        format = mext = "vtt";
        break;
    case "raw":
    case "sfx":
        format = request.query.f;
        container = "ogg";
        mext = null;
        ext = "ogg";
        mime = "audio/ogg";
        if (request.query.s) {
            writeHead(402);
            write("Raw audio is only available with purchase.");
            return;
        }
        break;
    case "info":
        format = "info";
        container = "json";
        mext = null;
        ext = "json";
        mime = "application/json";
        break;
    case "infotxt":
        format = "infotxt";
        container = "txt";
        mext = null;
        ext = "txt";
        mime = "text/plain";
        break;
    case "captions":
        format = "captions";
        container = "json";
        mext = null;
        ext = "json";
        mime = "application/json";
        break;
}

// If we're doing raw audio, possibly run it thru oggcorrect
if (request.query.t) {
    let subTrack = 0;
    if (request.query.st)
        subTrack = Number.parseInt(request.query.st, 36);
    thru = [
        config.repo + "/cook/oggcorrect",
        Number.parseInt(request.query.t, 36), subTrack
    ];
}

writeHead(200, {
    "content-type": mime,
    "content-disposition": "attachment; filename=\"" + uriName + (request.query.s?"-sample":"") + (mext?"."+mext:"") + "." + ext + "\""
});

// Give plenty of time
response.setTimeLimit(1000*60*60*24);

// Handler for raw parts
async function sendPart(part, writer) {
    await new Promise(function(res, rej) {
        var st = fs.createReadStream(config.rec + "/" + rid + ".ogg." + part);
        st.on("data", writer);
        st.on("end", res);
    });
}


if (format === "raw") {
    // Set up thru if applicable
    var writer = write, p = null;
    if (thru) {
        p = cproc.spawn(thru[0], thru.slice(1), {
            stdio: ["pipe", "pipe", "ignore"]
        });
        p.stdout.on("data", write);
        writer = p.stdin.write.bind(p.stdin);
    }

    // Do the raw download
    await sendPart("header1", writer);
    await sendPart("header2", writer);
    await sendPart("data", writer);
    if (thru) {
        await sendPart("header1", writer);
        await sendPart("header2", writer);
        await sendPart("data", writer);
    }

    // Possibly wait for the thru program
    if (p) {
        await new Promise(function(res, rej) {
            p.stdin.end();
            p.stdout.on("end", res);
        });
    }

} else if (format === "sfx") {
    await new Promise((res, rej) => {
        const p = cproc.spawn(config.repo + "/cook/sfx-partwise.sh",
            [config.rec, ""+rid, ""+Number.parseInt(request.query.t, 36)],
            {
                stdio: ["ignore", "pipe", "ignore"]
            }
        );
        p.stdout.on("data", write);
        p.stdout.on("end", res);
    });

} else {
    // Jump through to the actual downloader
    await new Promise(function(resolve) {
        const args = [
            "--id", `${rid}`,
            "--rec-base", config.rec,
            "--file-name", safeName,
            "--format", format,
            "--container", container
        ];
        if (request.query.s)
            args.push("--sample");

        if (format === "vtt")
            args.push("--exclude", "audio");
        else if (format === "captions")
            args.push("--include", "captions");

        const p = cproc.spawn(config.repo + "/cook/cook2.sh", args, {
            stdio: ["ignore", "pipe", "ignore"]
        });

        p.stdout.on("data", write);
        p.stdout.on("end", resolve);
    });

}
?>
