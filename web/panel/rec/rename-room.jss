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

const uid = await include("../uid.jss");
if (!uid) return;

const config = require("../config.js");
const db = require("../db.js").db;

function fail(msg) {
    writeHead(500, {"content-type": "application/json"});
    if (msg) write(JSON.stringify(msg));
}

if (typeof request.body !== "object" ||
    request.body === null)
    return fail();

if (typeof request.body.i !== "string" ||
    typeof request.body.n !== "string")
    return fail(); // Invalid request

let lids = null;
try {
    lids = parseInt(request.body.i, 36);
} catch (ex) {}
if (lids === null) return fail();
const lid = lids;
const name = request.body.n.slice(0, config.limits.recNameLength);

while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        let lobby = await db.getP("SELECT * FROM lobbies2 WHERE uid=@UID AND lid=@LID;", {
            "@UID": uid,
            "@LID": lid
        });
        if (!lobby) {
            // Illegal!
            await db.runP("ROLLBACK;");
            return fail({error: "Unowned room"});
        }

        await db.runP("UPDATE lobbies2 SET name=@NAME WHERE uid=@UID AND lid=@LID;", {
            "@UID": uid,
            "@LID": lid,
            "@NAME": name
        });

        await db.runP("COMMIT;");
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");

    }
}

// Done
writeHead(200, {"content-type": "application/json"});
write(JSON.stringify({lid: lid, name: name}));
?>
