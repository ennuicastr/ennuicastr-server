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

const sqlite3 = require("sqlite3");
const db = require("./db.js").logdb;

var when;
if (process.argv[2] === "all") {
    when = "";
} else {
    when = " WHERE time >= datetime('now', '-" + (process.argv[2]||"7 days") + "')";
}

db.all("SELECT * FROM log" + when + " ORDER BY time ASC;", function(err, rows) {
    rows.forEach((row) => {
        var line = row.time + " " + row.type;
        if (row.uid)
            line += " U" + row.uid;
        if (row.rid >= 0)
            line += " R" + row.rid;
        line += ": " + (row.details+"").replace(/[\x00-\x1F\u007F-\uFFFF]/g, "_");
        process.stdout.write(line + "\n");
    });
});
