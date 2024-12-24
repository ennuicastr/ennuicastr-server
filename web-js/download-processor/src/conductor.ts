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
import * as cText from "./cap-txt";
import * as cVTT from "./cap-vtt";
import * as proc from "./processor";
import * as pFetch from "./proc-fetch";
import * as pFSFetch from "./proc-fs-fetch";
import * as pDecoder from "./proc-decoder";
import * as pNoiser from "./proc-noiser";
import * as pNorm from "./proc-norm";
import * as pEncoder from "./proc-encoder";
import * as pVideoTimer from "./proc-video-timer";
import * as pMuxer from "./proc-muxer";
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
    onprogress?: (name: string, time: number, duration: number) => unknown;
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

    /**
     * Port over which to get video data.
     */
    videoPort: MessagePort | null;

    /**
     * Video tracks to mux with this audio. null to get audio unmuxed.
     */
    videoInfo: (pFSFetch.VideoDescription | null)[];
}

export interface VideoTrackDescription {
    type: "video";
    videoPort: MessagePort;
    videoInfo: pFSFetch.VideoDescription[];
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

export interface CaptionsTrackDescription {
    type: "captions";

    /**
     * Name for this track.
     */
    name: string;

    /**
     * Track number, exclude for all tracks.
     */
    trackNo?: number;

    /**
     * Recording info, for names.
     */
    info: any;

    /**
     * Format of track captions.
     */
    format: "json" | "vtt" | "txt";
}

export interface InfoTxtTrackDescription {
    type: "infotxt";
}

export type TrackDescription =
    RecTrackDescription | VideoTrackDescription | SFXTrackDescription |
    CaptionsTrackDescription | InfoTxtTrackDescription;

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

    let suffix = opts.format;

    // Turn the tracks into files
    const files: archive.Archive = [];
    const fileNames: Record<string, boolean> = Object.create(null);
    const savers: pSave.Cache[] = [];

    async function addRecTrack(track: RecTrackDescription) {
        // Figure out if there are multiple outputs for a given input
        const multiple =
            (track.applyNormalization === "both") ||
            (track.applyNoiseReduction === "both") ||
            (track.videoInfo.length > 1);
        let saverNoEC: pSave.Cache | null = null;
        let saverEC: pSave.Cache | null = null;

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

            // For each video input...
            for (const videoInfo of track.videoInfo) {
                const toPop: proc.CorkableProcessor<Uint8Array>[] = [];

                // Maybe get video
                let vidInp: pVideoTimer.VideoTimerProcessor | null = null;
                if (videoInfo) {
                    const vf = new pFSFetch.FSFetchProcessor(
                        track.videoPort, videoInfo
                    );
                    vidInp = new pVideoTimer.VideoTimerProcessor(
                        videoInfo.id, vf, track.duration
                    );
                    toPop.push(vf);
                }

                // Start the process chain with a fetch or saver
                let saver = saverNoEC;
                if (ec)
                    saver = saverEC;

                let inp: proc.CorkableProcessor<Uint8Array> | null = null;
                if (multiple && saver) {
                    // Start by restoring this saver
                    inp = saver.getRestoreProcessor();

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

                    // Possibly make a saver
                    if (multiple) {
                        saver = new pSave.Cache(
                            `${opts.id}.${track.trackNo}.${ec}`,
                            () => new pFetch.FetchProcessor(url)
                        );
                        savers.push(saver);
                        if (ec)
                            saverEC = saver;
                        else
                            saverNoEC = saver;
                        inp = saver.getSaveProcessor();
                    } else {
                        inp = new pFetch.FetchProcessor(url);
                    }
                }
                toPop.push(inp);

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

                // Decode it
                let pr: proc.Processor<LibAVT.Frame[]> =
                    new pDecoder.DecoderProcessor(fname, inp, track.duration);

                // Perform any processing
                if (nr)
                    pr = new pNoiser.NoiserProcessor(pr);
                if (norm)
                    pr = new pNorm.NormalizeProcessor(pr);

                // Encode
                const encp = new pEncoder.EncoderProcessor(
                    pr, track.duration, opts.codec, opts.ctx
                );

                // Choose an output format
                let ext = opts.format;
                let laFormat = libavFormat;
                if (vidInp) {
                    let webm = true;
                    let mp4 = true;
                    switch (opts.codec) {
                        case "libopus":
                            mp4 = false;
                            break;

                        case "aac":
                        case "alac":
                            webm = false;
                            break;

                        default:
                            webm = mp4 = false;
                    }
                    switch (videoInfo.mimeType.replace(/^.*codecs=/, "")) {
                        case "vp8":
                        case "vp9":
                        case "vp09":
                        case "av01":
                            mp4 = false;
                            break;

                        case "avc1":
                            webm = false;
                            break;

                        default:
                            webm = mp4 = false;
                    }

                    if (webm) {
                        ext = laFormat = "webm";
                    } else if (mp4) {
                        ext = "mp4";
                        laFormat = "ismv";
                    } else {
                        ext = "mkv";
                        laFormat = "matroska";
                    }
                    suffix = ext;
                }

                // Mux
                const streams: any[] = [];
                if (vidInp)
                    streams.push(vidInp);
                streams.push(encp);
                const outp = new pMuxer.MuxerProcessor(
                    fname, streams, track.duration, laFormat, 
                    opts.onprogress
                        ? (time => opts.onprogress(fname, time, track.duration))
                        : void 0
                );

                files.push({
                    pathname: `${fname}.${ext}`,
                    stream: new proc.PopProcessor(toPop, outp).stream
                });
            }
        }
    }

    async function addVideoTrack(track: VideoTrackDescription) {
        // For each video input...
        for (const videoInfo of track.videoInfo) {
            // Get the video
            const vf = new pFSFetch.FSFetchProcessor(
                track.videoPort, videoInfo
            );
            const vidInp = new pVideoTimer.VideoTimerProcessor(
                videoInfo.id, vf, 0
            );

            // Make a name for it
            let trackNoStr = "" + videoInfo.track;
            if (trackNoStr.length < 2)
                trackNoStr = "0" + trackNoStr;
            let fname =
                `${trackNoStr}-${videoInfo.name.replace(/\.[^\.]*$/, "")}`;

            // Choose an output format
            let webm = true;
            let mp4 = true;
            switch (videoInfo.mimeType.replace(/^.*codecs=/, "")) {
                case "vp8":
                    case "vp9":
                    case "vp09":
                    case "av01":
                    mp4 = false;
                    break;

                case "avc1":
                    webm = false;
                    break;

                default:
                    webm = mp4 = false;
            }

            let ext: string;
            let laFormat: string;
            if (webm) {
                ext = laFormat = "webm";
            } else if (mp4) {
                ext = "mp4";
                laFormat = "ismv";
            } else {
                ext = "mkv";
                laFormat = "matroska";
            }
            suffix = ext;

            // Mux
            const outp = new pMuxer.MuxerProcessor(
                fname, [vidInp], 0, laFormat, void 0
            );

            files.push({
                pathname: `${fname}.${ext}`,
                stream: new proc.PopProcessor([vf], outp).stream
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
        let pr: proc.Processor<LibAVT.Frame[]> =
            new pDecoder.DecoderProcessor(`sfx.${track.trackNo}`, inp, track.duration);

        // Make a name for it
        let fname = `sfx-${track.trackNo}`;
        fileNames[fname] = true;

        // And then encode
        const encp = new pEncoder.EncoderProcessor(
            pr, track.duration, opts.codec, opts.ctx
        );

        // And mux
        const outp = new pMuxer.MuxerProcessor(
            `sfx.${track.trackNo}`,
            [encp], track.duration, libavFormat,
            opts.onprogress
                ? (time => opts.onprogress(fname, time, track.duration))
                : void 0

        );

        files.push({
            pathname: `${fname}.${opts.format}`,
            stream: new proc.PopProcessor([inp], outp).stream
        });
    }

    let captions: any = null;
    async function addCaptionsTrack(track: CaptionsTrackDescription) {
        // Possibly download the captions
        if (!captions) {
            const url = "../dl/" +
                `?i=${opts.id.toString(36)}` +
                "&f=captions";
            try {
                const f = await fetch(url);
                captions = (await f.json()).captions;
            } catch (ex) {
                captions = [];
            }
        }

        // Select only the requested track
        let c: any[] = captions;
        if (typeof track.trackNo !== "undefined")
            c = c.filter(x => x.id === track.trackNo);
        else
            c = c.filter(x => typeof x.id !== "undefined");

        // Get the name mapping
        const names: Record<number, string> = {};
        if (typeof track.trackNo === "undefined") {
            const users = track.info.info.users;
            for (let ui = 1; users[ui]; ui++)
                names[ui] = users[ui].nick;
        }

        // And make it the appropriate type
        let retStr: string;
        if (track.format === "json") {
            retStr = JSON.stringify(c);
        } else if (track.format === "vtt") {
            retStr = cVTT.toVTT(c, names);
        } else if (track.format === "txt") {
            retStr = cText.toText(c, names);
        }
        const retU8 = (new TextEncoder()).encode(retStr);

        let fname = "";
        if (typeof track.trackNo !== "undefined") {
            fname = track.trackNo + "-";
            if (fname.length < 3) fname = `0${fname}`;
        }
        fname += track.name;

        files.push({
            pathname: `${fname}.${track.format}`,
            stream: new wsp.ReadableStream<Uint8Array>({
                start: controller => {
                    controller.enqueue(retU8);
                    controller.close();
                }
            })
        });
    }

    function addInfoTxt() {
        const inp = new pFetch.FetchProcessor(
            "../dl/" +
            `?i=${opts.id.toString(36)}` +
            "&f=infotxt"
        );
        files.push({
            pathname: "info.txt",
            stream: new proc.PopProcessor([inp], inp).stream
        });
    }

    for (const track of opts.tracks) {
        if (track.type === "sfx")
            await addSFXTrack(track);
        else if (track.type === "captions")
            await addCaptionsTrack(track);
        else if (track.type === "infotxt")
            addInfoTxt();
        else if (track.type === "video")
            await addVideoTrack(track);
        else // rec
            await addRecTrack(track);
    }

    // Possibly convert the filelist for project packaging
    if (opts.project === "aup") {
        suffix = "aup";
        pAup.aupProject(opts.name, files);
    }

    // Safari auto-extracts zip files, but doesn't support Zip64
    let zipOptions = "";
    if (navigator.userAgent.indexOf("Safari") >= 0 && navigator.userAgent.indexOf("Chrome") < 0)
        zipOptions = "!zip64";

    // Zip the files all together
    const zipper = await YALAP.YALAPW({
        format: "zip",
        options: zipOptions
    });
    const downloadPromise = downloadStream.stream(
        `${opts.name}.${suffix}.zip`, zipper.stream, {
            "content-type": "application/zip"
        }
    );
    for (const file of files)
        await zipper.addFile(file.pathname, file.stream);
    await zipper.free();

    // Clear up the space from saved data
    for (const saver of savers)
        await saver.clear();

    // And wait for the download to finish (if it hasn't)
    await downloadPromise;
}
