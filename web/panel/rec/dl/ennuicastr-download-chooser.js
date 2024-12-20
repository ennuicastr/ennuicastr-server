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

function dlChooser(rid, name, info, dlBox, dlChooserOpts) {
    // Create a radio select that looks like a button
    function radioButton(addTo, name, idsuff, text, type) {
        var sel = document.createElement("input");
        sel.type = type || "radio";
        sel.name = name;
        sel.id = name + "-" + idsuff;
        sel.style.appearance = "none";
        var lbl = document.createElement("label");
        lbl.classList.add("button");
        lbl.style.marginLeft = "1px";
        lbl.htmlFor = name + "-" + idsuff;
        lbl.innerText = text;
        addTo.appendChild(sel);
        addTo.appendChild(lbl);
        return [sel, lbl];
    }

    // Create a multi-option selector
    function multiSelector(addTo, name, opts, onselect) {
        var others = null, osel = null;
        var selOpt = opts[0];
        var hadSelected = -1;
        var hadDefault = -1;
        for (var i = 0; i < opts.length; i++) (function(i) {
            var opt = opts[i];

            if (opt.other) {
                if (!others) {
                    osel = radioButton(
                        addTo, name + "-other", "", "Others", "checkbox"
                    );
                    others = document.createElement("div");
                    others.style.display = "none";
                    addTo.appendChild(others);

                    osel[0].onchange = function() {
                        if (osel[0].checked) {
                            others.style.display = "";
                        } else {
                            if (selOpt.other) {
                                opts[0].sel[0].checked = true;
                                onselect(opts[0].value);
                            }
                            others.style.display = "none";
                        }
                    };
                }
            }

            var sel = opt.sel = radioButton(
                opt.other ? others : addTo, name, i, opt.name
            );
            if (opt.selected) 
                hadSelected = i;
            if (i === 0 || opt.selected || opt.default)
                hadDefault = i;

            sel[0].onchange = function() {
                selOpt = opt;
                if (others && !opt.other) {
                    osel[0].checked = false;
                    others.style.display = "none";
                }
                localforage.setItem(name, opt.value);
                onselect(opt.value);
            };
        })(i);

        localforage.getItem(name).then(function(val) {
            if (hadSelected >= 0) {
                selOpt = opts[hadSelected];
                selOpt.sel[0].checked = true;
                onselect(selOpt.value);
                return;
            }
            if (val === null) {
                if (hadDefault >= 0)
                    val = opts[hadDefault].value;
                else
                    val = opts[0].value;
            }
            for (var i = 0; i < opts.length; i++) {
                var opt = opts[i];
                if (opt.value === val) {
                    selOpt = opt;
                    opt.sel[0].checked = true;
                    if (opt.other) {
                        osel[0].checked = true;
                        others.style.display = "";
                    }
                    onselect(opt.value);
                    break;
                }
            }
        }).catch(console.error);
    }

    // Create a row and return the chooser box part
    var rowIdx = 0;
    function row(addTo, label, indent) {
        var rw = document.createElement("div");
        rw.classList.add("ecdl-row");
        rw.classList.add("ecdl-row-" + (["even", "odd"][rowIdx%2]));
        rowIdx++;
        addTo.appendChild(rw);

        if (indent) {
            var indiv = document.createElement("div");
            indiv.style.width = indiv.style.minWidth = indent + "em";
            rw.appendChild(indiv);
        }

        if (label) {
            var lbl = document.createElement("div");
            lbl.classList.add("ecdl-row-label");
            lbl.innerText = label;
            rw.appendChild(lbl);
        }

        var ret = document.createElement("div");
        ret.classList.add("ecdl-row-chooser");
        rw.append(ret);

        return ret;
    }

    dlBox.innerHTML = "";

    // Box to eventually be filled with a status bar
    var statusBox = document.createElement("div");
    dlBox.appendChild(statusBox);
    Object.assign(statusBox.style, {
        position: "relative",
        display: "none",
        height: "2em",
        fontSize: "1.5em",
        lineHeight: "2em",
        marginBottom: "1em"
    });
    var statusBar = document.createElement("div");
    statusBox.appendChild(statusBar);
    var statusInd = document.createElement("div");
    Object.assign(statusInd.style, {
        position: "absolute",
        left: "0px",
        right: "0px",
        top: "0px",
        bottom: "0px"
    });
    statusBox.appendChild(statusInd);


    // The very first option is the download button itself
    var ch = row(dlBox);
    Object.assign(ch.style, {
        fontSize: "1.5em",
        textAlign: "center"
    });
    var dlBtn = document.createElement("button");
    dlBtn.innerHTML = "<i class='bx bxs-download'></i> Download";
    ch.appendChild(dlBtn);

    // First the format selector
    var ch = row(dlBox, "Format:");
    var format = "flac";
    var opts = [{
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
    multiSelector(ch, "ec-format", opts, function(v) { format = v; });

    // Determine which tracks have subtracks
    var subtracks = {};
    for (var mi = 0; mi < info.meta.length; mi++) {
        var meta = info.meta[mi];
        try {
            if (meta.d.c === "subtrack") {
                subtracks[meta.d.id] = subtracks[meta.d.id] || {};
                subtracks[meta.d.id][meta.d.subId] = true;
            }
        } catch (ex) {}
    }

    function hasSubtrack(id, stid) {
        try {
            return !!subtracks[id][stid];
        } catch (ex) {}
        return false;
    }

    function hasECTrack(id) {
        return hasSubtrack(id, ~~0x80000000);
    }

    // Options for each track
    var trackOpts = {};

    function maybe(idx, el) {
        if (trackOpts[idx][el])
            return trackOpts[idx][el];
        else
            return trackOpts[0][el];
    }

    // Make the selectors for this track (or all)
    function mkSelectors(addTo, name, idx) {
        var ch;
        var trackOpt = trackOpts[idx] = {};

        rowIdx = 0;
        var indentRow = row(addTo, null, 2);
        addTo = indentRow;

        // Option to download only this track
        trackOpt.only = false;
        if (idx > 0) {
            ch = row(addTo, "Download only this track?");
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
        var def = "no";
        var genOpts = [
            {name: "Yes", value: "yes"},
            {name: "No", value: "no"},
            {name: "Both", value: "both"}
        ];
        if (idx !== 0) {
            def = null;
            genOpts.unshift({name: "Default", value: null});
        } else {
            genOpts[1].default = true;
        }
        genOpts = JSON.stringify(genOpts);

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
            ch = row(addTo, "Echo cancellation:");
            multiSelector(
                ch, "ec-opt-ec-" + name,
                JSON.parse(genOpts),
                function(v) { trackOpt.ec = v; }
            );
        }

        // Noise reduction?
        trackOpt.nr = def;
        ch = row(addTo, "Noise reduction:");
        multiSelector(
            ch, "ec-opt-nr-" + name,
            JSON.parse(genOpts),
            function(v) { trackOpt.nr = v; }
        );

        // Normalization?
        trackOpt.norm = def;
        ch = row(addTo, "Volume normalization:");
        multiSelector(
            ch, "ec-opt-norm-" + name,
            JSON.parse(genOpts),
            function(v) { trackOpt.norm = v; }
        );
    }

    // Make each track's selectors
    var trackSelectors = {};
    trackSelectors[0] = document.createElement("div");
    mkSelectors(trackSelectors[0], "--default--", 0);
    for (var i = 1; info.info.users[i]; i++) {
        var ts = trackSelectors[i] = document.createElement("div");
        mkSelectors(ts, info.info.users[i].nick, i);
    }

    // Then the track selector itself
    rowIdx = 0;
    ch = row(dlBox, "Track:");
    var trackSelectorBox = document.createElement("div");
    dlBox.appendChild(trackSelectorBox);
    var selectedTrack = 0;
    opts = [{
        name: "All",
        value: 0,
        selected: true
    }];
    for (var i = 1; info.info.users[i]; i++)
        opts.push({name: info.info.users[i].nick, value: i});
    multiSelector(ch, "ec-track", opts, function(v) {
        selectedTrack = v;
        trackSelectorBox.innerHTML = "";
        trackSelectorBox.appendChild(trackSelectors[v]);
    });
    trackSelectorBox.innerHTML = "";
    trackSelectorBox.appendChild(trackSelectors[0]);

    // Spacer
    rowIdx = 0;
    row(dlBox, " ");

    // Whether to download normal audio tracks
    var dlAudio = true;
    ch = row(dlBox, "Download audio?");
    multiSelector(ch, "ec-dl-audio", [
        {name: "Yes", value: true, selected: true},
        {name: "No", value: false}
    ], function(v) { dlAudio = v; });

    // Whether to download sfx
    var dlSfx = false;
    if (info.sfx) {
        dlSfx = true;
        ch = row(dlBox, "Download SFX?");
        multiSelector(ch, "ec-dl-sfx", [
            {name: "Yes", value: true, selected: true},
            {name: "No", value: false}
        ], function(v) { dlSfx = v; });
    }

    // Whether to download transcription
    var dlTranscript = false;
    if (info.transcript) {
        dlTranscript = true;
        ch = row(dlBox, "Download transcript?");
        multiSelector(ch, "ec-dl-transcript", [
            {name: "Yes", value: true, selected: true},
            {name: "No", value: false}
        ], function(v) { dlTranscript = v; });
    }

    // Finally, the download action itself
    dlBtn.onclick = function() {
        dlBtn.disabled = true;
        dlBtn.classList.add("disabled");
        Promise.all([]).then(function() {
            // Choose the format/codec
            var avFormat = format;
            var codec = format;
            var formatOpts = {
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

            var project = void 0;
            if (format === "aup")
                project = "aup";

            var tracks = [];

            // Maybe only one track
            var downloadOnly = 0;
            if (trackOpts[selectedTrack].only)
                downloadOnly = selectedTrack;

            // First the normal tracks
            for (var i = 1; info.info.users[i]; i++) {
                if (downloadOnly && downloadOnly !== i)
                    continue;
                var ti = info.info.users[i];
                var safeName = ti.nick.replace(/[^A-Za-z0-9]/g, "_");
                if (dlAudio) {
                    tracks.push({
                        type: "rec",
                        name: safeName,
                        trackNo: i,
                        duration: info["duration_" + i],
                        applyEchoCancellation: hasECTrack(i)
                            ? maybe(i, "ec") : "no",
                        applyNoiseReduction: maybe(i, "nr"),
                        applyNormalization: maybe(i, "norm")
                    });
                }
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
                for (var i = 1; i <= info.sfx; i++) {
                    tracks.push({
                        type: "sfx",
                        trackNo: i,
                        duration: info["sfx_duration_" + i]
                    });
                }
            }

            // Then transcript
            if (dlTranscript && !downloadOnly) {
                var trackNames = {};
                for (var i = 1; info.info.users[i]; i++)
                    trackNames[i] = info.info.users[i].nick;
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

            return EnnuicastrDownloadProcessor.download({
                id: rid,
                name: name,
                format: avFormat,
                codec: codec,
                ctx: formatOpts,
                project: project,
                tracks: tracks,
                onprogress: (file, time, duration) => {
                    statusBox.style.display = "";

                    var progress = time / duration * 100;
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

        }).then(function() {
            dlBtn.disabled = false;
            dlBtn.classList.remove("disabled");
            statusBox.style.display = "none";

        }).catch(function(ex) {
            if (dlChooserOpts && dlChooserOpts.noRedirect) {
                document.getElementById("footer").innerText = ex.message + "\n" + ex.stack;
                throw ex;
            } else {
                document.location.href =
                    "../dl/?i=" + rid.toString(36) + "&nox=1";
            }

        });
    };
}
