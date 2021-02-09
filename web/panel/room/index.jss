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

/* NOTE: Rooms are called "lobbies" internally, so that they abbreviate to 'l'
 * instead of 'r' and don't conflate with recordings. */

const uid = await include("../uid.jss");
if (!uid) return;

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;

await include("../head.jss", {title: "Rooms"});
?>

<style type="text/css">
    #create-recording-b {
        display: none;
    }
</style>

<section class="wrapper special">

<?JS
// The recording creation interface is only for easily creating recordings in a given room
await include("../rec/interface.jss");
?>

    <p>Rooms are persistent links to make it easier for regular guests to find your recordings. Just create a room, then when you create a recording, associate the recording with the room. Share the room link with the guests, and they'll automatically join the recording if it's active, or wait for it to activate if it's not.</p>

    <div style="overflow: auto">
    <table id="available-lobbies" class="align-left">
        <thead>
        <tr><th>Name</th><th>Link</th><th>Recording</th><th>Delete</th></tr>
        </thead><tbody>
<?JS

// Read out current lobbies
var rows = await db.allP("SELECT * FROM lobbies WHERE uid=@UID ORDER BY name ASC;", {
    "@UID": uid
});

for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri];
?>
        <tr>
            <td class="renamable" data-id="<?JS= row.lid ?>"><?JS= row.name||"(Anonymous)" ?></td>
            <td>
                <?JS=
                    '<input id="lobby-link-' + row.lid + '" type="text" value="' + config.lobby + '?' + row.lid + '" />' +
                    '<a href=\'javascript:copyLink("' + row.lid + '")\' class="button" aria-label="Copy link">' +
                    '<i class="fas fa-clipboard"></i>' +
                    '</a>'
                ?>
            </td>
            <td>
                <?JS
                    var rec = null;
                    if (row.associated) {
                        rec = await db.getP("SELECT * FROM recordings WHERE uid=@UID AND rid=@RID;", {
                            "@UID": uid,
                            "@RID": row.rid
                        });
                    }

                    if (rec) {
                        if (rec.status >= 0x30 /* finished */)
                            rec = null;
                    }

                    if (rec) {
                        // Link to the recording
                        // (FIXME: Duplicated from the recording interface)
                        // Get the feature flags
                        var features = 0;
                        if (rec.continuous)
                            features |= 1;
                        if (rec.rtc)
                            features |= 2;
                        if (rec.format === "flac")
                            features |= 0x10;

                        // Open up the recording interface
                        var url = config.client +
                            "?" + rec.rid.toString(36) +
                            "-" + rec.key.toString(36) +
                            "-m" + rec.master.toString(36) +
                            "-p" + rec.port.toString(36) +
                            "-f" + features.toString(36) +
                            "&nm=" + (rec.hostname||"Host");

                        write("<script type=\"text/javascript\"><!--\n" +
                              "function join" + rec.rid.toString(36) + "() {\n" +
                              "window.open(" + JSON.stringify(url) + ", \"\", \"width=640,height=480,menubar=0,toolbar=0,location=0,personalbar=0,status=0\");\n" +
                              "}\n" +
                              "//--></script>\n" +
                              "<a href=\"javascript:join" + rec.rid.toString(36) + "();\" class=\"button\">" +
                              "<i class=\"fas fa-door-open\"></i> Join</a>");

                    } else {
                        // Create a new recording
                        write('<a href=\'javascript:createRecordingLobby("' + row.lid + '")\' class="button">' +
                              '<i class="fas fa-play-circle"></i> Create recording' +
                              '</a>');

                    }
                ?>
            </td>
            <td>
                <?JS=
                    '<a id="delete-lobby-b-' + row.lid + '" href=\'javascript:deleteLobby("' + row.lid + '");\' class="button" style="width: 20em">' +
                    '<i class="fas fa-trash-alt"></i> Delete room' +
                    '</a>' +
                    '<span id="delete-lobby-confirm-span-' + row.lid + '" style="display: none"><br/>' +
                    '<a id="delete-lobby-yes-b-' + row.lid + '" href=\'javascript:deleteLobbyYes("' + row.lid + '");\' class="button" style="width: 10em">' +
                    'Yes</a>' +
                    '<a id="delete-lobby-no-b-' + row.lid + '" href=\'javascript:deleteLobbyNo("' + row.lid + '");\' class="button" style="width: 10em">' +
                    'No</a>' +
                    '</span>'
                ?>
            </td>
        </tr>
<?JS
}

if (rows.length === 0) {
    ?><tr><td class="align-center" colspan=4>(none)</td></tr><?JS
}
?>
        <tr><td class="align-center" colspan=4>
            <a id="create-lobby-show-b" class="button" href="javascript:showCreateLobby();">
                <i class="fas fa-cube"></i> Create room
            </a>

            <div id="create-lobby" class="wrapper style2 small" style="display: none">
                <span style="display: inline-block; text-align: left">
                    <div style="display: flex">
                        <label for="lobby-name" style="width: auto; margin: auto">Name:&nbsp;</label>
                        <input id="lobby-name" type="text" style="flex: auto" maxlength=<?JS= config.limits.lobbyNameLength ?> />
                    </div>

                    <a id="create-lobby-b" class="button" href="javascript:createLobby();" style="width: 100%">
                    <i class="fas fa-cube"></i> Create
                    </a>
                </span>
            </div>
        </td></tr>
    </tbody></table>
    </div>
</section>

<script type="text/javascript">
function copyLink(lid) {
    var el = $("#lobby-link-" + lid)[0];
    el.focus();
    el.select();
    document.execCommand("copy");
}

function showCreateLobby() {
    $("#create-lobby-show-b")[0].classList.add("disabled");
    $("#create-lobby")[0].style.display = "block";
    var name = $("#lobby-name")[0];
    name.focus();
    name.select();
    name.onkeydown = function(ev) {
        if (ev.keyCode !== 13 || name.value.trim() === "")
            return true;
        createLobby();
        ev.preventDefault();
        return false;
    };
}

function createLobby() {
    var name = $("#lobby-name")[0];
    if (name.value === "") {
        // No blank names
        name.focus();
        name.select();
        return;
    }
    name.disabled = true;
    $("#create-lobby-b")[0].classList.add("disabled");
    var body = JSON.stringify({n: name.value});

    fetch("/panel/room/create.jss", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: body

    }).then(function(res) {
        return res.text();

    }).then(function(res) {
        res = JSON.parse(res);

        // Check for failure
        if (res.error) {
            alert("Failed to create room!\n\n" + res.error);
            return;
        }

        // Refresh the page to show the new lobby
        document.location = "/panel/room/";

    }).catch(function(ex) {
        alert("Failed to create room!\n\n" + ex + "\n\n" + ex.stack);
        document.location = "/panel/room/";

    });
}

function createRecordingLobby(lid) {
    $("#r-lid")[0].value = lid;
    $("#create-recording-b")[0].style.display = "inline-block";
    $("#create-recording-b")[0].classList.add("disabled");
    $("#create-recording")[0].style.display = "block";
    window.scroll(0, 0);
    $("#r-name")[0].select();
}

function deleteLobby(lid) {
    var b = $("#delete-lobby-b-" + lid)[0];
    b.classList.add("disabled");
    b.innerText = "Are you sure?";
    $("#delete-lobby-confirm-span-" + lid)[0].style.display = "";
    $("#delete-lobby-no-b-" + lid)[0].focus();
}

function deleteLobbyYes(lid) {
    $("#delete-lobby-yes-b-" + lid)[0].classList.add("disabled");
    $("#delete-lobby-no-b-" + lid)[0].classList.add("disabled");

    var body = JSON.stringify({l: lid});

    fetch("/panel/room/delete.jss", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: body

    }).then(function(res) {
        return res.text();

    }).then(function(res) {
        res = JSON.parse(res);

        // Check for failure
        if (res.error) {
            alert("Failed to delete room!\n\n" + res.error);
            return;
        }

        // Refresh the page to show the current state
        document.location = "/panel/room/";

    }).catch(function(ex) {
        alert("Failed to delete room!\n\n" + ex + "\n\n" + ex.stack);
        document.location = "/panel/room/";

    });

}

function deleteLobbyNo(lid) {
    $("#delete-lobby-yes-b-" + lid)[0].classList.add("disabled");
    $("#delete-lobby-no-b-" + lid)[0].classList.add("disabled");
    document.location = "/panel/room/";
}
</script>

<script type="text/javascript" src="/assets/js/utils.js" async defer></script>
<script type="text/javascript" src="/assets/js/tablesort.min.js"></script>
<script type="text/javascript"><!--
new Tablesort(document.getElementById("available-lobbies"));
//--></script>

<?JS
await include("../../tail.jss");
?>
