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

const config = require("../config.js");
const credits = require("../credits.js");
const db = require("../db.js").db;

const accountCredits = await credits.accountCredits(uid);

await include("../head.jss", {title: "Recordings"});
?>

<section class="wrapper special">
    <p><?JS= credits.creditsMessage(accountCredits) ?></p>

    <?JS await include("interface.jss"); ?>
</section>

<section>
    <header class="align-center"><h2>Available recordings</h2></header>

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

rows.forEach((row) => {
?>
        <tr>
            <td><?JS= row.name||"(Anonymous)" ?></td>
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
                    if (row.format === "flac")
                        features |= 0x10;

                    // Open up the recording interface (FIXME: name default)
                    var url = config.client +
                        "?" + row.rid.toString(36) +
                        "-" + row.key.toString(36) +
                        "-m" + row.master.toString(36) +
                        "-p" + row.port.toString(36) +
                        "-f" + features.toString(36) +
                        "&nm=" + "Host";

                    write("<script type=\"text/javascript\"><!--\n" +
                          "function join" + row.rid.toString(36) + "() {\n" +
                          "window.open(" + JSON.stringify(url) + ", \"\", \"width=640,height=480,menubar=0,toolbar=0,location=0,personalbar=0,status=0\");\n" +
                          "}\n" +
                          "//--></script>\n" +
                          "<a href=\"javascript:join" + row.rid.toString(36) + "();\">Join</a>");

                } else {
                    write("-");
                }
            ?></td>
            <td><a href="dl/?i=<?JS= row.rid.toString(36) ?>">Download</a></td>
            <td><a href="delete/?i=<?JS= row.rid.toString(36) ?>">Delete</a></td>
        </tr>
<?JS
});

if (rows.length === 0) {
    ?><tr><td class="align-center" colspan=6>(none)</td></tr><?JS
}
?>
    </tbody></table>
</section>

<script type="text/javascript" src="/assets/js/tablesort.min.js"></script>
<script type="text/javascript"><!--
new Tablesort(document.getElementById("available-recordings"));
//--></script>

<?JS
await include("../../tail.jss");
?>
