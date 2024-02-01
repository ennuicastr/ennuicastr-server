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
    var fs = new URL(<?JS= JSON.stringify(config.client + "fs/") ?>);
    var ifr = document.createElement("iframe");
    ifr.style.display = "none";
    ifr.src = fs.toString();

    var mp, key;

    window.addEventListener("message", function(ev) {
        if (ev.origin !== fs.origin)
            return;
        if (typeof ev.data !== "object" || ev.data === null || ev.data.c !== "ennuicastr-file-storage")
            return;
        mp = ev.data.port;
        mp.onmessage = onmessage;
        mp.postMessage({c: "ennuicastr-file-storage"});
    });

    function onmessage(ev) {
        var msg = ev.data;
        switch (msg.c) {
            case "salt":
                var hash = window["sha512-es"].default.hash;
                key = hash(hash(
                    <?= JSON.stringify(rid + ":" + recInfo.key + ":" + recInfo.master) ?> +
                    ":" + msg.global) +
                    ":" + msg.local);
                mp.postMessage({c: "list", key: key});
                break;

            case "list":
                var files = msg.files;
                if (files.length) {
                    document.getElementById("video-box").style.display = "";
                    document.getElementById("video-button").onclick = function() {
                        for (var i = 0; i < files.length; i++)
                            mp.postMessage({c: "download", id: files[i].id, key: key});
                    };
                }
                break;
        }
    }

    document.body.appendChild(ifr);
})();</script>

