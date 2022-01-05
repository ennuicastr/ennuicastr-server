#!/usr/bin/env node
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

const fs = require("fs");
const info = JSON.parse("{" + fs.readFileSync(process.argv[2] + ".ogg.users", "utf8") + "}");

// First do the userlist
process.stdout.write("Users:\r\n");
for (var i = 1; info[i]; i++)
    process.stdout.write("\t" + info[i].nick + "\r\n");

// Then the metadata
var meta = "";

process.stdin.on("data", (chunk) => {
    meta = meta + chunk.toString();
});

process.stdin.on("end", () => {
    meta = meta.trim().split("\n");
    if (meta.length === 1 && meta[0] === "")
        return;
    process.stdout.write("\r\n\r\nChat:\r\n");
    meta.forEach((line) => {
        var c = JSON.parse(line);
        var t = timeStr(c.t);
        c = c.d;
        if (c.c !== "text")
            return;
        process.stdout.write("\t" + t + " " + c.text + "\r\n");
    });
});

function ext(t) {
    t = t+"";
    if (t.length < 2) return "0" + t;
    return t;
}

function timeStr(t) {
    var s = Math.floor(t / 48000);
    var m = Math.floor(s / 60);
    s = ext(s % 60);
    var h = Math.floor(m / 60);
    m = ext(m % 60);
    return h + ":" + m + ":" + s;
}
