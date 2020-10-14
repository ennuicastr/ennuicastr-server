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

const net = require("net");
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
if (typeof req.l !== "string")
    return fail();

// Delete the lobby
while (true) {
    try {
        await db.runP("DELETE FROM lobbies WHERE uid=@UID AND lid=@LID;", {
            "@UID": uid,
            "@LID": req.l
        });
        break;

    } catch (ex) {}
}

// Inform the server sock
var sock = net.createConnection(config.sock);
await new Promise(function(res, rej) {
    var done = false;
    sock.on("data", () => {
        if (!done) {
            done = true;
            res();
        }
    });
    sock.on("close", () => {
        if (!done) {
            done = true;
            rej();
        }
    });
    sock.on("error", rej);
    sock.write(JSON.stringify({c: "lobby-update", l: req.l}) + "\n");
});

// Now it's ready
log("lobby-delete", "", {uid, lid: req.l});
writeHead(200, {"content-type": "application/json"});
write("{}");
?>
