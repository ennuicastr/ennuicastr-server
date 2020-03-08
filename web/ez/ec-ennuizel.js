/*
 * Copyright (c) 2019-2020 Yahweasel 
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

var Ennuizel = (function(ez) {
    var libav, l;

    if (typeof LibAV === "undefined") LibAV = {};

    /* Use half as many threads as we have available, to sort of play nice with
     * the rest of the system, but no more than 8, to play nice with the server */
    if (navigator.hardwareConcurrency) {
        LibAV.threads = Math.ceil(navigator.hardwareConcurrency/2);
        if (LibAV.threads > 8) LibAV.threads = 8;
    }

    if (!ez.plugins) ez.plugins = [];

    // Some info we can get before Ennuizel starts
    var url = new URL(window.location);
    var params = new URLSearchParams(url.search);
    var idS = params.get("i");
    var id = Number.parseInt(idS, 36);
    var wizardOptsS = params.get("w");
    var wizardOpts = Number.parseInt(wizardOptsS, 36);
    var lang = params.get("lang");
    if (lang !== null) ez.lang = lang;

    // Set to true if we've been asked to use the wizard automatically
    var autoWizard = false;

    // Our supported formats, as a subset of the export formats, named by codec
    var formats = ["flac", "aac", "libvorbis", "libopus", "wavpack", "pcm_s16le", "alac"];

    // Once we have the JSON, the info
    var info = null;

    // The track numbers to request
    var tracks = [];

    // Has there been a catastrophic error?
    var error = false;

    // The current track serial number
    var curTrackNo = null;

    function reportError(err) {
        if (err instanceof Error) {
            err = err + "\n\n" + err.stack;
        } else if (typeof err === "object") {
            try {
                err = JSON.stringify(err);
            } catch (ex) {}
        }
        alert(err);
        return Promise.all([]);
    }

    // At startup, just choose our mode
    function start() {
        libav = LibAV;
        l = ez.l;

        // Create our wizard before anything else
        wizardAdd();

        // Validate
        if (idS === null) {
            // No ID, just go to Ennuizel
            return Promise.resolve(true);
        }

        // Get our wizard options, one way or another
        wizardConvertOpts();

        if (wizardOptsS === null || wizardOpts.ask) {
            // None were provided, or we were asked to ask, so ask
            return mainMode().then(function(mode) {
                if (mode === "wizard") {
                    autoWizard = true;
                    return wizardDialog().then(function(opts) {
                        if (opts)
                            wizardOpts = opts;
                        else
                            autoWizard = false;
                        ez.skipRendering = autoWizard;
                        return downloader();
                    });
                } else if (mode === "downloader") {
                    return downloader();
                } else {
                    return true;
                }
            });

        } else {
            // Don't need to ask for opts
            return mainMode().then(function(mode) {
                if (mode === "wizard") {
                    autoWizard = true;
                    ez.skipRendering = true;
                    return downloader();
                } else if (mode === "downloader") {
                    return downloader();
                } else {
                    return true;
                }
            });

        }
    }
    ez.plugins.push(start);

    // In our "main" mode, we ask whether to use the wizard or not, or just bail out entirely
    function mainMode() {
        return ez.modalWait().then(function(unlock) {
            ez.modalDialog.innerHTML = "";

            ez.mke(ez.modalDialog, "div", {text: l("wizarddesc") + "\n\n"});
            var cancel = ez.mke(ez.modalDialog, "button", {text: l("cancel")});
            ez.mke(ez.modalDialog, "span", {text: "  "});
            var edit = ez.mke(ez.modalDialog, "button", {text: l("edit")});
            ez.mke(ez.modalDialog, "span", {text: "  "});
            var auto = ez.mke(ez.modalDialog, "button", {text: l("auto")});

            ez.modalToggle(true);
            auto.focus();

            return new Promise(function(res, rej) {
                cancel.onclick = function() {
                    unlock();
                    res("cancel");
                };
                edit.onclick = function() {
                    unlock();
                    res("downloader");
                };
                auto.onclick = function() {
                    unlock();
                    res("wizard");
                };
            });

        }).then(function(mode) {
            ez.modal(l("loadinge"));
            if (mode === "downloader")
                return ez.warn(l("postedit")).then(function() { return mode; });
            return mode;

        }).catch(reportError);
    }

    function downloader() {
        var pid = "ec-" + id.toString(36);

        // Find the project ID
        return ez.startup(false).then(function() {
            return ez.dbGlobal.getItem("projects");
        }).then(function(projects) {
            projects = projects || [];
            if (projects.includes(pid)) {
                if (autoWizard) {
                    /* If they're using the wizard in auto mode, they clearly
                     * want to delete anything that's already there */
                    return "delete";
                }

                // They've already imported this!
                return ez.modalWait().then(function(unlock) {
                    ez.modalDialog.innerHTML = "";
                    ez.mke(ez.modalDialog, "div", {text: l("projectexists") + "\n\n"});
                    var load = ez.mke(ez.modalDialog, "button", {text: l("loadexisting")});
                    ez.mke(ez.modalDialog, "span", {text: "  "});
                    var del = ez.mke(ez.modalDialog, "button", {text: l("deleteexisting")});
                    ez.modalToggle(true);
                    load.focus();

                    return new Promise(function(res) {
                        load.onclick = function() {
                            unlock();
                            res("load");
                        };
                        del.onclick = function() {
                            unlock();
                            res("delete");
                        };
                    });
                });
            }

            return "new";

        }).then(function(action) {
            if (action === "load") {
                // Bail out, just load the existing project
                ez.projectName = pid;
                return ez.loadProject().then(function() { return false; });
            }

            if (action === "delete") {
                // Delete the existing project and start fresh
                ez.projectName = pid;
                ez.modal(l("deletinge"));
                return ez.loadProject().then(function() {
                    ez.modal(l("deletinge"));
                    return ez.deleteProject();
                }).then(function() {
                    ez.projectName = pid;
                    return ez.createProject().then(begin);
                });
            }

            // Otherwise, we're just creating the project and starting the download
            ez.projectName = pid;
            return ez.createProject().then(begin);

        });
    }

    // General purpose ack for received messages
    function ack(sock, msg) {
        var seq = new DataView(msg.buffer).getUint32(0, true);
        msg = msg.subarray(4);
        var ackbuf = new DataView(new ArrayBuffer(8));
        ackbuf.setUint32(0, 0, true);
        ackbuf.setUint32(4, seq, true);
        sock.send(ackbuf.buffer);
        return msg;
    }

    // Perform our initial connection
    function begin() {
        // Start by downloading the info
        ez.modal(l("loadinge"));

        return fetch("/panel/rec/dl/?i=" + id.toString(36) + "&f=info").then(function(res) {
            return res.text();

        }).then(function(res) {
            res = JSON.parse(res);
            info = {tracks: res};

            // Count the tracks
            var length = 1;
            while (res[length]) {
                tracks.push(length);
                length++;
            }

            // Now start our actual downloads
            doDownloads();

            return false;

        }).catch(function(err) {
            // At this level, just make sure we clean up
            return ez.deleteProject().then(function() {
                throw err;
            });
        });
    }

    // Manage all of our downloaders
    function doDownloads() {
        var threads = libav.threads;
        var downloaders = [], downloaded = [];
        var i, j;
        for (i = 0; i < threads; i++) downloaders.push(null);
        for (i = 0; i < tracks.length; i++) downloaded.push(false);

        function mainLoop() {
            // Activate any inactive threads
            var allInactive = true;
            for (i = 0; i < threads; i++) {
                if (downloaders[i] === null) {
                    // Find an undownloaded track
                    for (j = 0; j < tracks.length; j++)
                        if (!downloaded[j]) break;
                    if (j !== tracks.length) {
                        downloaders[i] = doDownload(i, j);
                        downloaded[j] = true;
                        allInactive = false;
                    }
                } else allInactive = false;
            }

            if (allInactive) {
                // We're done!
                var p = ez.updateTrackViews();
                if (autoWizard)
                    return p.then(function() {
                        return wizard(wizardOpts);
                    });
                return p.then(function() {
                    ez.modal();
                });
            }

            // Wait for one (or more) to finish
            var active = [];
            for (i = 0; i < threads; i++) {
                if (downloaders[i] !== null)
                    active.push(downloaders[i]);
            }

            return Promise.race(active).then(function(i) {
                downloaders[i] = null;
                multiModal(i, ".");
            }).then(mainLoop);
        }

        return mainLoop().catch(reportError);
    }

    // Perform a single download
    function doDownload(thread, trackNo) {
        trackNo = tracks[trackNo];

        // The name for this track
        var name;
        if (trackNo in info.tracks) {
            name = trackNo + "-" + info.tracks[trackNo].nick;
        } else {
            name = trackNo + "";
        }

        // Packet handler
        var packet = null;

        var la = libav.targets[thread];
        var rdr, buf;

        // Begin downloading this track
        return fetch("/panel/rec/dl/?i=" + id.toString(36) + "&f=raw&t=" + trackNo.toString(36)).then(function(res) {
            // Now we're into normal message mode
            rdr = res.body.getReader();

            // Create a track
            newTrack();

            // And start our downloading
            return rdr.read().then(readHandler);

        }).catch(reportError);

        // Create a new track
        function newTrack() {
            multiModal(thread, l("loadingx", name) + "...");

            var data = new Uint8Array(0);

            // Stage 1: Wait for enough data to start the LibAV part
            // Stage 2: Normal data
            // Stage 3: EOF
            var eof = false;

            var fmt_ctx, stream, c, pkt, frame;

            // Packet handler for before we've started LibAV
            packet = function(chunk) {
                if (chunk !== null) {
                    var c = new Uint8Array(data.length + chunk.length);
                    c.set(data, 0);
                    c.set(chunk, data.length);
                    data = c;
                } else
                    eof = true;

                // Collect data until we have 1MB or EOF
                if (data.length >= 1024*1024 || eof) {
                    // Now it's time to start libav. First make the device.
                    return la.mkreaderdev("dev.ogg").then(function() {
                        return la.ff_reader_dev_send("dev.ogg", data);

                    }).then(function() {
                        if (eof)
                            return la.ff_reader_dev_send("dev.ogg", null);

                    }).then(function() {
                        return la.ff_init_demuxer_file("dev.ogg");

                    }).then(function(ret) {
                        fmt_ctx = ret[0];
                        stream = ret[1][0];
                        return la.ff_init_decoder(stream.codec_id);

                    }).then(function(ret) {
                        c = ret[1];
                        pkt = ret[2];
                        frame = ret[3];

                        return trackData(eof, fmt_ctx, [0], [0], [c], [pkt], [frame]);
                    }).catch(reportError);
                } else {
                    return Promise.all([]);
                }
            };
        }

        // Normal track data handler
        function trackData(eof, fmt_ctx, idxs, durations, cs, pkts, frameptrs) {
            /* We need to create an intricate interaction between two promise
             * chains: The actual importing will call back either with 'again', or,
             * upon EOF, by finishing, while the downloader has its own stream of
             * events to create the data. */
            var data = new Uint8Array(0);

            var importPromise = ez.importTrackLibAV(
                name, fmt_ctx, idxs, durations, cs, pkts, frameptrs,
                {
                    libav: la,
                    report: function(x) { return multiModal(thread, x); },
                    devfile: "dev.ogg",
                    againCb: againCb,
                    filter: "aresample=flags=res:min_comp=0.001:max_soft_comp=1000000:min_hard_comp=16:first_pts=0"
                }).then(function() {
                // Clean up
                return Promise.all([
                    la.ff_free_decoder(cs[0], pkts[0], frameptrs[0]),
                    la.avformat_close_input_js(fmt_ctx),
                    la.unlink("dev.ogg")
                ]);
            }).catch(reportError);

            var againRes, downPromise, downRes;

            downPromise = new Promise(function(res, rej) {
                downRes = res;
            });

            function againCb() {
                // Prepare to wait for more download
                var ret = new Promise(function(res, rej) {
                    againRes = res;
                });

                // And ask for it
                downRes();

                return ret;
            }

            packet = function(chunk) {
                // Append it
                if (chunk !== null) {
                    var c = new Uint8Array(data.length + chunk.length);
                    c.set(data, 0);
                    c.set(chunk, data.length);
                    data = c;

                    // Send it when we have a big chunk
                    if (data.length < 1024*1024)
                        return Promise.all([]);
                }

                // Send the data we have
                console.log(name + " sending.");
                var p = la.ff_reader_dev_send("dev.ogg", data).then(function() {
                    data = new Uint8Array(0);
                    if (chunk === null)
                        return la.ff_reader_dev_send("dev.ogg", null);

                }).then(function() {
                    // Tell them we have more
                    console.log(name + " sent.");
                    var waiter = new Promise(function(res, rej) {
                        downRes = res;
                    });
                    againRes();
                    sent = 0;
                    return waiter;

                });

                if (chunk === null) {
                    // EOF
                    return importPromise;
                } else {
                    return p;
                }
            };

            if (eof) {
                return importPromise;
            } else {
                return downPromise;
            }
        }

        // Handler for all data reading
        function readHandler(res) {
            if (res.done) {
                // We're done!
                return packet(null).then(function() {
                    /* If we're not rendering, it's safe to show the tracks
                     * in multithreaded mode */
                    if (ez.skipRendering)
                        ez.updateTrackViews();

                    return thread;
                });
            }

            // Not done, so must have data
            return packet(res.value).then(function() {
                return rdr.read();
            }).then(readHandler);
        }
    }

    // A function to handle making the modal dialog display multiple messages at once
    var modalMsgs = [];
    function multiModal(idx, msg) {
        while (modalMsgs.length <= idx)
            modalMsgs.push(".");
        modalMsgs[idx] = msg;
        ez.modal(modalMsgs.join("\n\n"));
    }

    // Get an export format based on a codec name
    function getExportFormat(codec) {
        for (var i = 0; i < ez.exportFormats.length; i++) {
            var format = ez.exportFormats[i];
            if (format.codec === codec)
                return format;
        }
        return ez.exportFormats[0];
    }

    // Add our wizard to the menu
    function wizardAdd() {
        ez.menu.push({
            name: l("wizard"),
            on: wizardMode
        });
        ez.showMenu();
    }

    // Convert wizard options from the URL fields into a displayable state
    function wizardConvertOpts() {
        if (wizardOpts === null)
            wizardOpts = 0;
        if (typeof wizardOpts === "object")
            return;

        var inOpts = wizardOpts;
        wizardOpts = {
            format: inOpts & 0xF,
            mix: !!(inOpts & 0x10),
            level: !!(inOpts & 0x20),
            keep: !!(inOpts & 0x100),
            ask: !!(inOpts & 0x200)
        };
    }

    // Our wizard mode
    function wizardMode() {
        return wizardDialog().then(function(opts) {
            if (opts)
                return wizard(opts);
        });
    }

    // The wizard dialog, without the actual wizard
    function wizardDialog() {
        // Get our default options into a displayable state
        wizardConvertOpts();

        return ez.modalWait().then(function(unlock) {
            // Display the menu
            ez.modalDialog.innerHTML = "";

            var form = ez.mke(ez.modalDialog, "div", {"class": "modalform"});

            ez.mke(form, "label", {text: l("format") + ":", "class": "inputlabel", "for": "format"});
            var fmtSelect = ez.mke(form, "select", {id: "format"});
            for (var i = 0; i < formats.length; i++) {
                var format = getExportFormat(formats[i]);
                var opt = ez.mke(fmtSelect, "option", {text: format.name});
                opt.value = i;
                if (wizardOpts.format === i)
                    opt.selected = true;
            }

            ez.mke(form, "div", {text: "\n\n"});

            var mix = ez.mke(form, "input", {id: "mix"});
            mix.type = "checkbox";
            mix.checked = wizardOpts.mix;
            ez.mke(form, "label", {text: " " + l("domix"), "for": "mix"});
            ez.mke(form, "br");

            var level = ez.mke(form, "input", {id: "level"});
            level.type = "checkbox";
            level.checked = wizardOpts.level;
            ez.mke(form, "label", {text: " " + l("dolevel"), "for": "level"});
            ez.mke(form, "br");

            var keep = ez.mke(form, "input", {id: "keep"});
            keep.type = "checkbox";
            keep.checked = wizardOpts.keep;
            ez.mke(form, "label", {text: " " + l("dokeep"), "for": "keep"});

            ez.mke(ez.modalDialog, "div", {text: "\n\n"});

            var cancel = ez.mke(ez.modalDialog, "button", {text: l("cancel")});
            ez.mke(ez.modalDialog, "span", {text: "  "});
            var ok = ez.mke(ez.modalDialog, "button", {text: l("go")});

            ez.modalToggle(true);
            ok.focus();

            return new Promise(function(res, rej) {
                cancel.onclick = function() {
                    unlock();
                    res(null);
                };
                ok.onclick = function() {
                    unlock();
                    // Gather our options
                    res({
                        format: fmtSelect.value,
                        mix: mix.checked,
                        level: level.checked,
                        keep: keep.checked
                    });
                };
            });

        }).then(function(opts) {
            ez.modal();
            return opts;
        });
    }

    // The actual wizard proper
    function wizard(opts) {
        var p = Promise.all([]);

        // Make sure we haven't been asked to do something nonsensical
        if (ez.nonemptyTracks(ez.selectedTracks()).length === 0) {
            ez.modal(l("empty"));
            return ez.deleteProject();
        }

        if (opts.mix) {
            // Start by mixing
            p = p.then(function() {
                if (opts.level)
                    return ez.mix({fin: "dynaudnorm", fout: "dynaudnorm", keep: true});
                else
                    return ez.mix({keep: true});
            }).then(function(mix) {
                ez.selectNone();
                ez.selectTrack(mix.id, true);

            });

        } else if (opts.level) {
            // We need to level but didn't mix
            p = p.then(function() {
                return ez.applyLibAVFilter({params: [{}]}, ["dynaudnorm"]);
            });

        }

        // Now do the actual export
        p = p.then(function() {
            var format = getExportFormat(formats[opts.format]);
            return ez.exportProject(""+id, format);

        });

        // Then possibly delete the project
        if (!opts.keep)
            p = p.then(ez.deleteProject);

        // Finally, tell them we're done
        p = p.then(function() {
            var msg = l("done");
            if (opts.keep)
                return ez.warn(msg);
            else
                ez.modal(msg);
        });

        return p;
    }

    return ez;
})(typeof Ennuizel === "object" ? Ennuizel : {});
