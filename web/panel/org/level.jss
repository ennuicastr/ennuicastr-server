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

function fail(msg) {
    writeHead(500, {"content-type": "application/json"});
    write(JSON.stringify({error: msg}));
}

// Need an OID to target
if (!request.body || request.body.oid !== uidX.euid)
    return fail("Invalid request");
const oid = request.body.oid;

// Need someone to modify
if (!request.body.uid || !request.body.level)
    return fail("No user specified");
const target = request.body.uid;
const targetLevel = ~~request.body.level;
if (targetLevel < 1 /* member */ || targetLevel >= 3 /* owner */) {
    // Invalid
    return fail("Invalid level");
}

const db = require("../db.js").db;

// Perform the database tomfoolery
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        // Get their current level
        const shareTarget = await db.getP("SELECT * FROM user_share WHERE uid_shared=@OID AND uid_target=@UID;", {
            "@OID": oid,
            "@UID": target
        });
        if (!shareTarget) {
            await db.runP("ROLLBACK;");
            return fail("Invalid user");
        }

        // Make sure they're not the owner
        if (shareTarget.level >= 3) {
            await db.runP("ROLLBACK;");
            return fail("Invalid user");
        }

        // Get the source too
        const shareSource = await db.getP("SELECT * FROM user_share WHERE uid_shared=@OID AND uid_target=@UID;", {
            "@OID": oid,
            "@UID": uidX.ruid
        });
        if (!shareSource || shareSource.level < 2) {
            await db.runP("ROLLBACK;");
            return fail("Invalid action");
        }

        // Make the change
        await db.runP(
            `UPDATE user_share
                SET level=@LEVEL
                WHERE uid_shared=@OID and uid_target=@UID;`, {
            "@LEVEL": targetLevel,
            "@OID": oid,
            "@UID": target
        });

        await db.runP("COMMIT;");
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");
    }
}

// Acknowledge
writeHead(200, {"content-type": "application/json"});
write(JSON.stringify({oid, uid: target, level: targetLevel}));
?>
