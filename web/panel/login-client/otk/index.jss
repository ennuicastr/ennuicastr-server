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

const uid = await include("../../uid.jss");
if (!uid) return;

const db = require("../db.js").db;
const id36 = require("../id36.js");

// Create a one-time key for them
let otk;
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");
        await db.runP("DELETE FROM otk WHERE uid=@UID;", {
            "@UID": uid
        });

        otk = id36.genID(12);
        await db.runP("INSERT INTO otk (uid, otk, expiry) VALUES (" +
            "@UID, @OTK, datetime('now', '1 hour'));", {
            "@UID": uid,
            "@OTK": otk
        });

        await db.runP("COMMIT;");
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");

    }
}

await include("../../head.jss", {title: "Client login"});
?>

<section class="wrapper special">
    <p>Your one-time key is:</p>

    <p style="font-size: 2em"><?JS= otk ?></p>

    <p>Copy it into the client to log in.</p>

    <p><a href="/">Return to home page</a></p>
</section>

<?JS
await include("../../tail.jss");
?>
