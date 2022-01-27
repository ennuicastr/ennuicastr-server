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

const uidX = await include("../uid.jss", {verbose: true});
if (!uidX) return;
const {ruid, euid, uid} = uidX;

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const unM = require("../username.js");

// Set it if asked
if (request.query.u && uidX.level >= 2 /* admin */) {
    const username = request.query.u
        .replace(/[^\p{Letter}\p{Number}\p{Punctuation} _-]/gu, "_")
        .trim() || "_";
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            // If this is an organization, permission is required
            if (euid && euid !== ruid) {
                const share = await db.runP(
                    `SELECT * FROM user_share WHERE
                        uid_shared=@OID AND
                        uid_target=@UID;`, {
                    "@OID": euid,
                    "@UID": ruid
                });
                if (!share || share.level < 2 /* admin */) {
                    await db.runP("ROLLBACK;");
                    break;
                }
            }

            // OK, change it
            await db.runP(
                `INSERT OR REPLACE INTO usernames
                    ( uid,  username)
                VALUES
                    (@UID, @USERNAME);`, {
                "@UID": uid,
                "@USERNAME": username
            });

            await db.runP("COMMIT;");
            break;

        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    // Redirect if asked
    if (request.query.c)
        return writeHead(302, {"location": request.query.c});
}

const username = await unM.getUsername(uid);
const display = await unM.getDisplay(uid);

const cont = request.query.c;

await include("../head.jss", {title: "Username"});
?>

<section class="wrapper special">
    <?JS if (request.query.u) { ?>
    <p>Username set</p>
    <?JS } ?>

    <?JS if (euid && euid !== ruid) { ?>
    <p>You are currently logged in as an organization. This information relates to the organization's name, not your user account's name. To see your user account's name, <a href="/panel/org/">log out of the organization</a>.</p>
    <?JS } ?>

    <?JS if (username) { ?>
    <p>Your current username is <?JS= display ?>.</p>
    <?JS } ?>

    <?JS if (uidX.level >= 2 /* admin */) { ?>
    <p>Please choose a username to be known by when you share recordings, rooms, or organization accounts with other users.</p>

    <form method="GET" action="/panel/username/">
        <?JS if (cont) { ?>
        <input type="hidden" name="c" value="<?JS=
            cont
                .replace(/\&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
        ?>" />
        <?JS } ?>

        <input type="text" name="u" id="username" value="<?JS= username ? username : "" ?>" />

        <input type="submit" value="Set username" />
    </form>

    <script type="text/javascript">
        $("#username")[0].select();
    </script>
    <?JS } ?>
</section>

<?JS
await include("../../tail.jss");
?>
