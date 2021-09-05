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

const cproc = require("child_process");
const net = require("net");
const fs = require("fs");

const config = require("../config.js");

const outFile = process.argv[2];
const inRec = process.argv[3];
const inBase = config.rec + "/" + inRec + ".ogg.";

process.on("unhandledRejection", (reason, promise) => {
    //console.error(promise);
    console.error(reason);
    process.exit(1);
});

// General purpose synchronous(ish) data receiver for an exec command
class Syncy {
    constructor(cmd) {
        this.cmd = cmd;
        this.head = 0;
        this.buf = Buffer.alloc(0);
        this.ended = false;
    }

    async llread(count) {
        if (!this.stream)
            return null;

        while (this.buf.length < count) {
            const chunk = this.stream.read();
            if (chunk)
                this.buf = Buffer.concat([this.buf, chunk]);

            // Try to read more
            if (this.buf.length < count) {
                await new Promise(res => {
                    this.stream.once("readable", res);
                });

                const chunk = this.stream.read();
                if (chunk) {
                    this.buf = Buffer.concat([this.buf, chunk]);
                } else {
                    // End of stream!
                    this.end();
                    this.stream = null;
                    break;
                }
            }
        }

        let ret = this.buf.slice(0, count);
        this.buf = this.buf.slice(count);

        return ret;
    }

    async read(start, end) {
        // Convert to samples
        start *= 2;
        end *= 2;

        // Have we started the command?
        if (!this.proc) {
            this.proc = cproc.spawn("/bin/sh", ["-c", this.cmd], {
                stdio: ["ignore", "pipe", "ignore"]
            });
            this.stream = this.proc.stdout;
        }

        // First, get to the start
        let skip = start - this.head;
        while (skip > 0) {
            if (skip > 4096) {
                await this.llread(4096);
                this.head += 4096;
                skip -= 4096;
            } else {
                let b = await this.llread(skip);
                if (b) {
                    this.head += b.length;
                    skip = 0;
                } else break;
            }
        }

        // Now read the amount requested
        let ret = await this.llread(end - start);
        if (ret)
            this.head += ret.length;
        return ret;
    }

    end() {
        if (this.stream) {
            // Go into flowing mode
            this.stream.on("data", ()=>{});
            this.stream.on("end", ()=>{});
            this.stream.resume();
        }
    }
}

// Transcription daemon
let vosk = net.createConnection("/tmp/ennuicastr-vosk-daemon.sock");
let vinp = "";
let voskHandler = null;
vosk.on("data", text => {
    vinp += text.toString("utf8");
    let nl;
    while ((nl = vinp.indexOf("\n")) >= 0) {
        const line = vinp.slice(0, nl);
        vinp = vinp.slice(nl + 1);
        voskHandler(line);
    }
});

const goodEnough = 0.85;

// Punctuator daemon
let fastPunct = net.createConnection("/tmp/ennuicastr-fastpunct-daemon.sock");
let fpinp = "";
let fastPunctHandler = null;
fastPunct.on("data", text => {
    fpinp += text.toString("utf8");
    let nl;
    while ((nl = fpinp.indexOf("\n")) >= 0) {
        const line = fpinp.slice(0, nl);
        fpinp = fpinp.slice(nl + 1);
        fastPunctHandler(line);
    }
});

// main
(async function() {
    // Get the metadata
    let meta = "";

    let proc = cproc.spawn("/bin/sh", ["-c",
        `cat ${inBase}header1 ${inBase}header2 ${inBase}data | ` +
        `${config.repo}/cook/oggmeta`
    ], {stdio: ["ignore", "pipe", "ignore"]});
    proc.stdout.on("data", chunk => {
        meta = meta + chunk.toString();
    });
    await new Promise(res => {
        proc.stdout.on("end", res);
    });

    meta = meta.trim().split("\n");

    let out = [];

    // Go through it
    for (let line of meta) {
        line = JSON.parse(line);
        const data = line.d;
        if (data.c !== "caption")
            continue;

        // And keep it
        out.push(line);
    }

    // Sort them by ID, then start time
    out = out.sort((l, r) => {
        if (l.d.id === r.d.id)
            return l.d.caption[0].start - r.d.caption[0].start;
        else
            return l.d.id - r.d.id;
    });

    // Get the formats
    let formats = "";
    proc = cproc.spawn("/bin/sh", ["-c",
        `cat ${inBase}header1 ${inBase}header2 ${inBase}data | ` +
        `${config.repo}/cook/oggtracks`
    ], {stdio: ["ignore", "pipe", "ignore"]});
    proc.stdout.on("data", chunk => {
        formats = formats + chunk.toString();
    });
    await new Promise(res => {
        proc.stdout.on("end", res);
    });
    formats = formats.trim().split("\n");

    // Our sync-y reader
    let curStream = null;
    let curId = -1;
    let tmpCtr = 0;

    // First fix bad transcription
    for (let si = 0; si < out.length; si++) {
        const line = out[si];
        const data = line.d;
        let caption = data.caption;

        // Look for low-confidence words within this caption
        let lowConf = false;
        for (let wi = 0; wi < caption.length; wi++) {
            if (caption[wi].conf && caption[wi].conf < goodEnough) {
                lowConf = true;
                break;
            }
        }
        if (!lowConf)
            continue;

        // Look for low-confidence captions to combine
        let ei;
        for (ei = si; ei < out.length - 1; ei++) {
            const curLine = out[ei].d;
            const nextLine = out[ei+1].d;
            if (curLine.id !== nextLine.id ||
                nextLine.caption[0].start >= curLine.caption[curLine.caption.length-1].end + 4000)
                break;

            // Check confidence
            let nLowConf = false;
            for (const word of nextLine.caption) {
                if (word.conf && word.conf < goodEnough) {
                    nLowConf = true;
                    break;
                }
            }
            if (!nLowConf)
                break;
        }

        // Combine them
        while (ei > si) {
            const nextLine = out[si+1].d;
            data.caption = data.caption.concat(nextLine.caption);
            out.splice(si+1, 1);
            ei--;
        }
        caption = data.caption;

        // Get the right reader
        if (curId !== data.id) {
            if (curStream)
                curStream.end();
            curId = data.id;
            const format = (formats[curId - 1] === "flac") ? "flac" : "libopus";
            curStream = new Syncy(
                `cat ${inBase}header1 ${inBase}header2 ${inBase}data ${inBase}header1 ${inBase}header2 ${inBase}data | ` +
                `${config.repo}/cook/oggcorrect ${curId} | ` +
                `ffmpeg -c:a ${format} -i - -f s16le -ac 1 -ar 48000 -`
            );
            vosk.write(JSON.stringify({c: "reset"}) + "\n");
            await new Promise(res => { voskHandler = res; });
        }

        // Send this data to the daemon
        const start = Math.max(caption[0].start * 48 - line.o - 4800, 0);
        const end = Math.max(caption[caption.length-1].end * 48 - line.o + 4800, 0);
        const inRaw = await curStream.read(start, end);
        if (!inRaw) break;
        const inB64 = inRaw.toString("base64");

        vosk.write(JSON.stringify({c: "vosk", wav: inB64}) + "\n");
        const revosk = JSON.parse(await new Promise(res => {
            voskHandler = res;
        }));

        // Spread the new results into new data bits
        let spread = [];
        for (const inLine of revosk.result) {
            const reline = Object.assign({}, line);
            const redata = Object.assign({}, data);
            spread.push(reline);
            reline.d = redata;

            // Fix up the timing
            for (const word of inLine) {
                if (word.conf === 1)
                    delete word.conf;
                word.start = Math.round((word.start * 48000 + start + line.o + 4800) / 48);
                word.end = Math.round((word.end * 48000 + start + line.o + 4800) / 48);
            }
            redata.caption = inLine;
        }

        // Then replace this region with the newly-replaced spread
        out = out.slice(0, si).concat(spread).concat(out.slice(si + 1));
        si += spread.length - 1;
    }

    // End our input stream
    if (curStream)
        curStream.end();
    vosk.end();

    // Now add punctuation
    for (let si = 0; si < out.length; si++) {
        // Find a group that has no four-second gaps (arbitrarily)
        let ei;
        for (ei = si; ei < out.length - 1; ei++) {
            const curLine = out[ei].d;
            const nextLine = out[ei+1].d;
            if (curLine.id !== nextLine.id ||
                nextLine.caption[0].start >= curLine.caption[curLine.caption.length-1].end + 4000)
                break;
        }

        // Process it
        const raw = out.slice(si, ei+1).map(line => {
            return line.d.caption.map(word => word.word).join(" ")
        }).join(" ");
        fastPunct.write(JSON.stringify({c: "fastpunct", i: [raw]}) + "\n");
        const proc = JSON.parse(await new Promise(res => {
            fastPunctHandler = res;
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

        si = ei;
    }

    fastPunct.end();

    // Sort again, now just by time
    out = out.sort((l, r) => {
        return l.d.caption[0].start - r.d.caption[0].start;
    });

    // Output it
    const outS = fs.createWriteStream(outFile + ".tmp", "utf8");
    for (let oi = 0; oi < out.length; oi++)
        outS.write(JSON.stringify(out[oi]) + "\n");
    outS.end();
    await new Promise(res => {
        outS.on("finish", res);
    });
    fs.renameSync(outFile + ".tmp", outFile);
})();
