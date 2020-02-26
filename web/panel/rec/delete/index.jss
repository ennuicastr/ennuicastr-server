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

const fs = require("fs");

const config = require("../config.js");
const db = require("../db.js").db;

if (!request.query.i) {
    // Delete nothing?
    return writeHead(302, {"location": "/panel/rec/"});
}

// Get the recording to be deleted
const rid = Number.parseInt(request.query.i, 36);
const rec = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
if (!rec || rec.uid !== uid || rec.status < 0x30) {
    // Not allowed or not valid
    return writeHead(302, {"location": "/panel/rec/"});
}

// OK, we've got something to delete
await include ("../../head.jss", {title: "Delete"});

if (request.query.sure) {
    // OK, delete it then!

    // Delete the files
    ["header1", "header2", "data", "users", "info"].forEach((footer) => {
        try {
            fs.unlinkSync(config.rec + "/" + rid + ".ogg." + footer);
        } catch (ex) {}
    });

    // Then move the row to old_recordings
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            // Insert the new row
            await db.runP("INSERT INTO old_recordings " +
                          "( uid,  rid,  name,  init,  start,  end," +
                          "  expiry,  tracks,  cost) VALUES " +
                          "(@UID, @RID, @NAME, @INIT, @START, @END," +
                          " @EXPIRY, @TRACKS, @COST);", {
                "@UID": rec.uid,
                "@RID": rec.rid,
                "@NAME": rec.name,
                "@INIT": rec.init,
                "@START": rec.start,
                "@END": rec.end,
                "@EXPIRY": rec.expiry,
                "@TRACKS": rec.tracks,
                "@COST": rec.cost
            });

            // And drop the old
            var wrid = {"@RID": rec.rid};
            await db.runP("DELETE FROM recordings WHERE rid=@RID;", wrid);
            await db.runP("DELETE FROM recording_share WHERE rid=@RID;", wrid);
            await db.runP("DELETE FROM recording_share_tokens WHERE rid=@RID;", wrid);

            await db.runP("COMMIT;");
            break;
        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

?>
<section class="wrapper special">
    <p>Recording deleted!</p>

    <a href="/panel/rec/">Return to recordings</a>
</section>
<?JS

} else {
?>

<section class="wrapper special">
    <header><h2>Delete <?JS= rec.name || "(Anonymous)" ?></h2></header>

    <p>This will <em>permanently</em>, <em>irreversibly</em> delete the following recording:</p>

    <p><?JS= rec.name || "(Anonymous)" ?>, recorded at <?JS= rec.init ?>.</p>

    <p>Are you sure?</p>

    <p>
    <a class="button" href="/panel/rec/delete/?i=<?JS= rid.toString(36) ?>&amp;sure=yes">Yes, delete it</a>
    <a class="button" href="/panel/rec/">No, cancel</a>
    </p>
</section>

<?JS
}

await include("../../../tail.jss");
?>
