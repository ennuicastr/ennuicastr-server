<?JS
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

// Get all the info and make sure it's correct
const uid = await include("../../uid.jss");
if (!uid) return;

if (!request.query.i)
    return writeHead(302, {"location": "/panel/rec/"});

const rid = Number.parseInt(request.query.i, 36);

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const payment = require("../payment.js");
const reclib = await include("../lib.jss");
const recM = require("../rec.js");
const credits = require("../credits.js");
const creditsj = await include("../../credits.jss");

const recInfo = await recM.get(rid, uid);
if (!recInfo)
    return writeHead(302, {"location": "/panel/rec/"});
let recInfoExtra = null;
try {
    recInfoExtra = JSON.parse(recInfo.extra);
} catch (ex) {}

const accountCredits = await creditsj.accountCredits(uid);
const preferredGateway = await payment.preferredGateway(uid);

if (!recInfo.purchased)
    return writeHead(302, {"location": "/panel/rec/dl/?i=" + rid.toString(36)});

const dlName = (function() {
    if (recInfo.name)
        return recInfo.name;
    else
        return rid.toString(36);
})();

const safeName = dlName.replace(/[^A-Za-z0-9]/g, "_");

// Show the downloader
await include("../../head.jss", {title: "Download"});
?>

<script type="text/javascript" src="<?JS= config.client ?>ecloader.min.js"></script>
<script type="text/javascript" src="ennuicastr-download-processor.min.js"></script>

<section class="wrapper special">
    <p><?JS= reclib.recordingName(recInfo) ?></p>

    <?JS if (recInfo.end) { ?>
    <p>Recording duration: <?JS {
        const start = new Date(recInfo.start);
        const end = new Date(recInfo.end);
        const dur = end.getTime() - start.getTime();
        let m = Math.round(dur / 60000);
        let h = Math.floor(m / 60);
        m -= h * 60;
        if (h) {
            write(`${h} hour`);
            if (h !== 1)
                write("s");
        }
        write(` ${m} minute`);
        if (m !== 1)
            write("s");
    } ?><br/>
    <span style="font-size: 0.8em">
    (NOTE: This duration will be incorrect if you paused during recording)
    </span></p>
    <?JS } ?>

    <link rel="stylesheet" href="ennuicastr-download-chooser.css" />

    <div id="downloader-box" class="ecdl-main">Loading...</div>

    <script type="text/javascript" src="ennuicastr-download-chooser.js"></script>

<script type="text/javascript">
EnnuicastrDownloadProcessor.dsLoad({prefix: "/"}).then(function() {
    LibAV = {base: "/assets/libav"};
    return ecLoadLibrary({
        name: "Audio processing",
        file: "/assets/libav/libav-4.8.6.0.1-ecdl.js"
    });
}).then(function() {
    return ecLoadLibrary({
        name: "Processing",
        file: "/assets/js/localforage.min.js"
    });
}).then(function() {
    LibSpecBleach = {base: "/assets/libs"};
    return ecLoadLibrary({
        name: "Audio processing",
        file: "/assets/libs/libspecbleach-0.1.7-js2.js"
    });
}).then(function() {
    return ecLoadLibrary({
        name: "Processing",
        file: "/assets/libs/yalap-1.0.1-zip.js"
    });
}).then(function() {

    // Get the metadata for this recording
    return fetch("../dl/?i=<?JS= rid.toString(36) ?>&f=info");
}).then(function(resp) {
    return resp.json();
}).then(function(ret) {
    dlChooser(
        <?JS= rid ?>, <?JS= JSON.stringify(safeName) ?>, ret,
        document.getElementById("downloader-box")
    );
}).catch(function() {
    document.location.href = "../dl/?i=<?JS= rid.toString(36) ?>&nox=1";
});
</script>

</section>

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

<?JS
await include("../../../tail.jss");
?>
