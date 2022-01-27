<?JS
/*
 * Copyright (c) 2022 Yahweasel
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

const uidX = await include("../../uid.jss", {verbose: true});
if (!uidX) return;
if (uidX.level < 2 /* admin */)
    return writeHead(302, {"location": "/panel/rec/"});
const uid = uidX.uid;

if (!request.query.i)
    return writeHead(302, {"location": "/panel/rec/"});

const lid = Number.parseInt(request.query.i, 36);
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

const lobby = await db.getP("SELECT * FROM lobbies2 WHERE lid=@LID;", {
    "@LID": lid
});
if (!lobby)
    return writeHead(302, {"location": "/panel/rec/"});

if (mode === "share") {
    // This means we're sharing, so make sure only the owner can share
    if (lobby.uid !== uid)
        return writeHead(302, {"location": "/panel/rec/"});

} else if (mode === "receiving") {
    // Check if the token is valid
    const now = await db.getP("SELECT datetime('now') AS now;");
    let exp = null;
    try {
        const config = JSON.parse(lobby.config);
        exp = config.shareTokens[request.query.t];
    } catch (ex) {}
    if (!exp || exp < now.now)
        return writeHead(302, {"location": "/panel/rec/"});

    // The rest we do later

} else if (mode === "unshare" || mode === "unshare-sure") {
    // Make sure it's currently shared with them
    const share = await db.getP(
        `SELECT * FROM lobby_share WHERE
            lid=@LID AND
            uid_from=@UIDF AND
            uid_to=@UIDT;`, {
        "@LID": lid,
        "@UIDF": lobby.uid,
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
    <header><h2>Sharing <?JS= lobby.name || "(Anonymous)" ?></h2></header>

    <p>You may share this room with other Ennuicastr users. They will be able to start recordings in the room and download any recordings made in the room (even if they didn't start them). They may not delete any recordings started in the room.</p>

    <script type="text/javascript">
    function shareLobby() {
        var btn = $("#share-button")[0];
        btn.classList.add("disabled");
        btn.disabled = true;

        fetch("/panel/rec/share-room/share.jss", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({i: <?JS= lid ?>})

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

    <p><button id="share-button" onclick="shareLobby();"><i class="fas fa-share-square"></i> Share room</button></p>

    <p id="share-hider" style="display: none">
        One-time use URL, expires in 24 hours:<br/>
        <input type="text" id="share-box" readonly style="width: 100%" />
    </p>

    <?JS

} else if (mode === "receiving") {
    // Receiving a sharing URL, so share
    ?><header><h2>Sharing <?JS= lobby.name || "(Anonymous)" ?></h2></header><?JS

    const token = request.query.t;
    if (lobby.uid === uid) {
        // ???
        ?><p>You don't really need to share a room with yourself, you know!</p><?JS

    } else {
        // OK, share it
        let success = false;
        while (true) {
            try {
                await db.runP("BEGIN TRANSACTION;");

                // 1: Get the up-to-date lobby info
                const lobby2 = await db.getP(
                    "SELECT * FROM lobbies2 WHERE lid=@LID AND uid=@UID;", {
                    "@LID": lid,
                    "@UID": lobby.uid
                });
                if (!lobby2) {
                    await db.runP("ROLLBACK;");
                    break;
                }

                // 2: Check that the token is still valid
                const now = await db.runP("SELECT datetime('now') AS now;");
                const config = JSON.parse(lobby2.config);
                if (config.shareTokens[token] < now) {
                    await db.runP("ROLLBACK;");
                    break;
                }

                // 3: Remove it
                delete config.shareTokens[token];
                await db.runP(
                    "UPDATE lobbies2 SET config=@CONFIG WHERE lid=@LID AND uid=@UID;", {
                    "@CONFIG": JSON.stringify(config),
                    "@LID": lid,
                    "@UID": lobby.uid
                });

                // 4: Check if this sharing is already done
                const share = await db.getP(
                    `SELECT * FROM lobby_share WHERE
                    lid=@LID AND uid_from=@UIDF AND uid_to=@UIDT;`, {
                    "@LID": lid,
                    "@UIDF": lobby.uid,
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
                    `INSERT INTO lobby_share
                        ( lid,  uid_from,  uid_to)
                    VALUES
                        (@LID, @UIDF,     @UIDT);`, {
                    "@LID": lid,
                    "@UIDF": lobby.uid,
                    "@UIDT": uid
                });

                await db.runP("COMMIT;");
                success = true;
                break;

            } catch (ex) {
                await db.runP("ROLLBACK;");

            }
        }

        if (success) {
            log("lobby-shared", JSON.stringify({otherUid: uid}),
                {uid: lobby.uid, rid: lid});

            ?>
            <p>You now have access to the room <?JS= lobby.name || "(Anonymous)" ?>.</p>
        <?JS } else { ?>
            <p>Sharing failed!</p>

        <?JS }

    }

} else if (mode === "unshare") {
    ?>
    <header><h2>Unsharing <?JS= lobby.name || "(Anonymous)" ?></h2></header>

    <p>This will <em>remove</em> your access to the room <?JS= lobby.name || "(Anonymous)" ?>. Are you sure?</p>

    <p>
    <a class="button" href="/panel/rec/share-room/?i=<?JS= lid.toString(36) ?>&amp;un=1&amp;sure=yes">Yes, remove it</a>
    <a class="button" href="/panel/rec/">No, cancel</a>
    </p>
    <?JS

} else if (mode === "unshare-sure") {
    // Remove it
    while (true) {
        try {
            await db.runP(
                `DELETE FROM lobby_share WHERE
                    lid=@LID AND
                    uid_from=@UIDF AND
                    uid_to=@UIDT;`, {
                "@LID": lid,
                "@UIDF": lobby.uid,
                "@UIDT": uid
            });
            break;
        } catch (ex) {}
    }

    log("lobby-unshared", JSON.stringify({otherUid: uid}),
        {uid: lobby.uid, rid: lid});

    ?>
    <header><h2>Unsharing <?JS= lobby.name || "(Anonymous)" ?></h2></header>

    <p>Room removed!</p>
    <?JS

} else throw new Error();
?>

    <p><a href="/panel/rec/">Return to recordings</a></p>
</section>

<?JS
await include("../../../tail.jss");
?>
