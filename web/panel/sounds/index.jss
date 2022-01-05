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

const uid = await include("../uid.jss");
if (!uid) return;

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;

await include("../head.jss", {title: "Sounds"});
?>

<section class="wrapper special">

    <p>Upload sounds or music to use in your recordings</p>

    <div style="overflow: auto">
    <table id="available-sounds" class="align-left">
        <thead>
        <tr><th>Name</th><th>Sound</th><th>Delete</th></tr>
        </thead><tbody>
<?JS

// Read out current sounds
var rows = await db.allP("SELECT * FROM sounds WHERE uid=@UID ORDER BY name ASC;", {
    "@UID": uid
});

for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri];
?>
        <tr>
            <td style="vertical-align: middle" class="renamable" data-id="<?JS= row.sid ?>">
                <span><?JS= row.name||"(Anonymous)" ?></span>
            </td>
            <td style="vertical-align: middle">
                <audio controls preload="none">
                    <source src="sound.jss?sid=<?JS= row.sid ?>&amp;f=opus" type="audio/webm;codecs=opus" />
                    <source src="sound.jss?sid=<?JS= row.sid ?>&amp;f=aac" type="audio/mp4;codecs=mp4a.40" />
                </audio>
            </td>
            <td style="vertical-align: middle">
                <a id="delete-sound-b-<?JS= row.sid ?>" href='javascript:deleteSound("<?JS= row.sid ?>");' class="button" style="width: 20em">
                <i class="fas fa-trash-alt"></i> Delete
                </a>
                <span id="delete-sound-confirm-span-<?JS= row.sid ?>" style="display: none"><br/>
                <a id="delete-sound-yes-b-<?JS= row.sid ?>" href='javascript:deleteSoundYes("<?JS= row.sid ?>");' class="button" style="width: 10em">
                Yes</a>
                <a id="delete-sound-no-b-<?JS= row.sid ?>" href='javascript:deleteSoundNo("<?JS= row.sid ?>");' class="button" style="width: 10em">
                No</a>
                </span>
            </td>
        </tr>
<?JS
}

if (rows.length === 0) {
    ?><tr><td class="align-center" colspan=4>(none)</td></tr><?JS
}
?>
        <tr><td class="align-center" colspan=4>
            <a id="create-sound-show-b" class="button" href="javascript:showCreateSound();">
                <i class="fas fa-music"></i> Upload sound
            </a>

            <div id="create-sound" class="wrapper style2 small" style="display: none">
                <span style="display: inline-block; text-align: left">
                    <div>
                        <label for="sound-file" style="margin: auto">File:&nbsp;</label>
                        <input id="sound-file" type="file" onchange="return soundName(event);" />
                    </div>

                    <div style="display: flex; margin-top: 0.5em;">
                        <label for="sound-name" style="margin: auto">Name:&nbsp;</label>
                        <input id="sound-name" type="text" style="flex: auto" maxlength=<?JS= config.limits.soundNameLength ?> />
                    </div>

                    <div style="margin-top: 0.5em">
                        <label for="sound-level" style="margin: auto">Auto-level volume:&nbsp;</label>
                        <input id="sound-level" type="checkbox" checked />
                    </div>

                    <div style="margin-top: 0.5em">
                        <a id="create-sound-b" class="button" href="javascript:createSound();" style="width: 100%">
                        <i class="fas fa-music"></i> Upload
                        </a>
                    </div>
                </span>
            </div>
        </td></tr>
    </tbody></table>
    </div>
</section>

<script type="text/javascript">
function showCreateSound() {
    $("#create-sound-show-b")[0].classList.add("disabled");
    $("#create-sound")[0].style.display = "block";
    var file = $("#sound-file")[0];
    var name = $("#sound-name")[0];
    file.focus();
    file.click();
    name.onkeydown = function(ev) {
        if (ev.keyCode !== 13 || name.value.trim() === "")
            return true;
        createSound();
        ev.preventDefault();
        return false;
    };
}

function soundName(ev) {
    var file = ev.target;
    var name = $("#sound-name")[0];
    if (file.files.length >= 1) {
        name.value = file.files[0].name.replace(/\.[^\.]*$/, "");
        name.focus();
        name.select();
    }
}

function createSound() {
    var file = $("#sound-file")[0];
    if (file.files.length < 1) {
        // Need a file
        file.focus();
        file.click();
        return;
    }

    var name = $("#sound-name")[0];
    if (name.value === "") {
        // No blank names
        name.focus();
        name.select();
        return;
    }

    var level = $("#sound-level")[0];

    file.disabled = true;
    name.disabled = true;
    var b = $("#create-sound-b")[0];
    b.classList.add("disabled");
    b.innerHTML = '<img src="/assets/svg/spinner.svg" class="spinner" />';

    // Get the file extension
    var ext = /\.([^\.]*)$/.exec(ext);
    if (ext)
        ext = ext[1];
    else
        ext = "dat";

    // Establish our connection
    var surl = new URL(document.location);
    surl = "wss://" + surl.host + "/panel/sounds/create/ws";

    var sock = new WebSocket(surl);
    sock.binaryType = "arraybuffer";

    new Promise(function(res, rej) {
        sock.onopen = res;
        sock.onclose = rej;

    }).then(function() {
        sock.onclose = null;

        // Send our request
        sock.send(JSON.stringify({
            c: "upload",
            n: name.value,
            l: !!level.checked,
            e: ext
        }));

        // And get the file into an ArrayBuffer
        return file.files[0].arrayBuffer();

    }).then(function(ab) {
        // Send our data
        var a = new Uint8Array(ab);
        var m = new Uint8Array(a.length + 1);
        m[0] = 0;
        m.set(a, 1);
        sock.send(m);

        // And send the "done" message
        sock.send(new Uint8Array([1]).buffer);

        // Then wait for the response
        return new Promise(function(res, rej) {
            sock.onmessage = function(msg) {
                msg = JSON.parse(msg.data);
                if (msg.c === "s") {
                    // Status message
                    b.style.fontFamily = "monospace";
                    b.innerText = msg.s[0] + "/" + msg.s[1] + ": " + msg.t;
                } else {
                    res(msg);
                }
            };
            sock.onclose = rej;
        });

    }).then(function(msg) {
        sock.onmessage = sock.onclose = null;

        // Check for failure
        if (msg.error)
            alert("Failed to upload sound!\n\n" + msg.error);

        // Refresh the page to show the new sound
        document.location = "/panel/sounds/";

    }).catch(function(ex) {
        alert("Failed to upload sound!\n\n" + ex + "\n\n" + ex.stack);
        document.location = "/panel/sounds/";

    });
}

function deleteSound(sid) {
    var b = $("#delete-sound-b-" + sid)[0];
    b.classList.add("disabled");
    b.innerText = "Are you sure?";
    $("#delete-sound-confirm-span-" + sid)[0].style.display = "";
    $("#delete-sound-no-b-" + sid)[0].focus();
}

function deleteSoundYes(sid) {
    $("#delete-sound-yes-b-" + sid)[0].classList.add("disabled");
    $("#delete-sound-no-b-" + sid)[0].classList.add("disabled");

    var body = JSON.stringify({s: sid});

    fetch("/panel/sounds/delete.jss", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: body

    }).then(function(res) {
        return res.text();

    }).then(function(res) {
        res = JSON.parse(res);

        // Check for failure
        if (res.error) {
            alert("Failed to delete sound!\n\n" + res.error);
            return;
        }

        // Refresh the page to show the current state
        document.location = "/panel/sounds/";

    }).catch(function(ex) {
        alert("Failed to delete sound!\n\n" + ex + "\n\n" + ex.stack);
        document.location = "/panel/sounds/";

    });

}

function deleteSoundNo(sid) {
    $("#delete-sound-yes-b-" + sid)[0].classList.add("disabled");
    $("#delete-sound-no-b-" + sid)[0].classList.add("disabled");
    document.location = "/panel/sounds/";
}
</script>

<script type="text/javascript" src="/assets/js/utils.js" async defer></script>
<script type="text/javascript" src="/assets/js/tablesort.min.js"></script>
<script type="text/javascript"><!--
new Tablesort(document.getElementById("available-sounds"));
//--></script>

<?JS
await include("../../tail.jss");
?>
