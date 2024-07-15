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

<div id="video-box" style="visibility: hidden;">
    <header><h3>Video</h3></header>

    <div id="video-dl-box" style="display: none;">
        <p><span style="display: inline-block; max-width: 50em;">Video recorded during this session is stored in your browser.</span></p>

        <p><button id="video-button">Fetch video</button></p>
    </div>

    <iframe id="video-dl-iframe" style="visibility: hidden;"></iframe>

    <p>&nbsp;</p>
</div>

<script type="text/javascript" src="<?JS= config.client + "libs/sha512-es.min.js" ?>"></script>
<script type="text/javascript">(function() {
    var fs = new URL(<?JS= JSON.stringify(config.client + "fs/") ?>);
    var videoBox = document.getElementById("video-box");
    var videoDLBox = document.getElementById("video-dl-box");
    var ifr = document.getElementById("video-dl-iframe");
    ifr.src = fs.toString();

    var mp, key;

    window.addEventListener("message", function(ev) {
        if (ev.origin !== fs.origin || !ev.data)
            return;
        switch (ev.data.c) {
            case "ennuicastr-file-storage-remote":
                // Need to log in for remote file storage
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

            case "ennuicastr-file-storage-remote-login":
                ifr.style.display = "none";
                videoBox.style.display = videoDLBox.style.display;
                break;

            case "ennuicastr-file-storage":
                // Communication port
                mp = ev.data.port;
                mp.onmessage = onmessage;
                mp.postMessage({c: "ennuicastr-file-storage"});
                break;
        }
    });

    var downloaders = [];
    document.getElementById("video-button").onclick = function() {
        downloaders.forEach(function(downloader) { downloader(); });
    };

    function onmessage(ev) {
        var msg = ev.data;
        switch (msg.c) {
            case "salt":
                var hash = window["sha512-es"].default.hash;
                key = hash(hash(
                    <?= JSON.stringify(rid + ":" + recInfo.key + ":" + recInfo.master) ?> +
                    ":" + msg.global) +
                    ":" + msg.local);
                mp.postMessage({c: "list", ctx: msg.ctx, key: key});
                break;

            case "list":
                var files = msg.files;
                if (files.length) {
                    videoBox.style.display = videoDLBox.style.display = "";
                    videoBox.style.visibility = "";
                    downloaders.push(function() {
                        for (var i = 0; i < files.length; i++) {
                            mp.postMessage({
                                c: "download",
                                ctx: msg.ctx,
                                id: files[i].id,
                                key: key
                            });
                        }
                    });
                }
                break;
        }
    }
})();</script>

