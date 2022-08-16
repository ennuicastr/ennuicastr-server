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

const uidX = await include("../uid.jss", {verbose: true});
if (!uidX) return;
const uid = uidX.uid;

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

<script type="text/javascript">
function joinRecording(url) {
    window.open(url, "", "width=640,height=480,menubar=0,toolbar=0,location=0,personalbar=0,status=0");
}

function toggleMore(rec) {
    var el = document.getElementById("more-" + rec);
    if (el.style.height === "auto") {
        el.style.height = "0px";
        el.style.margin = "";
    } else {
        el.style.height = "auto";
        el.style.margin = "1em 0";
    }
}

function localDate(date) {
    try {
        var d = new Date(date.replace(" ", "T") + "Z");
        date =
            d.getFullYear() + "-" +
            (d.getMonth() + 1).toString().padStart(2, "0") + "-" +
            d.getDate().toString().padStart(2, "0") + " " +
            d.getHours() + ":" +
            d.getMinutes().toString().padStart(2, "0");
        date += " " +
            d.toLocaleTimeString([], {timeZoneName: "short"})
            .replace(/^.* /, "");
    } catch (ex) {}
    return date;
}
</script>

<section>
    <header class="align-center"><h2>Available recordings</h2></header>

    <div style="overflow: auto">
    <table id="available-recordings">
        <thead>
        <tr><th>Name</th><th>Start date<br/>Expiry date</th><th>Status</th>
        <th data-sort-method="none" class="no-sort">Join</th>
        <th data-sort-method="none" class="no-sort">Download</th>
        <th data-sort-method="none" class="no-sort">More</th></tr>
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

// Add any shared lobbies/recordings
{
    const sharedLobbies = await db.allP(
        `SELECT * FROM lobbies2 INNER JOIN lobby_share ON lobbies2.lid = lobby_share.lid
        WHERE lobby_share.uid_to=@UID
        AND lobbies2.uid=lobby_share.uid_from;`, {
        "@UID": uid
    });
    if (sharedLobbies.length) {
        lobbies = lobbies.concat(sharedLobbies).sort((a, b) => {
            return (a.name < b.name) ? -1 : 1;
        });
    }

    const sharedRecs = await db.allP(
        `SELECT * FROM recordings INNER JOIN recording_share ON recordings.rid = recording_share.rid
        WHERE recording_share.uid_to=@UID
        AND recordings.uid=recording_share.uid_from;`, {
        "@UID": uid
    });
    if (sharedRecs.length) {
        recs = recs.concat(sharedRecs).sort((a, b) => {
            return (a.init < b.init) ? 1 : -1;
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
    let url = JSON.stringify(
        recM.hostUrl(rec, opts)
        .replace(/\&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;"));

    write(`<button onclick='joinRecording(${url});'>` +
          `<i class="fas fa-door-open"></i> Join</button>`);
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
            <td>
                Open
                <?JS
                if (lobby.uid !== uid)
                    write("<br/>(Shared)");
                ?>
            </td>
            <td><?JS
                joinButton(JSON.parse(lobby.config), {
                    rid: lobby.lid,
                    key: lobby.key,
                    master: lobby.master
                });
            ?></td>
            <td>-</td>
            <td>
                <button
                    class="round"
                    onclick='toggleMore("l-<?JS= lobby.lid.toString(36) ?>");'
                    aria-label="More options">
                <i class="fas fa-ellipsis-h"></i></button>
                <div
                    id="more-l-<?JS= lobby.lid.toString(36) ?>"
                    style="height: 0px; overflow: clip;"><?JS

                    // Deleting and sharing are only for the owner
                    if (lobby.uid === uid) {
                        ?>
                        <a href="delete-room/?i=<?JS= lobby.lid.toString(36) ?>" class="button fit"><i class="fas fa-trash-alt"></i> Delete</a>
                        <?JS

                        // Sharing requires admin
                        if (uidX.level >= 2) {
                        ?>
                        <a href="share-room/?i=<?JS= lobby.lid.toString(36) ?>" class="button fit"><i class="fas fa-share-square"></i> Share</a>
                        <?JS
                        }

                    } else if (uidX.level >= 2 /* admin */) {
                        // Shared recipient can only unshare
                        ?>
                        <a href="share-room/?i=<?JS= lobby.lid.toString(36) ?>&un=1" class="button fit"><i class="fas fa-minus-circle"></i> Unshare</a>
                        <?JS

                    }
                ?></div>

            </td>
        </tr>
<?JS
}

// Put a blank if there were unassociated lobbies but there are also recordings
if (unassoc && recs.length) {
    ?><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><?JS
}

// Now show each of the recordings
for (let row of recs) {
?>
        <tr>
            <td class="renamable" data-id="<?JS= row.rid.toString(36) ?>"><?JS= row.name||"(Anonymous)" ?></td>
            <td>
                <script type="text/javascript">
                    document.write(
                        localDate(<?JS= JSON.stringify(row.init) ?>) +
                        "<br/>" +
                        localDate(<?JS= JSON.stringify(row.expiry) ?>));
                </script>
            </td>
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
                if (row.uid !== uid)
                    write("<br/>(Shared)");
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
                if (!row.purchased && row.status >= 0x30 /* finished */) {
                ?><a href="dl/?i=<?JS= row.rid.toString(36) ?>&s=1" class="button"><i class="fas fa-download"></i> Sample download</a><?JS
                    write("<br/><br/>$" + credits.creditsToDollars(row.cost) + "<br/>");
                }
                ?><a href="dl/?i=<?JS= row.rid.toString(36) ?>" class="button"><i class="fas fa-download"></i> Download</a><?JS
            ?></td>
            <td>
                <button
                    class="round"
                    onclick='toggleMore("<?JS= row.rid.toString(36) ?>");'
                    aria-label="More options">
                <i class="fas fa-ellipsis-h"></i></button>
                <div
                    id="more-<?JS= row.rid.toString(36) ?>"
                    style="height: 0px; overflow: clip;"><?JS

                    // Deleting and sharing are only for the owner
                    if (row.uid === uid) {
                        if (row.status >= 0x30 /* finished */) {
                            ?><a href="delete/?i=<?JS= row.rid.toString(36) ?>" class="button fit"><i class="fas fa-trash-alt"></i> Delete</a><?JS
                        }

                        if (uidX.level >= 2 /* admin */) {
                        if (row.lid) {
                            // This is a lobby, so share in either
                            ?>
                            <a href="share-room/?i=<?JS= row.lid.toString(36) ?>" class="button fit" style="height: auto"><i class="fas fa-share-square"></i> Share<br/>(Room)</a>
                            <?JS
                        }

                        ?>
                        <a href="share/?i=<?JS= row.rid.toString(36) ?>" class="button fit" style="height: auto"><i class="fas fa-share-square"></i> Share<?JS=
                            row.lid ?
                                "<br/>(Recording)" :
                                ""
                        ?></a>
                        <?JS
                        }

                    } else if (uidX.level >= 2 /* admin */) {
                        // Shared recipient can only unshare
                        ?>
                        <a href="share/?i=<?JS= row.rid.toString(36) ?>&un=1" class="button fit"><i class="fas fa-minus-circle"></i> Unshare</a>
                        <?JS

                    }
                ?></div>
            </td>
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
