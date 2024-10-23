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

import type * as libavT from "libav.js";
import type * as localforageT from "localforage";
//import type * as processorT from "../../download-processor/src/main";

declare var LibAV: libavT.LibAVWrapper;
declare var localforage: typeof localforageT;
//declare var EnnuicastrDownloadProcessor: typeof processorT;

declare var EnnuicastrDownloadProcessor: any;

interface MultiSelectorOption {
    name: string;
    value: any;
    selected?: boolean;
    default?: boolean;
    other?: boolean;
    sel?: [HTMLInputElement, HTMLElement];
}

interface TrackOptions {
    only?: boolean;
    ec?: string;
    nr?: string;
    norm?: string;
}

interface ChooserOptions {
    rid: number;
    videoUrl: string;
    key: string;
    name: string;
    dlBox: HTMLElement;
}

// Create a radio select that looks like a button
function radioButton(
    addTo: HTMLElement, name: string, idsuff: string, text: string, type = "radio"
): [HTMLInputElement, HTMLElement] {
    const sel = document.createElement("input");
    sel.type = type;
    sel.name = name;
    sel.id = name + "-" + idsuff;
    sel.style.appearance = "none";
    const lbl = document.createElement("label");
    lbl.classList.add("button");
    lbl.style.marginLeft = "1px";
    lbl.htmlFor = name + "-" + idsuff;
    lbl.innerText = text;
    addTo.appendChild(sel);
    addTo.appendChild(lbl);
    return [sel, lbl];
}

// Create a multi-option selector
async function multiSelector(
    addTo: HTMLElement, name: string, opts: MultiSelectorOption[],
    onselect: (val: any) => void
) {
    let others: HTMLElement | null = null;
    let osel: [HTMLInputElement, HTMLElement] | null = null;
    let selOpt = opts[0];
    let hadSelected = -1;
    let hadDefault = -1;
    for (let i = 0; i < opts.length; i++) {
        const opt = opts[i];

        if (opt.other) {
            if (!others) {
                osel = radioButton(
                    addTo, name + "-other", "", "Others", "checkbox"
                );
                others = document.createElement("div");
                others.style.display = "none";
                addTo.appendChild(others);

                osel[0].onchange = function() {
                    if (osel![0].checked) {
                        others!.style.display = "";
                    } else {
                        if (selOpt.other) {
                            opts[0].sel![0].checked = true;
                            onselect(opts[0].value);
                        }
                        others!.style.display = "none";
                    }
                };
            }
        }

        const sel = opt.sel = radioButton(
            opt.other ? others! : addTo, name, ""+i, opt.name
        );
        if (opt.selected) 
            hadSelected = i;
        if (i === 0 || opt.selected || opt.default)
            hadDefault = i;

        sel[0].onchange = function() {
            selOpt = opt;
            if (others && !opt.other) {
                osel![0].checked = false;
                others!.style.display = "none";
            }
            localforage.setItem(name, opt.value);
            onselect(opt.value);
        };
    }

    let val = await localforage.getItem(name);
    if (hadSelected >= 0) {
        selOpt = opts[hadSelected];
        selOpt.sel![0].checked = true;
        onselect(selOpt.value);
        return;
    }
    if (val === null) {
        if (hadDefault >= 0)
            val = opts[hadDefault].value;
        else
            val = opts[0].value;
    }
    for (let i = 0; i < opts.length; i++) {
        const opt = opts[i];
        if (opt.value === val) {
            selOpt = opt;
            opt.sel![0].checked = true;
            if (opt.other) {
                osel![0].checked = true;
                others!.style.display = "";
            }
            onselect(opt.value);
            break;
        }
    }
}

async function fetchInfo(rid: number) {
    try {
        // Fetch the metadata for this recording
        const infoRes = await fetch(`?i=${rid.toString(36)}&f=info`);
        return await infoRes.json();
    } catch (ex) {
        /*
        document.location.href =
           "../dl/?i=" + rid.toString(36) + "&nox=1";
           */
        console.error(ex);
        throw ex;
    }
}

async function fetchVideo(opts: ChooserOptions) {
    const fsUrl = new URL(opts.videoUrl);
    const ifr = document.createElement("iframe");
    Object.assign(ifr.style, {
        display: "block",
        visibility: "hidden",
        height: "0px",
        margin: "auto"
    });
    opts.dlBox.appendChild(ifr);

    const videoInfo: Record<string, any> = {};
    const keys: Record<string, boolean> = {};
    let backends: Record<string, boolean> = {};
    const backendsReceived: Record<string, boolean> = {};
    let mp: MessagePort;

    // Communicate with the video backend
    let commRes: ()=>void;
    const commPromise = new Promise<void>(res => commRes = res);
    let doneRes: () => void;
    const donePromise = new Promise<void>(res => doneRes = res);
    window.addEventListener("message", ev => {
        if (ev.origin !== fsUrl.origin || !ev.data)
            return;
        switch (ev.data.c) {
            case "ennuicastr-file-storage-transient-activation":
                // Need transient activation for storage
                for (const node of Array.from(opts.dlBox.childNodes)) {
                    if (node !== ifr)
                        opts.dlBox.removeChild(node);
                }
                Object.assign(ifr.style, {
                    visibility: "",
                    width: `calc(min(${ev.data.btn.w}px, 100%))`,
                    height: `calc(max(${ev.data.btn.h}px, 32px))`,
                    margin: "auto"
                });
                commRes();
                break;

            case "ennuicastr-file-storage":
                // Communication port
                ifr.style.display = "none";
                backends = ev.data.backends || {local: true};
                mp = ev.data.port;
                mp.onmessage = onmessage;
                mp.postMessage({c: "ennuicastr-file-storage"});
                commRes();
                break;
        }
    });

    // Load it, give it 10 seconds to load
    ifr.src = opts.videoUrl;
    const loaded = await Promise.race([
        (async () => { await commPromise; return true; })(),
        (async () => { await new Promise(res => setTimeout(res, 10000)); return false; })()
    ]);
    if (!loaded)
        return {videoInfo, videoPort: null};

    function onmessage(ev: MessageEvent) {
        const msg = ev.data;
        switch (msg.c) {
            case "salt":
            {
                const hash = (<any> window)["sha512-es"].default.hash;
                const key = keys[msg.ctx] = hash(hash(
                    opts.key + ":" + msg.global)
                    + ":" + msg.local);
                mp.postMessage({c: "list", ctx: msg.ctx, key: key});
                break;
            }

            case "list":
            {
                for (let i = 0; i < msg.files.length; i++) {
                    const file = msg.files[i];

                    file.ctx = msg.ctx;
                    file.key = keys[msg.ctx];

                    const fileId = file.fileId + ":" + file.name + ":" + file.track;
                    if (fileId in videoInfo) {
                        const oldFile = videoInfo[fileId];
                        // Maybe replace it
                        if (file.ctx === "fsdh" ||
                            (file.ctx === "remote" && oldFile.ctx === "local")) {
                            videoInfo[fileId] = file;
                        }
                    } else {
                        videoInfo[fileId] = file;
                    }
                }

                // Maybe we're done
                {
                    backendsReceived[msg.ctx] = true;
                    let unfinishedBackends = false;
                    for (const fileId in backends) {
                        if (backends[fileId] && !backendsReceived[fileId]) {
                            unfinishedBackends = true;
                            break;
                        }
                    }
                    if (!unfinishedBackends)
                        doneRes();
                }
                break;
            }
        }
    }

    await donePromise;
    return {videoIframe: ifr, videoInfo, videoPort: mp!};
}

export async function dlChooser(opts: ChooserOptions) {
    let info: any;
    let videoIframe: HTMLIFrameElement | undefined;
    let videoInfo: any;
    let videoPort: MessagePort | null;
    await Promise.all([
        (async () => { info = await fetchInfo(opts.rid); })(),
        (async () => {
            ({videoIframe, videoInfo, videoPort} = await fetchVideo(opts));
        })()
    ]);

    // Swap the video info by track
    let haveVideo = false;
    {
        let videoByTrack: any = {};
        for (const fileId in videoInfo) {
            const file = videoInfo[fileId];
            haveVideo = true;
            let trackVideo = videoByTrack[file.track];
            if (!trackVideo)
                trackVideo = videoByTrack[file.track] = [];
            trackVideo.push(file);
        }
        videoInfo = videoByTrack;
    }

    const dlBox = opts.dlBox;

    // Create a row and return the chooser box part
    let rowIdx = 0;
    function row(addTo: HTMLElement, label?: string, indent?: number) {
        const rw = document.createElement("div");
        rw.classList.add("ecdl-row");
        rw.classList.add("ecdl-row-" + (["even", "odd"][rowIdx%2]));
        rowIdx++;
        addTo.appendChild(rw);

        if (indent) {
            const indiv = document.createElement("div");
            indiv.style.width = indiv.style.minWidth = indent + "em";
            rw.appendChild(indiv);
        }

        if (label) {
            const lbl = document.createElement("div");
            lbl.classList.add("ecdl-row-label");
            lbl.innerText = label;
            rw.appendChild(lbl);
        }

        const ret = document.createElement("div");
        ret.classList.add("ecdl-row-chooser");
        rw.append(ret);

        return ret;
    }

    for (const node of Array.from(dlBox.childNodes)) {
        if (node !== videoIframe)
            dlBox.removeChild(node);
    }

    // Box to eventually be filled with a status bar
    const statusBox = document.createElement("div");
    dlBox.appendChild(statusBox);
    Object.assign(statusBox.style, {
        position: "relative",
        display: "none",
        height: "2em",
        fontSize: "1.5em",
        lineHeight: "2em",
        marginBottom: "1em"
    });
    const statusBar = document.createElement("div");
    statusBox.appendChild(statusBar);
    const statusInd = document.createElement("div");
    Object.assign(statusInd.style, {
        position: "absolute",
        left: "0px",
        right: "0px",
        top: "0px",
        bottom: "0px"
    });
    statusBox.appendChild(statusInd);


    // The very first option is the download button itself
    const ch = row(dlBox);
    Object.assign(ch.style, {
        fontSize: "1.5em",
        textAlign: "center"
    });
    const dlBtn = document.createElement("button");
    dlBtn.innerHTML = "<i class='bx bxs-download'></i> Download";
    ch.appendChild(dlBtn);

    // If we have video, maybe mux it
    let muxVideo = "yes";
    const muxOpts: MultiSelectorOption[] = [{
        name: "Yes",
        value: "yes",
    }, {
        name: "No",
        value: "no"
    }, {
        name: "Both",
        value: "both"
    }];

    // Audio format
    let format = "flac";
    const formatOpts: MultiSelectorOption[] = [{
        name: "FLAC",
        value: "flac"
    }, {
        name: "Audacity project",
        value: "aup"
    }, {
        name: "MPEG-4 AAC",
        value: "aac",
        other: true
    }, {
        name: "Opus",
        value: "opus",
        other: true
    }, {
        name: "wav",
        value: "wav",
        other: true
    }, {
        name: "Apple ALAC",
        value: "alac",
        other: true
    }];

    // Create these together, as they're interconnected
    {
        const ch = row(dlBox, "Combine\nvideo and audio?");
        multiSelector(ch, "ec-mux", muxOpts, v => {
            muxVideo = v;
            if (v === "yes" && format === "aup") {
                // Can't mux with an audio project
                formatOpts[0].sel![0].checked = true;
                format = formatOpts[0].value;
            }
        });
    }

    {
        const ch = row(dlBox, haveVideo ? "Audio format:" : "Format:");
        multiSelector(ch, "ec-format", formatOpts, v => {
            format = v;
            if (v === "aup" && muxVideo === "yes") {
                // Can't mux with an audio project
                muxOpts[2].sel![0].checked = true;
                muxVideo = "both";
            }
        });
    }

    // Determine which tracks have subtracks
    const subtracks: Record<number, Record<number, boolean>> = {};
    for (let mi = 0; mi < info.meta.length; mi++) {
        const meta = info.meta[mi];
        try {
            if (meta.d.c === "subtrack") {
                subtracks[meta.d.id] = subtracks[meta.d.id] || {};
                subtracks[meta.d.id][meta.d.subId] = true;
            }
        } catch (ex) {}
    }

    function hasSubtrack(id: number, stid: number) {
        try {
            return !!subtracks[id][stid];
        } catch (ex) {}
        return false;
    }

    function hasECTrack(id: number) {
        return hasSubtrack(id, ~~0x80000000);
    }

    // Options for each track
    const trackOpts: Record<number, TrackOptions> = {};

    function maybe(idx: number, el: string): boolean {
        const trackOpt: any = trackOpts[idx];
        if (trackOpt[el])
            return trackOpt[el];
        else
            return (<any> trackOpts[0])[el];
    }

    // Make the selectors for this track (or all)
    function mkSelectors(addTo: HTMLElement, name: string, idx: number) {
        const trackOpt = trackOpts[idx] = <TrackOptions> {};

        rowIdx = 0;
        const indentRow = row(addTo, void 0, 2);
        addTo = indentRow;

        // Option to download only this track
        trackOpt.only = false;
        if (idx > 0) {
            const ch = row(addTo, "Download only this track?");
            multiSelector(
                ch, "ec-download-only-" + idx,
                [
                    {name: "Yes", value: true},
                    {name: "No", value: false, selected: true}
                ],
                function(v) { trackOpt.only = v; }
            );
        }

        // General yes/no/both options
        let genOptsStr: string;
        let def: string | undefined = "no";
        {
            const genOpts: MultiSelectorOption[] = [
                {name: "Yes", value: "yes"},
                {name: "No", value: "no"},
                {name: "Both", value: "both"}
            ];
            if (idx !== 0) {
                def = void 0;
                genOpts.unshift({name: "Default", value: null});
            } else {
                genOpts[1].default = true;
            }
            genOptsStr = JSON.stringify(genOpts);
        }

        // Echo cancellation?
        trackOpt.ec = def;
        let showECSelector = false;
        if (idx === 0) {
            for (let subIdx = 1; info.info.users[subIdx]; subIdx++) {
                if (hasECTrack(subIdx)) {
                    showECSelector = true;
                    break;
                }
            }
        } else {
            showECSelector = hasECTrack(idx);
        }
        if (showECSelector) {
            const ch = row(addTo, "Echo cancellation:");
            multiSelector(
                ch, "ec-opt-ec-" + name,
                JSON.parse(genOptsStr),
                function(v) { trackOpt.ec = v; }
            );
        }

        // Noise reduction?
        {
            trackOpt.nr = def;
            const ch = row(addTo, "Noise reduction:");
            multiSelector(
                ch, "ec-opt-nr-" + name,
                JSON.parse(genOptsStr),
                function(v) { trackOpt.nr = v; }
            );
        }

        // Normalization?
        {
            trackOpt.norm = def;
            const ch = row(addTo, "Volume normalization:");
            multiSelector(
                ch, "ec-opt-norm-" + name,
                JSON.parse(genOptsStr),
                function(v) { trackOpt.norm = v; }
            );
        }
    }

    // Make each track's selectors
    const trackSelectors: Record<number, HTMLElement> = {};
    trackSelectors[0] = document.createElement("div");
    mkSelectors(trackSelectors[0], "--default--", 0);
    for (let i = 1; info.info.users[i]; i++) {
        const ts = trackSelectors[i] = document.createElement("div");
        mkSelectors(ts, info.info.users[i].nick, i);
    }

    // Then the track selector itself
    let selectedTrack = 0;
    {
        const ch = row(dlBox, "Track:");
        const trackSelectorBox = document.createElement("div");
        dlBox.appendChild(trackSelectorBox);
        const opts: MultiSelectorOption[] = [{
            name: "All",
            value: 0,
            selected: true
        }];
        for (let i = 1; info.info.users[i]; i++)
            opts.push({name: info.info.users[i].nick, value: i});
        multiSelector(ch, "ec-track", opts, function(v) {
            selectedTrack = v;
            trackSelectorBox.innerHTML = "";
            trackSelectorBox.appendChild(trackSelectors[v]);
        });
        trackSelectorBox.innerHTML = "";
        trackSelectorBox.appendChild(trackSelectors[0]);
    }

    // Spacer
    rowIdx = 0;
    row(dlBox, " ");

    // Whether to download normal audio tracks
    let dlAudio = true;
    if (haveVideo || info.sfx || info.transcript) {
        const ch = row(dlBox, "Download audio?");
        multiSelector(ch, "ec-dl-audio", [
            {name: "Yes", value: true, selected: true},
            {name: "No", value: false}
        ], function(v) { dlAudio = v; });
    }

    // Whether to download video
    let dlVideo = false;
    if (haveVideo) {
        dlVideo = true;
        const ch = row(dlBox, "Download video?");
        multiSelector(ch, "ec-dl-video", [
            {name: "Yes", value: true, selected: true},
            {name: "No", value: false}
        ], v => { dlVideo = v; });
    }

    // Whether to download sfx
    let dlSfx = false;
    if (info.sfx) {
        dlSfx = true;
        const ch = row(dlBox, "Download SFX?");
        multiSelector(ch, "ec-dl-sfx", [
            {name: "Yes", value: true, selected: true},
            {name: "No", value: false}
        ], function(v) { dlSfx = v; });
    }

    // Whether to download transcription
    let dlTranscript = false;
    if (info.transcript) {
        dlTranscript = true;
        const ch = row(dlBox, "Download transcript?");
        multiSelector(ch, "ec-dl-transcript", [
            {name: "Yes", value: true, selected: true},
            {name: "No", value: false}
        ], function(v) { dlTranscript = v; });
    }

    // Finally, the download action itself
    dlBtn.onclick = async function() {
        dlBtn.disabled = true;
        dlBtn.classList.add("disabled");

        // Choose the format/codec
        let avFormat = format;
        let codec = format;
        let formatOpts = {
            sample_fmt: LibAV.AV_SAMPLE_FMT_FLTP,
            bit_rate: 256000
        };
        switch (format) {
            case "flac":
            case "aup":
                avFormat = codec = "flac";
                formatOpts.sample_fmt = LibAV.AV_SAMPLE_FMT_S32;
                break;

            case "aac":
                avFormat = "m4a";
                break;

            case "opus":
                avFormat = "ogg";
                codec = "libopus";
                formatOpts.sample_fmt = LibAV.AV_SAMPLE_FMT_FLT;
                break;

            case "wav":
                codec = "pcm_s16le";
                formatOpts.sample_fmt = LibAV.AV_SAMPLE_FMT_S16;
                break;

            case "alac":
                avFormat = "m4a";
                formatOpts.sample_fmt = LibAV.AV_SAMPLE_FMT_S32P;
                break;
        }

        let project: string | undefined = void 0;
        if (format === "aup")
            project = "aup";

        const tracks: any[] = [];

        // Maybe only one track
        let downloadOnly = 0;
        if (trackOpts[selectedTrack].only)
            downloadOnly = selectedTrack;

        // First the normal tracks
        for (let i = 1; info.info.users[i]; i++) {
            if (downloadOnly && downloadOnly !== i)
                continue;
            const ti = info.info.users[i];
            const safeName = ti.nick.replace(/[^A-Za-z0-9]/g, "_");

            // Audio, with and without video
            if (dlAudio) {
                let trVideoInfo: any[] = [null];
                if (dlVideo && videoInfo[i]) {
                    if (muxVideo === "yes")
                        trVideoInfo = videoInfo[i];
                    else if (muxVideo === "both")
                        trVideoInfo = trVideoInfo.concat(videoInfo[i]);
                }
                tracks.push({
                    type: "rec",
                    name: safeName,
                    trackNo: i,
                    duration: info["duration_" + i],
                    applyEchoCancellation: hasECTrack(i)
                        ? maybe(i, "ec") : "no",
                    applyNoiseReduction: maybe(i, "nr"),
                    applyNormalization: maybe(i, "norm"),
                    videoPort,
                    videoInfo: trVideoInfo
                });
            }

            // Video unmuxed
            if (dlVideo && (!dlAudio || muxVideo === "no") && videoInfo[i]) {
                tracks.push({
                    type: "video",
                    videoPort,
                    videoInfo: videoInfo[i]
                });
            }

            // Transcript
            if (dlTranscript) {
                tracks.push({
                    type: "captions",
                    name: safeName,
                    trackNo: i,
                    format: "vtt"
                });
                tracks.push({
                    type: "captions",
                    name: safeName,
                    trackNo: i,
                    format: "txt"
                });
            }
        }

        // Then sfx tracks
        if (dlAudio && !downloadOnly) {
            for (let i = 1; i <= info.sfx; i++) {
                tracks.push({
                    type: "sfx",
                    trackNo: i,
                    duration: info["sfx_duration_" + i]
                });
            }
        }

        // Then transcript
        if (dlTranscript && !downloadOnly) {
            tracks.push({
                type: "captions",
                name: "transcript",
                info: info,
                format: "vtt"
            });
            tracks.push({
                type: "captions",
                name: "transcript",
                info: info,
                format: "txt"
            });
        }

        // And info.txt
        tracks.push({type: "infotxt"});

        try {
            await EnnuicastrDownloadProcessor.download({
                id: opts.rid,
                name: opts.name,
                format: avFormat,
                codec: codec,
                ctx: formatOpts,
                project: project,
                tracks: tracks,
                onprogress: (file: string, time: number, duration: number) => {
                    statusBox.style.display = "";

                    const progress = time / duration * 100;
                    Object.assign(statusBar.style, {
                        position: "absolute",
                        left: "0px",
                        top: "0px",
                        bottom: "0px",
                        width: progress + "%",
                        backgroundColor: "var(--bg-10)"
                    });
                    statusInd.innerText = file + ": " + Math.round(progress) + "%";
                }
            });

            dlBtn.disabled = false;
            dlBtn.classList.remove("disabled");
            statusBox.style.display = "none";

        } catch (ex) {
            /*
            document.location.href =
               "../dl/?i=" + rid.toString(36) + "&nox=1";
               */
            console.error(ex);

        }

    };
}
