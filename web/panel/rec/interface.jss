<?JS!
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

const config = require("../config.js");
const db = require("../db.js").db;
const creditsj = await include("../credits.jss");

const accountCredits = await creditsj.accountCredits(uid);

// Check that this user isn't over the simultaneous recording limit (note: 0x30 == finished)
var recordings = await db.allP("SELECT rid FROM recordings WHERE uid=@UID AND status<0x30;", {"@UID": uid});
if (recordings.length >= config.limits.simultaneous)
    return;

const defaults = await (async function() {
    var row = await db.getP("SELECT * FROM defaults WHERE uid=@UID;", {"@UID": uid});
    if (!row)
        row = {
            name: "",
            dname: "",
            format: "opus",
            continuous: false,
            rtc: true,
            videoRec: false,
            transcription: false,
            lid: null,
            universal_monitor: true
        };
    row.universal_monitor = !!row.universal_monitor;
    return row;
})();
?>

<style type="text/css">
.explainer {
    position: absolute;
    max-width: 30em;
    background-color: var(--bg-8);
    color: var(--fg-6);
    border: 2px solid black;
    border-radius: 1em;
    padding: 1em;
}
</style>

<a id="create-recording-b" class="button" href="javascript:createRecording();">
<i class="fas fa-play-circle"></i> Create a new recording
</a>

<div id="create-recording" class="wrapper style2 small" style="display: none">
    <span style="display: inline-block; text-align: left">
        <?JS
        var els = [];

        function l(forr, txt, alt) {
            write('<label for="r-' + forr + '">' + txt +
                (alt?'<a href="javascript:toggle(\'' + forr + '\')"><i class="fas fa-question-circle"></i></a>':'') +
                ':&nbsp;</label>');
        }

        function txt(id, q, limit) {
            write('<input id="r-' + id + '" type="text"' +
                  (limit ? (' maxlength=' + limit) : '') +
                  ' /><br/>' +
                  '<script type="text/javascript"><!--\n' +
                  '$("#r-' + id + '")[0].value = ' + JSON.stringify(defaults[id]) + ';\n' +
                  '//--></script>');
            // We have to use a script to do this to avoid encoding <> etc for value=.
            els.push([id, q]);
        }

        function sel(id, q, opts) {
            write('<select id="r-' + id + '">');
            opts.forEach((opt) => {
                write('<option value="' + opt[0] + '"' +
                      (defaults[id]===opt[0]?' selected':'') +
                      '>' + opt[1] + '</option>');
            });
            write('</select><br/>');

            els.push([id, q]);
        }

        function chk(id, q) {
            write('<input id="r-' + id + '" type="checkbox"' +
                  (defaults[id]?' checked':'') +
                  ' /><br/>');

            els.push([id, q]);
        }

        function alt(id, text) {
            write('<div id="alt-' + id + '" class="explainer" style="display: none">' + text + '</div>');
        }

        l("name", "Recording name");
        txt("name", "n", config.limits.recNameLength);

        l("dname", "Your display name");
        txt("dname", "m", config.limits.recUsernameLength);

        l("videoRec", "Record video", true);
        chk("videoRec", "v");
        alt("videoRec", "If checked, participants who enable their camera or share their screen will also have their video recorded by default, and sent to the host. This can be changed within the Ennuicastr recording application. Video recording is free.");

        // Only show the lobby selection if they have lobbies
        var lobbies = await db.allP("SELECT * FROM lobbies WHERE uid=@UID;", {"@UID": uid});
        if (lobbies.length) {
            defaults.l = "";
            var opts = [["", "(None)"]];
            lobbies.forEach((row) => {
                opts.push([row.lid, row.name.replace(/\u0022/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")]);
            });
            l("lid", "Room");
            sel("lid", "l", opts);
        }

        var showAdvanced = (/* BETA accountCredits.subscription >= 2 || */
                            defaults.format === "flac" ||
                            defaults.continuous ||
                            !defaults.rtc ||
                            defaults.transcription ||
                            !defaults.universal_monitor);

        if (!showAdvanced) {
        ?>

        <div style="text-align: center">
        <a id="advanced-b" class="button" href="javascript:showAdvanced();">
        <i class="fas fa-sliders-h"></i> Advanced options
        </a></div>

        <div id="advanced" style="display: none">

        <?JS
        } else {
        ?>
        <div>

        <?JS
        }

        var priceAdvice = " ($2/hr)";
        if (accountCredits.subscription >= 2)
            priceAdvice = "";

        l("format", "Recording format", true);
        sel("format", "f", [["opus", "High quality (Opus)"], ["flac", "Ultra quality" + priceAdvice + " (FLAC)"]]);
        alt("format", "Format that guests will use to record locally. Opus offers high—but not lossless—quality. Lossless FLAC is available, but costs extra. You may download in any format regardless of what format you record in.");

        l("continuous", "Continuous" + priceAdvice, true);
        chk("continuous", "c");
        alt("continuous", "By default, Ennuicastr is only recording when you speak. This saves on recording space, but can also save on editing time. However, to do this, it uses a technique called voice activity detection (VAD), and VAD is not always perfect. It is possible to miss things. Check this to disable the VAD, and thus get a continuous and complete recording, but at an extra cost.");

        l("transcription", "BETA: Live captions", true);
        chk("transcription", "t");
        alt("transcription", "Enable live captions. Currently only English is supported.");

        l("rtc", "Live voice chat", true);
        chk("rtc", "r");
        alt("rtc", "Ennuicastr's primary function is to record, but you probably want to <em>hear</em> who you're recording! If you're going to use some other software to actually chat with your guests, uncheck this so that you don't hear them in both.");
        ?>

        </div><br/>

        <a id="launch-b" class="button" href="javascript:launchRecording();" style="width: 100%">
        <i class="fas fa-play-circle"></i> Create recording
        </a>
    </span>

    <p id="no-rtc-warn" class="warning" style="margin-top: 1em">WARNING: Ennuicastr will record, but you will not be able to actually hear any other users! Only disable voice chat if you're using some other program for voice communication.</p>
</div>

<p></p>

<script type="text/javascript">
var clientUrl, clientWindow;

function rtcWarn(ev) {
    $("#no-rtc-warn")[0].style.display =
        ($("#r-rtc")[0].checked ? "none" : "block");
}

$("#r-rtc")[0].onchange = rtcWarn;
rtcWarn();

function createRecording() {
    $("#create-recording-b")[0].classList.add("disabled");
    $("#create-recording")[0].style.display = "block";
    $("#r-name")[0].select();
}

function showAdvanced() {
    $("#advanced-b")[0].classList.add("disabled");
    $("#advanced")[0].style.display = "block";
}

function launchRecording() {
    $("#launch-b")[0].classList.add("disabled");
    try {
        $("#advanced-b")[0].classList.add("disabled");
    } catch (ex) {}

    clientWindow = window.open("/panel/rec/loading.jss", "",
        "width=640,height=480,menubar=0,toolbar=0,location=0,personalbar=0,status=0");

    var els = <?JS= JSON.stringify(els) ?>;
    var q = {};
    els.forEach(function(el) {
        var h = $("#r-"+el[0])[0];
        if (h.type === "checkbox")
            q[el[1]] = (h.checked?1:0);
        else
            q[el[1]] = h.value;
        h.disabled = true;
    });

    fetch("/panel/rec/start.jss", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(q)

    }).then(function(res) {
        return res.text();

    }).then(function(res) {
        res = JSON.parse(res);

        // Check for failure
        if (res.error) {
            clientWindow.document.body.innerText = "Recording failed!\n\n" + res.error;
            document.location = "/panel/rec/";
            return;
        }

        // Get the feature flags
        var features = 0;
        if (res.continuous)
            features |= 1;
        if (res.rtc)
            features |= 2;
        if (res.videoRec)
            features |= 4;
        if (res.transcription)
            features |= 8;
        if (res.format === "flac")
            features |= 0x10;

        // Open up the recording interface
        clientWindow.location = <?JS= JSON.stringify(config.client) ?> +
            "?" + res.rid.toString(36) +
            "-" + res.key.toString(36) +
            "-m" + res.master.toString(36) +
            "-p" + res.port.toString(36) +
            "-f" + features.toString(36) +
            "&nm=" + encodeURIComponent(q.m||"Host");
        document.location = "/panel/rec/";

    }).catch(function(ex) {
        clientWindow.document.body.innerText = "Recording failed!\n\n" + ex + "\n\n" + ex.stack;
        document.location = "/panel/rec/";

    });
}

function toggle(feature) {
    var el = $("#alt-" + feature)[0];
    el.style.display = (el.style.display==="none")?"":"none";
}
</script>
