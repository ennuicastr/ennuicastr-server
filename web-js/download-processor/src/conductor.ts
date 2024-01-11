/*
 * Copyright (c) 2024 Yahweasel
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

import * as archive from "./archive";
import * as proc from "./processor";
import * as pFetch from "./proc-fetch";
import * as pDecoder from "./proc-decoder";
import * as pNoiser from "./proc-noiser";
import * as pNorm from "./proc-norm";
import * as pEncoder from "./proc-encoder";
import * as pSave from "./proc-save";
import * as pAup from "./proj-aup";

import * as downloadStream from "@ennuicastr/dl-stream";
import type * as LibAVT from "libav.js";
import type * as YALAPT from "yalap.js";
declare let YALAP: YALAPT.YALAPWrapper;
import * as wsp from "web-streams-polyfill/ponyfill";

export type Tristate = "yes" | "no" | "both";

export interface DownloadOptions {
    /**
     * ID of the recording. Mandatory as this is how we fetch the actual data.
     */
    id: number;

    /**
     * Name, mainly used for the name of the downloaded file.
     */
    name: string;

    /**
     * Project format to use. Currently only "aup" is supported.
     */
    project?: string;

    /**
     * Format for audio files in the download, as the standard file extension.
     */
    format: string;

    /**
     * Codec, as a libav codec string.
     */
    codec: string;

    /**
     * Codec context options, in particular bitrate and sample format.
     */
    ctx: LibAVT.AVCodecContextProps;

    /**
     * Tracks to download.
     */
    tracks: TrackDescription[];

    /**
     * Optional progress callback.
     */
    onprogress?: (name: string, time: number) => unknown;
}

export interface RecTrackDescription {
    type: "rec",

    /**
     * Name for this particular track.
     */
    name: string;

    /**
     * Track number (1-indexed)
     */
    trackNo: number;

    /**
     * Sub-track number, if downloading a subtrack. Don't use this for echo
     * cancellation, even though that's technically a subtrack.
     */
    subTrackNo?: number;

    /**
     * Duration of this track in seconds.
     */
    duration: number;

    /**
     * Whether to apply echo cancellation.
     */
    applyEchoCancellation?: Tristate;

    /**
     * Whether to apply noise reduction.
     */
    applyNoiseReduction?: Tristate;

    /**
     * Whether to apply audio level normalization.
     */
    applyNormalization?: Tristate;
}

export interface SFXTrackDescription {
    type: "sfx";

    /**
     * Track number (1-indexed)
     */
    trackNo: number;

    /**
     * Duration of this track in seconds.
     */
    duration: number;
}

export type TrackDescription = RecTrackDescription | SFXTrackDescription;

function include(ts: Tristate, on: boolean) {
    if (ts === "both") return true;
    return (ts === "yes") === on;
}

export async function download(opts: DownloadOptions) {
    let libavFormat = opts.format;
    if (opts.format === "aac")
        libavFormat = "adts";
    else if (opts.format === "m4a")
        libavFormat = "ismv";
    else if (opts.format === "opus")
        libavFormat = "ogg";

    // Turn the tracks into files
    const files: archive.Archive = [];
    const fileNames: Record<string, boolean> = Object.create(null);
    const savers: pSave.SaveProcessor[] = [];

    async function addRecTrack(track: RecTrackDescription) {
        // Figure out if there are multiple outputs for a given input
        const multiple =
            (track.applyNoiseReduction === "both") ||
            (track.applyNormalization === "both");
        let saverNoEC: pSave.SaveProcessor | null = null;
        let saverEC: pSave.SaveProcessor | null = null;

        // Make a file for each option
        for (
            let optIdx = 0;
            optIdx < (1 << 3 /* number of options */);
            optIdx++
        ) {
            // Choose whether to perform this option
            const ec = !!(optIdx & 1);
            const nr = !!(optIdx & 2);
            const norm = !!(optIdx & 4);
            if (!include(track.applyEchoCancellation, ec)) continue;
            if (!include(track.applyNoiseReduction, nr)) continue;
            if (!include(track.applyNormalization, norm)) continue;
            let saver = saverNoEC;
            if (ec)
                saver = saverEC;

            // Start the process chain with a fetch or saver
            let inp: proc.Processor<Uint8Array> | null = null;
            if (multiple && saver) {
                // Start by restoring this saver
                inp = new pSave.RestoreProcessor(saver);

            } else {
                // Start with a fetch
                let url = "../dl/" +
                    `?i=${opts.id.toString(36)}` +
                    `&f=raw&t=${track.trackNo.toString(36)}`;

                /* If we're using echo cancellation, that's implemented as a
                 * subtrack with the highest bit set. */
                if (ec) {
                    url += `&st=${Math.pow(2,31).toString(36)}`;
                }

                inp = new pFetch.FetchProcessor(url);

                // Possibly make a saver
                if (multiple) {
                    saver = inp = new pSave.SaveProcessor(
                        `${opts.id}.${track.trackNo}.${ec}`,
                        inp.stream
                    );
                    savers.push(saver);
                    if (ec)
                        saverEC = saver;
                    else
                        saverNoEC = saver;
                }
            }

            // Decode it
            let proc: proc.Processor<LibAVT.Frame> =
                new pDecoder.DecoderProcessor(inp, track.duration);

            // Perform any processing
            // FIXME: echo
            if (nr)
                proc = new pNoiser.NoiserProcessor(proc);
            if (norm)
                proc = new pNorm.NormalizeProcessor(proc);

            // Make a name for it
            let trackNoStr = "" + track.trackNo;
            if (trackNoStr.length < 2)
                trackNoStr = "0" + trackNoStr;
            let fname = `${trackNoStr}-${track.name}`;
            if (fileNames[fname]) {
                // Already used, so extend it with the processing info
                if (ec)
                    fname += "-ec";
                if (nr)
                    fname += "-nr";
                if (norm)
                    fname += "-norm";
            }
            fileNames[fname] = true;

            // And then encode
            const outp = new pEncoder.EncoderProcessor(
                proc, track.duration, libavFormat, opts.codec, opts.ctx,
                opts.onprogress
                    ? (time => opts.onprogress(fname, time))
                    : void 0
            );

            files.push({
                pathname: `${fname}.${opts.format}`,
                stream: outp.stream
            });
        }
    }

    async function addSFXTrack(track: SFXTrackDescription) {
        // Start the process chain with a fetch
        const inp = new pFetch.FetchProcessor(
            "../dl/" +
            `?i=${opts.id.toString(36)}` +
            `&f=sfx&t=${track.trackNo.toString(36)}`
        );

        // Decode it
        let proc: proc.Processor<LibAVT.Frame> =
            new pDecoder.DecoderProcessor(inp, track.duration);

        // Make a name for it
        let fname = `sfx-${track.trackNo}`;
        fileNames[fname] = true;

        // And then encode
        const outp = new pEncoder.EncoderProcessor(
            proc, track.duration, libavFormat, opts.codec, opts.ctx,
            opts.onprogress
                ? (time => opts.onprogress(fname, time))
                : void 0
        );

        files.push({
            pathname: `${fname}.${opts.format}`,
            stream: outp.stream
        });
    }

    for (const track of opts.tracks) {
        if (track.type === "sfx")
            await addSFXTrack(track);
        else // rec
            await addRecTrack(track);
    }

    // Possibly convert the filelist for project packaging
    let suffix = opts.format;
    if (opts.project === "aup") {
        suffix = "aup";
        pAup.aupProject(opts.name, files);
    }

    // Zip the files all together
    /*
    const zipper = await YALAP.YALAPW({format: "zip"});
    const downloadPromise = downloadStream.stream(
        `${opts.name}.${suffix}.zip`, zipper.stream, {
            "content-type": "application/zip"
        }
    );
    for (const file of files)
        await zipper.addFile(file.pathname, file.stream);
    await zipper.free();
    */
    for (const file of files) {
        const rdr = file.stream.getReader();
        while (true) {
            const rd = await rdr.read();
            if (rd.done) break;
        }
    }

    // Clear up the space from saved data
    for (const saver of savers)
        await saver.clear();

    // And wait for the download to finish (if it hasn't)
    //await downloadPromise;
}
