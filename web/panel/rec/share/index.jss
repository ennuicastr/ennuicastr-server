<?JS
/*
 * Copyright (c) 2020-2022 Yahweasel
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

if (!request.query.i)
    return writeHead(302, {"location": "/panel/rec/"});

const rid = Number.parseInt(request.query.i, 36);
const mode = (() => {
    if (request.query.t) {
        // There's a token, so we're receiving a share
        return "receiving";

    } else if (request.query.un) {
        // Request to unshare
        if (request.query.sure) {
            return "unshare-sure";
        } else {
            return "unshare";
        }

    } else {
        // Request to share
        return "share";

    }
})();

const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const id36 = require("../id36.js");
const recM = require("../rec.js");

const rec = await recM.get(rid, uid, {noCheck: true});
if (!rec)
    return writeHead(302, {"location": "/panel/rec/"});

let token = request.query.t;
if (mode === "share") {
    // This means we're sharing, so make sure only the owner can share
    if (rec.uid !== uid)
        return writeHead(302, {"location": "/panel/rec/"});

} else if (mode === "receiving") {
    // Check if the token is valid
    const now = await db.getP("SELECT datetime('now') AS now;");
    let exp = null;
    try {
        const extra = JSON.parse(rec.extra);
        exp = extra.shareTokens[request.query.t];
    } catch (ex) {}
    if (!exp || exp < now.now)
        return writeHead(302, {"location": "/panel/rec/"});

    // The rest we do later

} else if (mode === "unshare" || mode === "unshare-sure") {
    // Make sure it's currently shared with them
    const share = await db.getP(
        `SELECT * FROM recording_share WHERE
            rid=@RID AND
            uid_from=@UIDF AND
            uid_to=@UIDT;`, {
        "@RID": rid,
        "@UIDF": rec.uid,
        "@UIDT": uid
    });
    if (!share)
        return writeHead(302, {"location": "/panel/rec/"});

} else throw new Error();

await include("../../head.jss", {title: "Share"});
?>

<section class="wrapper special">
<?JS
if (mode === "share") {
    // Show the sharing panel
    ?>
    <header><h2>Sharing <?JS= rec.name || "(Anonymous)" ?></h2></header>

    <p>You may share this recording with other Ennuicastr users. They will be able to download the recording or host it if it's still active, but may not delete it.</p>

    <script type="text/javascript">
    function shareRecording() {
        var btn = $("#share-button")[0];
        btn.classList.add("disabled");
        btn.disabled = true;

        fetch("/panel/rec/share/share.jss", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({i: <?JS= rid ?>})

        }).then(function(res) {
            return res.text();

        }).then(function(res) {
            res = JSON.parse(res);

            if (res.fail) {
                alert(res.fail);
                return;
            }

            $("#share-hider")[0].style.display = "";

            var box = $("#share-box")[0];
            box.value = res.url;
            box.select();
            document.execCommand("copy");

            btn.classList.remove("disabled");
            btn.disabled = false;
        });
    }
    </script>

    <p><button id="share-button" onclick="shareRecording();"><i class="fas fa-share-square"></i> Share recording</button></p>

    <p id="share-hider" style="display: none">
        One-time use URL, expires in 24 hours:<br/>
        <input type="text" id="share-box" readonly style="width: 100%" />
    </p>

    <?JS

} else if (mode === "receiving") {
    // Receiving a sharing URL, so share
    ?><header><h2>Sharing <?JS= rec.name || "(Anonymous)" ?></h2></header><?JS

    const token = request.query.t;
    if (rec.uid === uid) {
        // ???
        ?><p>You don't really need to share a recording with yourself, you know!</p><?JS

    } else {
        // OK, share it
        let success = false;
        while (true) {
            try {
                await db.runP("BEGIN TRANSACTION;");

                // 1: Get the up-to-date recording info
                const rec2 = await db.getP(
                    "SELECT * FROM recordings WHERE rid=@RID AND uid=@UID;", {
                    "@RID": rid,
                    "@UID": rec.uid
                });
                if (!rec2) {
                    await db.runP("ROLLBACK;");
                    break;
                }

                // 2: Check that the token is still valid
                const now = await db.runP("SELECT datetime('now') AS now;");
                const extra = JSON.parse(rec2.extra);
                if (extra.shareTokens[token] < now) {
                    await db.runP("ROLLBACK;");
                    break;
                }

                // 3: Remove it
                delete extra.shareTokens[token];
                await db.runP(
                    "UPDATE recordings SET extra=@EXTRA WHERE rid=@RID AND uid=@UID;", {
                    "@EXTRA": JSON.stringify(extra),
                    "@RID": rid,
                    "@UID": rec.uid
                });

                // 4: Check if this sharing is already done
                const share = await db.getP(
                    `SELECT * FROM recording_share WHERE
                    rid=@RID AND uid_from=@UIDF AND uid_to=@UIDT;`, {
                    "@RID": rid,
                    "@UIDF": rec.uid,
                    "@UIDT": uid
                });
                if (share) {
                    // Automatic success!
                    await db.runP("COMMIT;");
                    success = true;
                    break;
                }

                // 5: Add the share
                await db.runP(
                    `INSERT INTO recording_share
                        ( rid,  uid_from,  uid_to)
                    VALUES
                        (@RID, @UIDF,     @UIDT);`, {
                    "@RID": rid,
                    "@UIDF": rec.uid,
                    "@UIDT": uid
                });

                await db.runP("COMMIT;");
                success = true;
                break;

            } catch (ex) {
                await db.runP("ROLLBACK;");

            }
        }

        if (success) { ?>
            <p>You now have access to the recording <?JS= rec.name || "(Anonymous)" ?>.</p>
        <?JS } else { ?>
            <p>Sharing failed!</p>

        <?JS }

    }

} else if (mode === "unshare") {
    ?>
    <header><h2>Unsharing <?JS= rec.name || "(Anonymous)" ?></h2></header>

    <p>This will <em>remove</em> your access to the recording <?JS= rec.name || "(Anonymous)" ?>. Are you sure?</p>

    <p>
    <a class="button" href="/panel/rec/share/?i=<?JS= rid.toString(36) ?>&amp;un=1&amp;sure=yes">Yes, remove it</a>
    <a class="button" href="/panel/rec/">No, cancel</a>
    </p>
    <?JS

} else if (mode === "unshare-sure") {
    // Remove it
    while (true) {
        try {
            await db.runP(
                `DELETE FROM recording_share WHERE
                    rid=@RID AND
                    uid_from=@UIDF AND
                    uid_to=@UIDT;`, {
                "@RID": rid,
                "@UIDF": rec.uid,
                "@UIDT": uid
            });
            break;
        } catch (ex) {}
    }

    ?>
    <header><h2>Unsharing <?JS= rec.name || "(Anonymous)" ?></h2></header>

    <p>Recording removed!</p>
    <?JS

} else throw new Error();
?>

    <p><a href="/panel/rec/">Return to recordings</a></p>
</section>

<?JS
await include("../../../tail.jss");
?>
