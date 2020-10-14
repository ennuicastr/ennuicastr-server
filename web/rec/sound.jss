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

const fs = require("fs");

const config = require("../config.js");
const db = require("../db.js").db;
const id36 = require("../id36.js");

function fail() {
    writeHead(302, {"location": config.site});
}

if (!params.QUERY_STRING)
    fail();

// Get the RID, encoded sound, and format out of the URL
var parts = /^([^-]*)-([^\.]*)\.(.*)$/.exec(params.QUERY_STRING);
if (!parts)
    return fail();
var rid = parseInt(parts[1], 36);
var esid = parts[2];
var format = parts[2];
if (format !== "m4a")
    format = "webm";

// Get the key
var rrow = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
if (!rrow)
    return fail();
var extra = null;
try {
    extra = JSON.parse(rrow.extra);
} catch (ex) {}
if (!extra || !extra.assetKey)
    return fail();

// Decode the sid
var sid = null;
try {
    sid = id36.dec(Buffer.from(esid, "base64"), Buffer.from(extra.assetKey, "binary"));
} catch (ex) {}
if (!sid)
    return fail();

// Get the sound
var srow = await db.getP("SELECT * FROM sounds WHERE uid=@UID AND sid=@SID;", {"@UID": rrow.uid, "@SID": sid});
if (!srow)
    return fail();

var ct = (format === "m4a") ?
    "audio/mp4;codecs=m4a.40" :
    "audio/webm;codecs=opus";

// Send it
var data;
try {
    data = fs.readFileSync(config.sounds + "/" + sid + "." + format);
} catch (ex) {
    return fail();
}
response.setHeader("content-type", ct);
response.setHeader("content-length", data.length);
response.compress(null);
write(data);

?>
