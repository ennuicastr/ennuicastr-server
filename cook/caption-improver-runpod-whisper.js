#!/usr/bin/env node
/*
 * Copyright (c) 2020-2023 Yahweasel
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
const nrcp = require("node-rest-client-promise");

const config = require("../config.js");

const outFile = process.argv[2];
const inRec = process.argv[3];
const inBase = config.rec + "/" + inRec + ".ogg.";

process.on("unhandledRejection", (reason, promise) => {
    //console.error(promise);
    console.error(reason);
    process.exit(1);
});

const nrc = new nrcp.Client();

async function main() {
    // Get the formats (to get the tracks)
    let formats = "";
    const tp = cproc.spawn("/bin/sh", ["-c",
        `${config.repo}/cook/oggtracks < ${inBase}header1`
    ], {stdio: ["ignore", "pipe", "ignore"]});
    tp.stdout.on("data", chunk => {
        formats = formats + chunk.toString();
    });
    await new Promise(res => tp.stdout.on("end", res));
    formats = formats.trim().split("\n");

    // Collect the jobs
    const files = [];
    const jobs = [];

    // For each track...
    for (let si = 0; si < formats.length; si++) {
        let format = formats[si];
        if (format === "opus")
            format = "libopus";

        // Make a temporary file for the track
        const name = `${inRec}-${si}-${Math.random().toString(36)}${Math.random().toString(36)}${Math.random().toString(36)}.opus`;
        files.push(name);

        // Set it to delete
        {
            const atp = cproc.spawn("/usr/bin/at", ["now + 24 hours"], {
                stdio: ["pipe", "ignore", "inherit"]
            });
            atp.stdin.write(`rm -f ${config.apiShare.dir}/${name}`);
            atp.stdin.end();
            const atret = await new Promise(res => atp.on("exit", res));
            if (atret !== 0)
                break;
        }

        // Generate it
        {
            const p = cproc.spawn("/bin/sh", [
                "-c",
                `cat ${inBase}header1 ${inBase}header2 ${inBase}data ${inBase}header1 ${inBase}header2 ${inBase}data | ` +
                `${config.repo}/cook/oggcorrect ${si + 1} | ` +
                `ffmpeg -c:a ${format} -i - -f ogg -c:a libopus -ac 1 -ar 16000 -b:a 32k -application lowdelay ` +
                `${config.apiShare.dir}/${name}`
            ], {
                stdio: ["ignore", "ignore", "inherit"]
            });
            const ret = await new Promise(res => p.on("exit", res));
            if (ret !== 0)
                break;
        }
    }

    if (files.length !== formats.length) {
        // Failed to generate some file(s)!
        for (const file of files) {
            try {
                fs.unlinkSync(`${config.apiShare.dir}/${file}`);
            } catch (ex) {}
        }
        return;
    }

    // Make the request
    const run = await nrc.postPromise(config.runpodWhisper.url + "/run", {
        headers: {
            accept: "application/json",
            authorization: config.runpodWhisper.key,
            "content-type": "application/json"
        },
        data: JSON.stringify({
            input: {
                audios: files.map(x => `${config.apiShare.url}/${x}`),
                model: "large-v2",
                word_timestamps: true
            }
        })
    });
    if (!run.data || !run.data.id)
        return;
    const id = run.data.id;

    // Now collect the results
    let results = [];
    {
        const maxWait = performance.now() + 24 * 60 * 60 * 1000;
        let waitTime = 2500;
        while (true) {
            // Check the status
            const status = await nrc.getPromise(config.runpodWhisper.url + "/status/" + id, {
                headers: {
                    accept: "application/json",
                    authorization: config.runpodWhisper.key
                }
            });
            if (!status.data)
                return;

            if (status.data.status === "IN_QUEUE" ||
                status.data.status === "IN_PROGRESS") {
                // Still going, wait!
                if (performance.now() > maxWait)
                    return;
                waitTime *= 2;
                if (waitTime > 60000)
                    waitTime = 60000;
                await new Promise(res => setTimeout(res, waitTime));
                continue;
            }

            // Keep the raw result
            results.push({
                t: 0,
                d: {
                    c: "runpod-whisper-raw-result",
                    result: status.data,
                    caption: [{start: 0}]
                }
            });

            if (status.data.status !== "COMPLETED") {
                // Failed!
                break;
            }

            // For each track...
            for (let ti = 0; ti < status.data.output.length; ti++) {
                const track = status.data.output[ti];

                // Should have the data in place
                for (const segment of track.words) {
                    if (!segment.length)
                        continue;
                    const start = Math.round(segment[0].start * 1000);
                    results.push({
                        t: Math.round(segment[0].start * 48000),
                        d: {
                            c: "caption",
                            id: ti + 1,
                            caption: segment.map(word => {
                                return {
                                    start: Math.round(word.start * 1000),
                                    end: Math.round(word.end * 1000),
                                    word: word.word,
                                    probability: word.probability
                                }
                            })
                        }
                    });
                }
            }
            break;
        }
    }

    // Sort the captions
    results = results.sort((l, r) => {
        return l.d.caption[0].start - r.d.caption[0].start;
    });

    // Use VAD to correct timing
    for (let si = 0; si < formats.length; si++) {
        const p = cproc.spawn("./vadify-timings.js", [
            "" + (si + 1), `${config.apiShare.dir}/${files[si]}`
        ], {
            stdio: ["pipe", "pipe", "inherit"]
        });

        // Pass in the current results
        for (const result of results)
            p.stdin.write(JSON.stringify(result) + "\n");
        p.stdin.end();

        // Read out the new results
        let newResults = "";
        try {
            p.stdout.on("data", chunk => newResults += chunk.toString("utf8"));
            await new Promise(res => p.stdout.on("end", res));
            newResults = newResults.trim().split("\n").map(JSON.parse);
        } catch (ex) {
            newResults = results;
        }
        if (newResults.length)
            results = newResults;
    }

    // Delete the files
    for (const file of files) {
        try {
            fs.unlinkSync(`${config.apiShare.dir}/${file}`);
        } catch (ex) {}
    }

    // Output it
    const outS = fs.createWriteStream(outFile + ".tmp", "utf8");
    for (let ri = 0; ri < results.length; ri++)
        outS.write(JSON.stringify(results[ri]) + "\n");
    outS.end();
    await new Promise(res => outS.on("finish", res));
    fs.renameSync(outFile + ".tmp", outFile);
}

main();
