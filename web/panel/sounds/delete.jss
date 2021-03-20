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

const uid = await include("../uid.jss");
if (!uid) return;

const fs = require("fs");
const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;

function fail(msg) {
    writeHead(500, {"content-type": "application/json"});
    if (msg) write(JSON.stringify(msg));
}

if (typeof request.body !== "object" ||
    request.body === null)
    return fail();

// Get the request into the correct format
var req = request.body;
if (typeof req.s !== "string")
    return fail();
var sid = req.s.replace(/[^a-z0-9]/g, "_");

// Make sure they own this sound
var row = await db.getP("SELECT * FROM sounds WHERE uid=@UID AND sid=@SID;", {
    "@UID": uid,
    "@SID": sid
});
if (!row) return fail();

// Unlink the files
["webm", "m4a"].forEach(function(format) {
    try {
        fs.unlinkSync(config.sounds + "/" + sid + "." + format);
    } catch (ex) {}
});

// Delete the DB entry
while (true) {
    try {
        await db.runP("DELETE FROM sounds WHERE uid=@UID AND sid=@SID;", {
            "@UID": uid,
            "@SID": sid
        });
        break;

    } catch (ex) {}
}

log("sound-delete", "", {uid, sid});
writeHead(200, {"content-type": "application/json"});
write("{}");
?>
