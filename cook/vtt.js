#!/usr/bin/env node
/*
 * Copyright (c) 2020-2021 Yahweasel
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

const fs = require("fs");

let users = null;
let trackNo = -1;
let transcriptOnly = false;
for (let ai = 2; ai < process.argv.length; ai++) {
    const arg = process.argv[ai];
    if (arg === "-u") {
        users = process.argv[++ai];
    } else if (arg === "-t") {
        transcriptOnly = true;
    } else if (arg[0] === "-") {
        console.error("Unrecognized argument " + arg);
        process.exit(1);
    } else {
        trackNo = ~~arg;
    }
}

// Get the users file
if (users)
    users = JSON.parse("{" + fs.readFileSync(users, "utf8") + "}");

// Convert a time to a VTT-style timestamp
function toStamp(time) {
    if (time < 0) time = 0;
    let h = Math.floor(time / 3600);
    time -= h * 3600;
    let m = Math.floor(time / 60);
    time -= m * 60;
    return (
        (h ? h.toString().padStart(2, "0") + ":" : "") +
        m.toString().padStart(2, "0") + ":" +
        ((time < 10) ? "0" : "") +
        time.toFixed(3)
    );
}

(async function() {
    // Get the metadata
    let meta = "";

    process.stdin.on("data", (chunk) => {
        meta = meta + chunk.toString();
    });

    await new Promise(res => {
        process.stdin.on("end", res);
    });

    meta = meta.trim().split("\n");

    if (!transcriptOnly)
        process.stdout.write("WEBVTT\n\nNOTE This file generated by Ennuicastr.\n\n");

    // Parse them all and sort out their times
    let meta2 = [];
    for (let line of meta) {
        line = JSON.parse(line);
        const data = line.d;
        if (data.c !== "caption")
            continue;

        // Only include captions we care about
        if (trackNo >= 0 && data.id !== trackNo)
            continue;

        // Adjust the times
        const offset = line.o / 48;
        for (const word of data.caption) {
            word.start = (word.start - offset) / 1000;
            word.end = (word.end - offset) / 1000;
        }

        meta2.push(line);
    }

    // Sort them by start time
    meta = meta2.sort((l, r) => {
        return l.d.caption[0].start - r.d.caption[0].start;
    });

    // If we're doing text only, combine them
    if (transcriptOnly) {
        for (let si = 0; si < meta.length; si++) {
            const line = meta[si];
            for (ei = si + 1; ei < meta.length; ei++) {
                const eline = meta[ei];
                if (eline.d.id !== line.d.id)
                    break;
            }
            ei--;
            while (ei > si) {
                line.d.caption = line.d.caption.concat(meta[si+1].d.caption);
                meta.splice(si + 1, 1);
                ei--;
            }
        }
    }

    // Go through it
    for (let line of meta) {
        const data = line.d;
        const caption = data.caption;

        // Header
        if (!transcriptOnly) {
            process.stdout.write(
                toStamp(caption[0].start) +
                " --> " +
                toStamp(caption[caption.length-1].end + 3) +
                "\n<c>");
        }

        // Name
        if (trackNo < 0) {
            try {
                process.stdout.write(users[data.id].nick + ": ");
            } catch (ex) {}
        }

        // And body
        for (let i = 0; i < caption.length; i++) {
            const word = caption[i];
            if (i !== 0) {
                process.stdout.write(" ");
                if (!transcriptOnly)
                    process.stdout.write("</c><" + toStamp(word.start) + "><c>");
            }
            process.stdout.write(word.word);
        }
        if (transcriptOnly)
            process.stdout.write("\r\n\r\n");
        else
            process.stdout.write("</c>\n\n");
    }
})();
