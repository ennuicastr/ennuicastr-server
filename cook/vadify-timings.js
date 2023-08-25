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
const fs = require("fs");

const VAD = require("node-vad");

const trackNo = +process.argv[2];
const trackFile  = process.argv[3];

// Prepare the VADs at different aggressiveness levels
const vads = [
    new VAD(VAD.Mode.NORMAL),
    new VAD(VAD.Mode.AGGRESSIVE),
    new VAD(VAD.Mode.VERY_AGGRESSIVE)
];

// Helpful blanks
const blank1ms = Buffer.alloc(32);
const blank2s = Buffer.alloc(32000);

// Helper function to run the VAD over a chunk of audio
async function runVAD(curChunks, max, acceptNoise = false) {
    for (const vad of vads) {
        let firstIn = 1/0;
        let lastOut = max;
        let vadTime = 0;

        // Reset the VAD with some blank audio
        while (true) {
            const vres = await vad.processAudio(blank2s, 16000);
            if (vres === VAD.Event.SILENCE || vres === VAD.Event.ERROR)
                break;
        }
        await vad.processAudio(blank2s, 16000);

        // Go through each chunk
        for (const chunk of curChunks) {
            // One millisecond at a time
            for (let si = 0; si < chunk.length; si += 16) {
                const sub = chunk.slice(si, si + 16);

                // Process this chunk
                const vres = await vad.processAudio(Buffer.from(sub.buffer), 16000);
                if (vres === VAD.Event.VOICE || (acceptNoise && vres === VAD.Event.NOISE)) {
                    if (vadTime < firstIn)
                        firstIn = vadTime;
                } else if (vres === VAD.Event.NOISE || vres === VAD.Event.SILENCE) {
                    lastOut = Math.min(vadTime + sub.length, max);
                }
                vadTime += sub.length;
                if (vadTime >= max)
                    break;
            }
            if (vadTime >= max)
                break;
        }

        if (lastOut > firstIn) {
            // VAD found something
            return [firstIn, lastOut];
        }
    }

    // None of the VADs hit
    return [1/0, -1];
}

async function main() {
    // Read the Whisper caption data from stdin
    let captions = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => captions += chunk);
    await new Promise(res => process.stdin.on("end", res));
    captions = captions.trim().split("\n").map(JSON.parse);

    // Convert to mono 16kHz
    const p = cproc.spawn("/bin/sh", ["-c",
        `ffmpeg -i ${trackFile} -f s16le -ac 1 -ar 16000 -`], {
        stdio: ["ignore", "pipe", "ignore"]
    });

    // Prepare to read
    let stdoutEnded = false;
    p.stdout.on("end", () => stdoutEnded = true);
    let curChunks = [];
    let curStart = 0;
    let curEnd = 0;
    async function readChunk() {
        let chunk = p.stdout.read();
        while (!chunk && !stdoutEnded) {
            await new Promise(res => p.stdout.once("readable", res));
            chunk = p.stdout.read();
        }
        if (!chunk)
            return;
        chunk = new Int16Array(chunk.buffer);
        curEnd += chunk.length;
        curChunks.push(chunk);
    }

    // Go caption-by-caption
    for (let ci = 0; ci < captions.length; ci++) {
        const data = captions[ci];
        if (data.d.c !== "caption")
            continue;
        if (data.d.id !== trackNo)
            continue;
        let caption = data.d.caption;
        if (!caption.length)
            continue;

        process.stderr.write(`${Math.floor(ci / captions.length * 100)}%\r`);

        for (let wi = 0; wi < caption.length; wi++) {
            const word = caption[wi];

            // Check for nonsensical timing
            let start = word.start;
            let end = word.end;
            if (end < start) {
                const tmp = end;
                end = start;
                start = tmp;
            }
            if (end < start + 50) {
                let start = word.start;
                let end = word.end;
                if (wi > 0)
                    start = Math.min(start, caption[wi-1].end);
                if (wi < caption.length - 1)
                    end = Math.max(end, caption[wi+1].start);
                if (end < start + 50) {
                    if (caption.length === 1) {
                        start -= 50;
                        end += 50;
                    } else if (wi === 0) {
                        start -= 100;
                    } else if (wi === caption.length - 1) {
                        end += 100;
                    }
                }
            }

            // Times of this caption, in 16kHz (from milliseconds)
            let capStart = start * 16;
            let capEnd = end * 16;

            // Get to the start time
            while (curStart < capStart) {
                if (curEnd <= curStart) {
                    // Need more data
                    await readChunk();
                }

                if (curStart + curChunks[0].length <= capStart) {
                    // This chunk is too early, skip it
                    curStart += curChunks[0].length;
                    curChunks.shift();

                } else {
                    // This chunk includes the time we need
                    curChunks[0] = curChunks[0].subarray(capStart - curStart);
                    curStart = capStart;

                }

                if (stdoutEnded)
                    break;
            }

            // Get to the end time
            while (curEnd < capEnd) {
                await readChunk();
                if (stdoutEnded)
                    break;
            }

            // Pass this data through the VAD
            let [firstIn, lastOut] =
                await runVAD(curChunks, capEnd - curStart);

            if (lastOut <= firstIn) {
                if (word.probability < 0.6) {
                    // Probably just not a word
                    word.remove = true;
                } else {
                    /* Whisper is confident that there's a word, but the VAD
                     * failed. try looking for any noise. */
                    [firstIn, lastOut] =
                        await runVAD(curChunks, capEnd - curStart, true);
                }
            }

            if (lastOut > firstIn) {
                word.start = Math.round((curStart + firstIn) / 16);
                word.end = Math.round((curStart + lastOut) / 16);
            }
        }
        data.d.caption = caption = caption.filter(x => !x.remove);
    }
    process.stderr.write("100%\n");

    // Skip any remaining audio
    while (!stdoutEnded) {
        await readChunk();
        while (curChunks.length)
            curChunks.shift();
    }

    // Split captions with long pauses
    const splitCaptions = [];
    for (const data of captions) {
        if (data.d.c !== "caption" || data.d.id !== trackNo) {
            splitCaptions.push(data);
            continue;
        }
        const caption = data.d.caption;
        if (!caption.length)
            continue;

        let lastWord = caption[0];
        let splitCaption = [lastWord];
        for (let wi = 1; wi < caption.length; wi++) {
            const word = caption[wi];
            if (word.start >= lastWord.end + 2000) {
                // Split it here
                splitCaptions.push({
                    t: splitCaption[0].start * 48,
                    d: {
                        c: "caption",
                        id: trackNo,
                        caption: splitCaption
                    }
                });
                splitCaption = [];
            }
            splitCaption.push(word);
            lastWord = word;
        }
        splitCaptions.push({
            t: splitCaption[0].start * 48,
            d: {
                c: "caption",
                id: trackNo,
                caption: splitCaption
            }
        });
    }
    captions = splitCaptions;

    // Timing has changed, so sort the result
    captions = captions.sort((l, r) => {
        return l.d.caption[0].start - r.d.caption[0].start;
    });

    // Give the result
    for (const caption of captions)
        process.stdout.write(JSON.stringify(caption) + "\n");
}

main();
