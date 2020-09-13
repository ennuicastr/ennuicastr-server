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

const config = require("../config.js");
const db = require("../db.js").db;

function fail(msg) {
    writeHead(500, {"content-type": "application/json"});
    if (msg) write(JSON.stringify(msg));
}

if (typeof request.body !== "object" ||
    request.body === null)
    return fail();

// Check that this user isn't over the simultaneous lobbies limit
var recordings = await db.allP("SELECT lid FROM lobbies WHERE uid=@UID;", {"@UID": uid});
if (recordings.length >= config.limits.lobbies)
    return fail({"error": "You may not have more than " + config.limits.lobbies + " rooms."});

// Get the request into the correct format
var req = request.body;
if (typeof req.n !== "string")
    return fail();

function genLID() {
    // 101559956668416  = 1000000000 in base 36
    // 3554598483394559 = zzzzzzzzzz-1000000000 in base 36
    return Math.floor(Math.random()*3554598483394559+101559956668416).toString(36);
}

// Create the lobby
var lid;
while (true) {
    try {
        lid = genLID();
        await db.runP("INSERT INTO lobbies " +
                      "( uid,  lid,  name,  associated,  rid) VALUES " +
                      "(@UID, @LID, @NAME, @ASSOCIATED, @RID);", {
            "@UID": uid,
            "@LID": lid,
            "@NAME": req.n,
            "@ASSOCIATED": false,
            "@RID": 0
        });
        break;

    } catch (ex) {}
}

// Now it's ready
writeHead(200, {"content-type": "application/json"});
write(JSON.stringify({lid: lid, name: req.n}));
?>
