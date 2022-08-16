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

await session.init();

const db = require("../db.js").db;

const login = await include("../login.jss");

// Make sure we're an actual login
if (!request.body || !request.body.otk) {
    writeHead(302, {"location": "/panel/login-client/"});
    return;
}
const otk = request.body.otk;

// Find the UID associated with this OTK, and the login associated with the UID
let acct;
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        let row = await db.getP("SELECT uid FROM otk WHERE otk=@OTK AND expiry > datetime('now');", {
            "@OTK": otk
        });
        if (!row) {
            writeHead(302, {"location": "/panel/login-client/"});
            return;
        }
        let uid = row.uid;

        row = await db.getP("SELECT login FROM users WHERE uid=@UID;", {
            "@UID": uid
        });
        if (!row) {
            writeHead(302, {"location": "/panel/login-client/"});
            return;
        }
        acct = row.login;

        await db.runP("DELETE FROM otk WHERE otk=@OTK;", {
            "@OTK": otk
        });

        await db.runP("COMMIT;");
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");

    }
}

// Log in with this account
await login.login(acct);

// Redirect to the panel
writeHead(302, {"location": "/panel/"});
?>
