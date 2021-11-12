<?JS
/*
 * Copyright (c) 2020 Yahweasel
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

const uid = await include("../../uid.jss");
if (!uid) return;

const fs = require("fs");

const config = require("../config.js");
const db = require("../db.js").db;
const recM = require("../rec.js");
const reclib = await include("../lib.jss");

if (!request.query.i) {
    // Delete nothing?
    return writeHead(302, {"location": "/panel/rec/"});
}

// Get the recording to be deleted
const rid = Number.parseInt(request.query.i, 36);
const rec = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
if (!rec || rec.uid !== uid || rec.status < 0x30) {
    // Not allowed or not valid
    return writeHead(302, {"location": "/panel/rec/"});
}

// OK, we've got something to delete
await include ("../../head.jss", {title: "Delete"});

if (request.query.sure) {
    // OK, delete it then!
    if (!(await recM.del(rid, uid)))
        return writeHead(302, {"location": "/panel/rec/"});

?>
<section class="wrapper special">
    <p>Recording deleted!</p>

    <a href="/panel/rec/">Return to recordings</a>
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
                    <?= JSON.stringify(rid + ":" + rec.key + ":" + rec.master) ?> +
                    ":" + msg.global) +
                    ":" + msg.local);
                mp.postMessage({c: "list", key: key});
                break;

            case "list":
                var files = msg.files;
                for (var i = 0; i < files.length; i++)
                    mp.postMessage({c: "delete", id: files[i].id, key: key});
                break;
        }
    }

    document.body.appendChild(ifr);
})();</script>

<?JS

} else {
?>

<section class="wrapper special">
    <header><h2>Delete <?JS= rec.name || "(Anonymous)" ?></h2></header>

    <p>This will <em>permanently</em>, <em>irreversibly</em> delete the following recording:</p>

    <p><?JS= reclib.recordingName(rec) ?></p>

    <p>Are you sure?</p>

    <p>
    <a class="button" href="/panel/rec/delete/?i=<?JS= rid.toString(36) ?>&amp;sure=yes">Yes, delete it</a>
    <a class="button" href="/panel/rec/">No, cancel</a>
    </p>
</section>

<?JS
}

await include("../../../tail.jss");
?>
