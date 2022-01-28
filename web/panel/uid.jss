<?JS!
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

const config = (arguments[1] || {});

/* UIDs are stored in the (server-side) session database. A user may have two
 * UIDs, because they may be sharing an account. uid is the UID that they
 * actually logged in with, while euid is their current effective UID. */
await session.init();
let uid = await session.get("uid");
let euid = await session.get("euid");
let level = 0;

const db = require("../db.js").db;

// Check that the UID is valid
let row;
if (uid)
    row = await db.getP("SELECT * FROM users WHERE uid=@UID;", {"@UID": uid});

if ((!uid || !row) && !config.noRedirect) {
    // Throw them to the login page
    writeHead(302, {"location": "/panel/login/"});
}

/* If there's a secondary UID (organization login), check that it's valid and
 * that this UID has access to it */
if (euid) {
    let org = null, share = null;

    if (uid && row) {
        org = await db.getP(
            "SELECT * FROM users WHERE uid=@UID;", {"@UID": euid});
        share = await db.getP(
            `SELECT * FROM user_share WHERE
                uid_shared=@UIDS AND
                uid_target=@UIDT;`, {
            "@UIDS": euid,
            "@UIDT": uid
        });
    }

    if (org && share) {
        level = share.level;

    } else {
        await session.delete("euid");
        euid = null;

    }

} else {
    level = 3;

}

await session.set("uid", uid);
if (euid)
    await session.set("euid", euid);

if (!uid) {
    module.exports = null;

} else if (config.verbose) {
    module.exports = {
        ruid: uid,
        euid,
        uid: euid || uid,
        level
    };

} else {
    module.exports = euid || uid;

}
?>
