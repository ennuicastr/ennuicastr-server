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

// Get all the info and make sure it's correct
const uid = await include("../../uid.jss");
if (!uid) return;

if (!request.query.i)
    return writeHead(302, {"location": "/panel/rec/"});

const rid = Number.parseInt(request.query.i, 36);

const cp = require("child_process");
const config = require("../config.js");
const db = require("../db.js").db;

const recInfo = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
if (recInfo.uid !== uid)
    return writeHead(302, {"location": "/panel/rec/"});

const dlName = (function() {
    if (recInfo.name)
        return recInfo.name.replace(/["\r\n\\]/g, "_");
    else
        return rid.toString(36);
})();

const safeName = dlName.replace(/[^A-Za-z0-9]/g, "_");

function formatToName(format) {
    if (format === "aup")
        return "Audacity project";
    else
        return format.toUpperCase();
}

// Maybe do an actual download
if (request.query.f) {
    var format = "flac", container = "zip", mext = "flac",
        mime = "application/zip";
    switch (request.query.f) {
        case "aup":
            container = "aupzip";
            mext = "aup";
            break;
        case "aac":
            format = mext = "aac";
            break;
    }

    writeHead(200, {
        "content-type": mime,
        "content-disposition": "attachment; filename=\"" + dlName + "." + mext + ".zip\""
    });

    // Give plenty of time
    response.setTimeLimit(1000*60*60*3);

    // Jump through to the actual downloader
    await new Promise(function(resolve) {
        var p = cp.spawn(config.repo + "/cook/cook.sh", [config.rec, safeName, rid, format, container], {
            stdio: ["ignore", "pipe", "ignore"]
        });

        p.stdout.on("data", (chunk) => {
            write(chunk);
        });

        p.stdout.on("end", resolve);
    });

    return;
}

// Show the downloader
await include("../../head.jss", {title: "Download"});
?>

<section class="wrapper special">
    <header><h2>Download <?JS= recInfo.name.replace(/[<>]/g, "") || "(Anonymous)" ?></h2></header>

    <script type="text/javascript"><!--
    function disableDownloads() {
        document.querySelectorAll(".dl").forEach(function(b) {
            b.classList.add("disabled");
        });
    }
    //--></script>

    <?JS
    ["aup", "flac", "aac"].forEach((format) => {
        write("<a class=\"button dl\" href=\"?i=" + recInfo.rid.toString(36) + "&f=" + format + "\" onclick=\"javascript:disableDownloads();\">" +
              formatToName(format) +
              "</a> ");
    });
    ?>
</section>

<?JS
await include("../../../tail.jss");
?>
