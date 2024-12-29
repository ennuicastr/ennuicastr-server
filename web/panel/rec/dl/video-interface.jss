<?JS!
/*
 * Copyright (c) 2020-2024 Yahweasel
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

const {rid, recInfo} = arguments[1];
?>

<div id="video-box" style="display: none">
    <header><h3>Video</h3></header>

    <p><span style="display: inline-block; max-width: 50em;">Video recorded during this session is stored in your browser.</span></p>

    <p><button id="video-button">Fetch video</button></p>

    <p>&nbsp;</p>
</div>

<script type="text/javascript" src="<?JS= config.client + "libs/sha512-es.min.js" ?>"></script>
<script type="text/javascript">(function() {
    const videoBox = document.getElementById("video-box");
    var fs = new URL(<?JS= JSON.stringify(config.client + "fs/") ?>);
    var ifr = document.createElement("iframe");
    ifr.style.display = "none";
    ifr.src = fs.toString();

    var mp, keys, backends, backendsReceived;

    window.addEventListener("message", function(ev) {
        if (ev.origin !== fs.origin)
            return;
        switch (ev.data.c) {
            case "ennuicastr-file-storage-transient-activation":
                // Need transient activation for storage
                Object.assign(videoBox.style, {
                    display: "",
                    visibility: ""
                });
                Object.assign(ifr.style, {
                    display: "",
                    visibility: "",
                    width: ev.data.btn.w + "px",
                    height: ev.data.btn.h + "px",
                    margin: "auto"
                });
                break;

            case "ennuicastr-file-storage":
                // Communication port
                ifr.style.display = "none";
                videoBox.style.display = "none";
                keys = {};
                backends = ev.data.backends || {local: true};
                backendsReceived = {};
                mp = ev.data.port;
                mp.onmessage = onmessage;
                mp.postMessage({c: "ennuicastr-file-storage"});
                break;
        }
    });

    var files = {};
    document.getElementById("video-button").onclick = function() {
        for (var fileId in files)
            files[fileId].downloader();
    };

    function maybeShowDownloader(ctx) {
        backendsReceived[ctx] = true;
        var haveFiles = false;
        for (var fileId in files) {
            haveFiles = true;
            break;
        }
        if (!haveFiles)
            return;
        for (var backend in backends) {
            if (!backends[backend])
                continue;
            if (!backendsReceived[backend])
                return;
        }
        videoBox.style.display = "";
        videoBox.style.visibility = "";
    }

    function onmessage(ev) {
        var msg = ev.data;
        switch (msg.c) {
            case "salt":
                var hash = window["sha512-es"].default.hash;
                var key = keys[msg.ctx] = hash(hash(
                    <?= JSON.stringify(rid + ":" + recInfo.key + ":" + recInfo.master) ?> +
                    ":" + msg.global) +
                    ":" + msg.local);
                mp.postMessage({c: "list", ctx: msg.ctx, key: key});
                break;

            case "list":
                for (var i = 0; i < msg.files.length; i++) (function(i) {
                    var file = msg.files[i];

                    function downloader() {
                        mp.postMessage({
                            c: "download",
                            ctx: msg.ctx,
                            id: file.id,
                            key: keys[msg.ctx]
                        });
                    }

                    file.downloader = downloader;
                    file.ctx = msg.ctx;
                    var fileId = file.fileId + ":" + file.name + ":" + file.track;
                    if (fileId in files) {
                        var oldFile = files[fileId];
                        // Maybe replace it
                        if (file.ctx === "fsdh" ||
                            (file.ctx === "remote" && oldFile.ctx === "local")) {
                            files[fileId] = file;
                        }
                    } else {
                        files[fileId] = file;
                    }
                })(i);
                maybeShowDownloader(msg.ctx);
                break;
        }
    }

    document.body.appendChild(ifr);
})();</script>

