#!/usr/bin/env node
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

const config = require("../config.js");
const db = require("../db.js").db;

let duration = false;
let trackNo = -1;
process.argv.slice(2).forEach(arg => {
    if (arg === "-d") {
        duration = true;
    } else if (arg[0] === "-") {
        console.error("Unrecognized argument " + arg);
        process.exit(1);
    } else {
        trackNo = ~~arg;
    }
});

(async function() {
    // Get the metadata
    var meta = "";

    process.stdin.on("data", (chunk) => {
        meta = meta + chunk.toString();
    });

    await new Promise(res => {
        process.stdin.on("end", res);
    });

    meta = meta.trim().split("\n");

    let sounds = {};

    // Then make the tracks
    let tracks = [];
    let current = {};
    for (let line of meta) {
        let c = JSON.parse(line);
        let t = c.t / 48000;
        c = c.d;
        if (c.c !== "sound")
            return;

        // Get the associated sound
        let sound;
        if (c.sid in sounds) {
            sound = sounds[c.sid];
        } else {
            sound = await db.getP("SELECT * FROM sounds WHERE sid=@SID;", {
                "@SID": c.sid // FIXME: also uid
            });
            if (!sound) sound = null;
            sounds[c.sid] = sound;
        }

        if (c.status) {
            // Find a track
            let ti;
            for (ti = 0; ti < tracks.length; ti++) {
                let track = tracks[ti];
                let last = track[track.length-1];
                if (last.end < t) {
                    last.end = t;
                    last.duration = last.end - last.start;
                    break;
                }
            }
            if (ti >= tracks.length) {
                // Need a fresh track for it
                if (t === 0) {
                    tracks.push([]);
                } else {
                    tracks.push([{
                        sid: null,
                        start: 0,
                        duration: t,
                        end: t
                    }]);
                }
            }
            let sobj = {
                sid: c.sid,
                start: t,
                duration: sound.duration,
                end: t + sound.duration
            };
            tracks[ti].push(sobj);
            current[c.sid] = tracks[ti];

        } else {
            // Stop this sound
            let track = current[c.sid];
            if (!track)
                continue;
            let cur = track[track.length - 1];
            if (!cur)
                continue;
            if (cur.end > t) {
                cur.end = t;
                cur.duration = cur.end - cur.start;
                track.push({
                    sid: null,
                    start: t,
                    duration: 0,
                    end: t
                });
            }

        }
    }

    if (trackNo < 0) {
        // No argument, just say how many tracks
        process.stdout.write(tracks.length + "\n");

    } else {
        // Track no
        if (trackNo >= tracks.length) {
            // Huh?
            process.stdout.write("anullsrc=cl=stereo:r=48000,atrim=0:2[aud]\n");
            return;
        }

        let track = tracks[trackNo];
        if (duration) {
            // Just give the duration
            process.stdout.write((track[track.length-1].end + 2) + "\n");
            return;
        }
        for (let ti = 0; ti < track.length; ti++) {
            let step = track[ti];
            if (step.sid)
                process.stdout.write("amovie=" + config.sounds + "/" + step.sid + ".webm,apad");
            else
                process.stdout.write("anullsrc=cl=stereo:r=48000");
            process.stdout.write(",atrim=0:" + step.duration);

            if (ti === 0)
                process.stdout.write("[aud];\n");
            else
                process.stdout.write("[step];\n[aud][step]concat=v=0:a=1[aud];\n");
        }
        process.stdout.write("[aud]anull[aud]\n");

    }
})();
