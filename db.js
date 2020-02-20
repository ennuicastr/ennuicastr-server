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

/* Database access functions */

const util = require("util");
const sqlite3 = require("sqlite3");
const config = require("./config.js");
const db = new sqlite3.Database(config.db + "/ennuicastr.db");
const logdb = new sqlite3.Database(config.db + "/log.db");

["run", "get", "all"].forEach((x) => {
    db[x + "P"] = util.promisify(db[x].bind(db));
    logdb[x + "P"] = util.promisify(logdb[x].bind(logdb));
});

const logStmtA = logdb.prepare(
    "INSERT INTO log (time, type, uid, rid, details) " +
    "VALUES (strftime('%Y-%m-%d %H:%M:%f', @TIME), @TYPE, @UID, @RID, @DETAILS);"
);
const logStmt = util.promisify(logStmtA.run.bind(logStmtA));

/**
 * Log this interaction.
 * @param {string} type         The basic type of interaction
 * @param {string} details      Details on the interaction, not in any specific format
 * @param {Object} extra        Extra details, such as the uid and rid
 */
async function log(type, details, extra) {
    var vals = {
        "@TIME": new Date().toISOString(),
        "@TYPE": type,
        "@DETAILS": details
    };

    if (typeof extra === "undefined")
        extra = {};

    extra.uid = (extra.uid || "");
    extra.rid = (extra.rid || -1);

    vals["@UID"] = extra.uid;
    vals["@RID"] = extra.rid;

    // Insert
    while (true) {
        try {
            await logStmt(vals);
            break;
        } catch (ex) {}
    }
}

module.exports = {db, logdb, log};
