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

const fs = require("fs");

const config = require("../config.js");
const db = require("../db.js").db;

function fail(msg) {
    writeHead(404);
    write("404: " + msg);
}

if (!request.query.sid || !request.query.f)
    return fail("Invalid sid");

var sid = request.query.sid.replace(/[^a-z0-9]/g, "_");

var row = await db.getP("SELECT * FROM sounds WHERE uid=@UID AND sid=@SID;", {
    "@UID": uid,
    "@SID": sid
});
if (!row)
    return fail("Invalid sid");

// Choose the format
var format = (request.query.f === "aac") ? "m4a" : "webm";

var ct = (format === "m4a") ?
    "audio/mp4;codecs=m4a.40" :
    "audio/webm;codecs=opus";

// Send it
var data;
try {
    data = fs.readFileSync(config.sounds + "/" + sid + "." + format);
} catch (ex) {
    return fail("Invalid audio");
}
response.setHeader("content-type", ct);
response.setHeader("content-length", data.length);
response.compress(null);
write(data);

?>
