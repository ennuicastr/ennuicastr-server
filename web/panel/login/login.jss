<?JS!
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

const util = require("util");

const edb = require("../db.js");
const db = edb.db;
const log = edb.log;

function genUID() {
    function genPart() {
        return Math.random().toString(36).slice(2);
    }
    return genPart() + genPart() + genPart();
}

async function getUID(login) {
    var uid, newUID = false;
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");
            var row = await db.getP("SELECT uid FROM users WHERE login=@LOGIN;", {"@LOGIN": login});
            if (row) {
                // Already registered
                uid = row.uid;
                await db.runP("COMMIT;");
                break;
            }

            // Not already registered
            uid = genUID();
            await db.runP("INSERT INTO users (uid, login) VALUES (@UID, @LOGIN);", {"@UID": uid, "@LOGIN": login});
            await db.runP("COMMIT;");
            newUID = true;
            break;
        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    if (newUID) {
        // Log it
        log("new-account", login, {uid});
    }

    return uid;
}

async function setEmail(uid, email) {
    var newEmail = false;
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");
            var row = await db.getP("SELECT email FROM emails WHERE uid=@UID;", {"@UID": uid});
            if (row && row.email === email) {
                // Email already set
                await db.runP("COMMIT;");
                break;
            }

            // Add or replace what's there
            await db.runP("DELETE FROM emails WHERE uid=@UID;", {"@UID": uid});
            await db.runP("INSERT INTO emails (uid, email) VALUES (@UID, @EMAIL);", {
                "@UID": uid,
                "@EMAIL": email
            });
            await db.runP("COMMIT;");
            newEmail = true;
            break;
        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    if (newEmail) {
        // Log it
        log("new-email", email, {uid});
    }
}

async function login(login, email) {
    var uid = await getUID(login);
    await session.set("uid", uid);
    await session.set("login", login);

    if (email)
        await setEmail(uid, email);

    return uid;
}

module.exports = {getUID, setEmail, login};
?>
