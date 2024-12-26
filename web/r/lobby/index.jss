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

const db = require("../db.js").db;
const recM = require("../rec.js");

function fail(msg) {
    writeHead(500, {"content-type": "application/json"});
    if (msg) write(JSON.stringify(msg));
}

// Figure out the request
const b = request.body;

if (typeof b !== "object" ||
    b === null ||
    typeof b.lid !== "number" ||
    typeof b.key !== "number")
    return fail();

let haveMaster = (typeof b.master === "number");

// Look for it
const lobby = await db.getP("SELECT * FROM lobbies2 WHERE lid=@LID;", {"@LID": b.lid});
if (!lobby) return fail({error: "No such room"});

// Check the key
if (b.key !== lobby.key)
    return fail({error: "No such room"});

// Check the master key, if applicable
if (haveMaster && b.master !== lobby.master)
    return fail({error: "No such room"});

// Look for the associated recording
let rec = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": lobby.rid});
if (rec && rec.status >= 0x30 /* finished */)
    rec = null;

if (!rec) {
    // OK, create the recording
    rec = JSON.parse(lobby.config);
    rec = await recM.rec(rec, {lid: b.lid});
}

if (!rec) {
    // No recording available!
    return fail({error: "Internal error"});
}

// Just give as much as they need
const ret = {
    id: rec.rid,
    port: rec.port,
    key: rec.key
};
if (haveMaster)
    ret.master = rec.master;

writeHead(200, {"content-type": "application/json"});
write(JSON.stringify(ret));

?>
