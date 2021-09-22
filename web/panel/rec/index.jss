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

const uid = await include("../uid.jss");
if (!uid) return;

const net = require("net");

const config = require("../config.js");
const credits = require("../credits.js");
const creditsj = await include("../credits.jss");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;

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

// Read out current recordings
var rows = await db.allP("SELECT * FROM recordings WHERE uid=@UID ORDER BY init DESC;", {
    "@UID": uid
});

// Fix any weird states in the database
for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri];

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
    var running = await new Promise(function (resolve) {
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

rows.forEach((row) => {
?>
        <tr>
            <td class="renamable" data-id="<?JS= row.rid.toString(36) ?>"><?JS= row.name||"(Anonymous)" ?></td>
            <td><?JS= row.init ?><br/><?JS= row.expiry ?></td>
            <td><?JS
                switch (row.status) {
                    case 0:
                        write("Created");
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
            ?></td>
            <td><?JS
                if (row.status < 0x30 /* finished */) {
                    // Get the feature flags
                    var features = 0;
                    if (row.continuous)
                        features |= 1;
                    if (row.rtc)
                        features |= 2;
                    if (row.videoRec)
                        features |= 4;
                    if (row.recordOnly)
                        features |= 0x100;
                    if (row.format === "flac")
                        features |= 0x10;

                    // Open up the recording interface
                    var url = config.client +
                        "?" + row.rid.toString(36) +
                        "-" + row.key.toString(36) +
                        "-m" + row.master.toString(36) +
                        "-p" + row.port.toString(36) +
                        "-f" + features.toString(36) +
                        "&nm=" + (row.hostname||"Host");

                    write("<script type=\"text/javascript\"><!--\n" +
                          "function join" + row.rid.toString(36) + "() {\n" +
                          "window.open(" + JSON.stringify(url) + ", \"\", \"width=640,height=480,menubar=0,toolbar=0,location=0,personalbar=0,status=0\");\n" +
                          "}\n" +
                          "//--></script>\n" +
                          "<a href=\"javascript:join" + row.rid.toString(36) + "();\" class=\"button\">" +
                          "<i class=\"fas fa-door-open\"></i> Join</a>");

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
});

if (rows.length === 0) {
    ?><tr><td class="align-center" colspan=6>(none)</td></tr><?JS
}
?>
    </tbody></table>
    </div>
</section>

<script type="text/javascript" src="/assets/js/utils.js" async defer></script>
<script type="text/javascript" src="/assets/js/tablesort.min.js"></script>
<script type="text/javascript"><!--
new Tablesort(document.getElementById("available-recordings"));
//--></script>

<?JS
await include("../../tail.jss");
?>
