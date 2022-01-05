<?JS
/*
 * Copyright (c) 2021, 2022 Yahweasel
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

const config = require("../config.js");
const db = require("../db.js").db;

if (!request.query.i) {
    // Delete nothing?
    return writeHead(302, {"location": "/panel/rec/"});
}

// Get the lobby to be deleted
const lid = Number.parseInt(request.query.i, 36);
const lobby = await db.getP("SELECT * FROM lobbies2 WHERE lid=@LID;", {"@LID": lid});
if (!lobby || lobby.uid !== uid) {
    // Not allowed or not valid
    return writeHead(302, {"location": "/panel/rec/"});
}

// OK, we've got something to delete
await include ("../../head.jss", {title: "Delete"});

if (request.query.sure) {
    // OK, delete it then!
    while (true) {
        try {
            await db.runP("DELETE FROM lobbies2 WHERE uid=@UID AND lid=@LID;", {
                "@UID": uid,
                "@LID": lid
            });
            break;
        } catch (ex) {}
    }

?>
<section class="wrapper special">
    <p>Room deleted!</p>

    <a href="/panel/rec/">Return to recordings</a>
</section>
<?JS

} else {
?>

<section class="wrapper special">
    <header><h2>Delete room <?JS= lobby.name || "(Anonymous)" ?></h2></header>

    <p>This will delete the following room:</p>

    <p><?JS= lobby.name || "(Anonymous)" ?></p>

    <p>The room invite link will no longer be valid, but previously made recordings will not be deleted.</td>

    <p>Are you sure?</p>

    <p>
    <a class="button" href="/panel/rec/delete-room/?i=<?JS= lid.toString(36) ?>&amp;sure=yes">Yes, delete it</a>
    <a class="button" href="/panel/rec/">No, cancel</a>
    </p>
</section>

<?JS
}

await include("../../../tail.jss");
?>
