<?JS
/*
 * Copyright (c) 2022 Yahweasel
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

const db = require("../db.js").db;
const unM = require("../username.js");

const recs = await db.allP(
    `SELECT * FROM
        recording_share INNER JOIN recordings
        ON recording_share.rid=recordings.rid
    WHERE
        recording_share.uid_from=recordings.uid AND
        recording_share.uid_from=@UID
    ORDER BY
        recordings.init DESC,
        recording_share.uid_to ASC;`, {
    "@UID": uid
});
const lobbies = await db.allP(
    `SELECT * FROM
        lobby_share INNER JOIN lobbies2
        ON lobby_share.lid=lobbies2.lid
    WHERE
        lobby_share.uid_from=lobbies2.uid AND
        lobby_share.uid_from=@UID
    ORDER BY
        lobbies2.name ASC,
        lobby_share.uid_to ASC;`, {
    "@UID": uid
});

await include("../head.jss", {title: "Sharing"});
?>

<section class="wrapper special">
    <header class="align-center"><h2>Shared rooms and recordings</h2></header>

    <div style="overflow: auto">
    <table id="shared-recordings">
        <thead>
        <tr><th>Name</th><th>Start date<br/>Expiry date</th><th>Shared with</th>
        <th data-sort-method="none" class="no-sort">Unshare</th></tr>
        </thead><tbody>
<?JS

// First show all the lobbies
for (const lobby of lobbies) {
?>
        <tr>
            <td><?JS= lobby.name || "(Anonymous)" ?></td>
            <td>(Room)</td>
            <td><?JS= await unM.getDisplay(lobby.uid_to) ?></td>
            <td>
                <a href="unshare/?l=<?JS= lobby.lid.toString(36) ?>&u=<?JS= lobby.uid_to ?>" class="button"><i class="fas fa-minus-circle"></i> Unshare</a>
            </td>
        </tr>
<?JS
}

// Put a blank if there were both lobbies and recordings
if (lobbies.length && recs.length) {
    ?><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><?JS
}

// Now show each of the recordings
for (const row of recs) {
?>
        <tr>
            <td><?JS= row.name || "(Anonymous)" ?></td>
            <td><?JS= row.init ?><br/><?JS= row.expiry ?></td>
            <td><?JS= await unM.getDisplay(row.uid_to) ?></td>
            <td>
                <a href="unshare/?r=<?JS= row.rid.toString(36) ?>&u=<?JS= row.uid_to ?>" class="button"><i class="fas fa-minus-circle"></i> Unshare</a>
            </td>
        </tr>
<?JS
}

if (!lobbies.length && !recs.length) {
    ?><tr><td class="align-center" colspan=4>(none)</td></tr><?JS
}
?>
    </tbody></table>
    </div>
</section>

<script type="text/javascript" src="/assets/js/tablesort.min.js"></script>
<script type="text/javascript"><!--
new Tablesort(document.getElementById("shared-recordings"));
//--></script>

<?JS
await include("../../tail.jss");
?>
