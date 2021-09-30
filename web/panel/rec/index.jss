<?JS
/*
 * Copyright (c) 2020, 2021 Yahweasel
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

const net = require("net");

const config = require("../config.js");
const credits = require("../credits.js");
const creditsj = await include("../credits.jss");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const recM = require("../rec.js");

const accountCredits = await creditsj.accountCredits(uid);

await include("../head.jss", {title: "Recordings"});
?>

<section class="wrapper special">
    <?JS await include("interface.jss"); ?>
</section>

<section>
    <header class="align-center"><h2>Available recordings</h2></header>

    <div style="overflow: auto">
    <table id="available-recordings">
        <thead>
        <tr><th>Name</th><th>Start date<br/>Expiry date</th><th>Status</th>
        <th data-sort-method="none" class="no-sort">Join</th>
        <th data-sort-method="none" class="no-sort">Download</th>
        <th data-sort-method="none" class="no-sort">Delete</th></tr>
        </thead><tbody>
<?JS

// Read out current lobbies and recordings
let lobbies = await db.allP("SELECT * FROM lobbies2 WHERE uid=@UID ORDER BY name ASC;", {
    "@UID": uid
});
let recs = await db.allP("SELECT * FROM recordings WHERE uid=@UID ORDER BY init DESC;", {
    "@UID": uid
});

// Fix any weird states in the database
for (let row of recs) {
    if (!row.purchased && accountCredits.subscription) {
        if ((row.format !== "flac" && !row.continuous) ||
            accountCredits.subscription >= 2) {
            // Auto-purchase
            row.purchased = "1";
            await db.runP("UPDATE recordings SET purchased='1' WHERE uid=@UID AND rid=@RID;", {
                "@UID": uid,
                "@RID": row.rid
            });
            log("subscription-auto-purchase", row, {uid, rid: row.rid});
        }
    }

    if (row.status >= 0x30) continue;

    // It's not finished, so should be running
    let running = await new Promise(function (resolve) {
        var sock = net.createConnection(row.port);

        sock.on("connect", () => {
            sock.end();
            resolve(true);
        });

        sock.on("error", () => {
            resolve(false);
        });
    });

    if (!running) {
        // Fix the state in the database
        row.status = 0x30;
        await db.runP("UPDATE recordings SET status=@STATUS WHERE uid=@UID AND rid=@RID;", {
            "@UID": uid,
            "@RID": row.rid,
            "@STATUS": row.status
        });
    }
}

// Index the recordings by ID
let recsById = Object.create(null);
for (let row of recs)
    recsById[row.rid] = row;

// Associate the lobbies
for (let li = 0; li < lobbies.length; li++) {
    let lobby = lobbies[li];

    // Only associate incomplete recordings
    let rec = recsById[lobby.rid];
    if (!rec) continue;
    if (rec.status >= 0x30) continue;

    // OK, don't show the lobby, just the recording
    rec.lid = lobby.lid;
    rec.lkey = lobby.key;
    rec.lmaster = lobby.master;
    lobbies[li] = null;
}

// Function for a join button
function joinButton(rec, opts) {
    opts = opts || {};
    let url = recM.hostUrl(rec, opts);
    let rid = opts.rid || rec.rid;

    write("<script type=\"text/javascript\"><!--\n" +
          "function join" + rid.toString(36) + "() {\n" +
          "window.open(" + JSON.stringify(url) + ", \"\", \"width=640,height=480,menubar=0,toolbar=0,location=0,personalbar=0,status=0\");\n" +
          "}\n" +
          "//--></script>\n" +
          "<a href=\"javascript:join" + rid.toString(36) + "();\" class=\"button\">" +
          "<i class=\"fas fa-door-open\"></i> Join</a>");
}


// First show all the unassociated lobbies
let unassoc = 0;
for (let lobby of lobbies) {
    if (!lobby) continue;
    unassoc++;
?>
        <tr>
            <td class="renamable" data-id="<?JS= lobby.lid.toString(36) ?>" data-endpoint="rename-room.jss"><?JS= lobby.name||"(Anonymous)" ?></td>
            <td>(Room)</td>
            <td>Open</td>
            <td><?JS
                joinButton(JSON.parse(lobby.config), {
                    rid: lobby.lid,
                    key: lobby.key,
                    master: lobby.master
                });
            ?></td>
            <td>-</td>
            <td><a href="delete-room/?i=<?JS= lobby.lid.toString(36) ?>" class="button"><i class="fas fa-trash-alt"></i> Delete</a></td>
        </tr>
<?JS
}

// Put a blank if there were unassociated lobbies but there are also recordings
if (unassoc && recs.length) {
    ?><tr><td class="align-center" colspan=6>&nbsp;</td></tr><?JS
}

// Now show each of the recordings
for (let row of recs) {
?>
        <tr>
            <td class="renamable" data-id="<?JS= row.rid.toString(36) ?>"><?JS= row.name||"(Anonymous)" ?></td>
            <td><?JS= row.init ?><br/><?JS= row.expiry ?></td>
            <td><?JS
                switch (row.status) {
                    case 0:
                        write("Ready to record");
                        break;
                    case 0x10: // rec
                        write("Recording");
                        break;
                    case 0x30: // finished
                        write("Finished");
                        break;
                    default:
                        write(row.status);
                }
                if (row.lid)
                    write(" (room)");
            ?></td>
            <td><?JS
                if (row.status < 0x30 /* finished */) {
                    if (row.lid) {
                        joinButton(row, {
                            rid: row.lid,
                            key: row.lkey,
                            master: row.lmaster,
                            noport: true
                        });

                    } else {
                        joinButton(row);

                    }

                } else {
                    write("-");
                }
            ?></td>
            <td><?JS
                if (!row.purchased && row.status >= 0x30 /* finished */)
                    write("$" + credits.creditsToDollars(row.cost) + "<br/>");
                ?><a href="dl/?i=<?JS= row.rid.toString(36) ?>" class="button"><i class="fas fa-download"></i> Download</a><?JS
            ?></td>
            <td><?JS
                if (row.status < 0x30 /* finished */) {
                    write("-");
                } else {
                    ?><a href="delete/?i=<?JS= row.rid.toString(36) ?>" class="button"><i class="fas fa-trash-alt"></i> Delete</a><?JS
                }
            ?></td>
        </tr>
<?JS
}

if (!unassoc && recs.length === 0) {
    ?><tr><td class="align-center" colspan=6>(none)</td></tr><?JS
}
?>
    </tbody></table>
    </div>
</section>

<script type="text/javascript" src="/assets/js/utils.js?v=1" async defer></script>
<script type="text/javascript" src="/assets/js/tablesort.min.js"></script>
<script type="text/javascript"><!--
new Tablesort(document.getElementById("available-recordings"));
//--></script>

<?JS
await include("../../tail.jss");
?>
