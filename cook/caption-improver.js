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

const net = require("net");
const fs = require("fs");

let sock = net.createConnection("/tmp/ennuicastr-fastpunct-daemon.sock");
let inp = "";
let handler = null;
sock.on("data", text => {
    inp += text.toString("utf8");
    let nl;
    while ((nl = inp.indexOf("\n")) >= 0) {
        const line = inp.slice(0, nl);
        inp = inp.slice(nl + 1);
        handler(line);
    }
});

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

    const out = [];

    // Go through it
    for (let line of meta) {
        line = JSON.parse(line);
        const data = line.d;
        if (data.c !== "caption")
            continue;
        const caption = data.caption;

        // And keep it
        out.push(line);
    }

    // Now add punctuation
    for (let si = 0; si < out.length; si++) {
        // Find a group that has no four-second gaps (arbitrarily)
        let ei;
        for (ei = si; ei < out.length - 1; ei++) {
            const curLine = out[ei].d;
            const nextLine = out[ei+1].d;
            if (nextLine.caption[0].start >= curLine.caption[curLine.caption.length-1].end + 4)
                break;
        }

        // Process it
        const raw = out.slice(si, ei+1).map(line => {
            return line.d.caption.map(word => word.word).join(" ")
        }).join(" ");
        sock.write(JSON.stringify({c: "fastpunct", i: [raw]}) + "\n");
        const proc = JSON.parse(await new Promise(res => {
            handler = res;
        })).o;

        // Then put it back into the lines
        let ci = si;
        let line = out[ci];
        let wi = 0;
        for (const word of proc[0].split(" ")) {
            line.d.caption[wi++].word = word;
            if (wi >= line.d.caption.length) {
                wi = 0;
                ci++;
                line = out[ci];
            }
        }
    }

    sock.end();

    // Output it
    const outS = fs.createWriteStream(process.argv[2] + ".tmp", "utf8");
    for (let oi = 0; oi < out.length; oi++)
        outS.write(JSON.stringify(out[oi]) + "\n");
    outS.end();
    await new Promise(res => {
        outS.on("finish", res);
    });
    fs.renameSync(process.argv[2] + ".tmp", process.argv[2]);
})();
