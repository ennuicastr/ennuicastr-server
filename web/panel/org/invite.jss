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

function fail(msg) {
    writeHead(500, {"content-type": "application/json"});
    write(JSON.stringify({
        fail: msg || "Failed"
    }));
}

const uidX = await include("../uid.jss", {verbose: true});
if (!uidX) return;
const uid = uidX.ruid;
const euid = uidX.euid;
if (!euid || uid === euid) return fail("Not logged into an organization");

const config = require("../config.js");
const db = require("../db.js").db;
const id36 = require("../id36.js");

const org = await db.getP(
    "SELECT * FROM user_share WHERE uid_shared=@OID AND uid_target=@UID;", {
    "@OID": euid,
    "@UID": uid
});
if (!org || org.level < 2 /* admin */)
    return fail("Not allowed");

// OK, this user is allowed to share this organization, so do so
let token;
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        const org = await db.getP(
            "SELECT * FROM users WHERE uid=@OID;", {
            "@OID": euid
        });
        if (!org)
            return fail("Organization deleted");

        const invites = await db.allP(
            "SELECT * FROM user_share_key WHERE uid_shared=@OID;", {
            "@OID": euid
        });

        // Create a share token
        token = id36.genID(12);

        // No more than 8 share tokens at a time
        while (invites.length > 7) {
            let earliestIdx = -1;
            let earliestTime = "9999";
            let earliestToken = "";
            for (let idx = 0; idx < invites.length; idx++) {
                const invite = invites[idx];
                if (invite.expiry < earliestTime) {
                    earliestIdx = idx;
                    earliestTime = invite.expiry;
                    earliestToken = invite.key;
                }
            }
            await db.runP(
                "DELETE FROM user_share_key WHERE key=@KEY;", {
                "@KEY": earliestToken
            });
            invites.splice(earliestIdx, 1);
        }

        // Add this token
        await db.runP(
            `INSERT INTO user_share_key
                ( key,  uid_shared,  expiry)
            VALUES
                (@KEY, @UIDS,       datetime('now', '1 day'));`, {
            "@KEY": token,
            "@UIDS": euid
        });

        await db.runP("COMMIT;");
        break;
    } catch (ex) {
        await db.runP("ROLLBACK;");
    }
}

writeHead(200, {"content-type": "application/json"});
write(JSON.stringify({
    token,
    url: `${config.panel}org/?t=${token}`
}));
?>
