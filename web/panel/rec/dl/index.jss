<?JS
/*
 * Copyright (c) 2020-2024 Yahweasel
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

// Get all the info and make sure it's correct
const uid = await include("../../uid.jss");
if (!uid) return;

if (!request.query.i)
    return writeHead(302, {"location": "/panel/rec/"});

const rid = Number.parseInt(request.query.i, 36);

const cp = require("child_process");
const fs = require("fs");

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const payment = require("../payment.js");
const reclib = await include("../lib.jss");
const recM = require("../rec.js");
const credits = require("../credits.js");
const creditsj = await include("../../credits.jss");

const recInfo = await recM.get(rid, uid);
if (!recInfo)
    return writeHead(302, {"location": "/panel/rec/"});
let recInfoExtra = null;
try {
    recInfoExtra = JSON.parse(recInfo.extra);
} catch (ex) {}

let hasCaptionsFile = false;
try {
    fs.accessSync(config.rec + "/" + rid + ".ogg.captions", fs.constants.R_OK);
    hasCaptionsFile = true;
} catch (ex) {}

const accountCredits = await creditsj.accountCredits(uid);
const preferredGateway = await payment.preferredGateway(uid);

/* Account for the weird case of free recordings (shouldn't happen, but bug in
 * their favor) */
if (recInfo.cost === 0 && !recInfo.purchased && recInfo.status >= 0x30)
    recInfo.purchased = "1";

// Possibly finish a Stripe purchase
if (request.query.ps) {
    let ps = request.query.ps;
    if (ps instanceof Array)
        ps = ps[ps.length - 1];
    const stripeFinalizeCheckout = await include("../../credits/stripe/finalize-checkout.jss");
    const res = await stripeFinalizeCheckout.finalizeCheckout(uid, ps);
    if (!res.success) {
        // This is not a clean way to inform them, but we need some way
        ?>
        <script type="text/javascript">
            alert(<?JS= JSON.stringify(res.reason) ?>);
        </script>
        <?JS
    } else {
        // Purchase the recording
        request.query.p = "1";
    }
}

// Possibly purchase it now
if (request.query.p && !recInfo.purchased && recInfo.status >= 0x30) {
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            // Decrease credits
            await db.runP("UPDATE credits SET credits=credits-@COST WHERE uid=@UID;", {
                "@UID": uid,
                "@COST": recInfo.cost
            });

            var row = await db.getP("SELECT credits FROM credits WHERE uid=@UID;", {
                "@UID": uid
            });
            if (!row || row.credits < 0) {
                await db.runP("ROLLBACK;");
                break;
            }

            // Mark as purchased
            await db.runP("UPDATE recordings SET purchased=datetime('now') WHERE uid=@UID AND rid=@RID;", {
                "@UID": recInfo.uid,
                "@RID": rid
            });
            accountCredits.credits -= recInfo.cost;
            recInfo.purchased = "1";

            await db.runP("COMMIT;");

            // Log it
            log("recording-purchased", JSON.stringify(recInfo), {uid, rid});

            break;

        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    // Redirect to the normal download site
    writeHead(302, {"location": "?i=" + recInfo.rid.toString(36)});
    return;
}

// If they requested captioning, perform it
if (request.query.captionImprover && recInfo.purchased &&
    (!recInfoExtra || !recInfoExtra.captionImprover)) {
    // Start the process
    const p = cp.spawn("./caption-improver-runpod-whisper.js", [
        `${config.rec}/${rid}.ogg.captions`, `${rid}`
    ], {
        cwd: `${config.repo}/cook`,
        stdio: "ignore",
        detached: true
    });
    recInfoExtra = recInfoExtra || {};
    recInfoExtra.captionImprover = p.pid || true;

    // And mark it as in progress
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            // Get the current status
            let row = await db.getP("SELECT extra FROM recordings WHERE uid=@UID AND rid=@RID;", {
                "@UID": recInfo.uid,
                "@RID": rid
            });
            if (!row) {
                await db.runP("ROLLBACK;");
                break;
            }

            // Add the captionImprover pid
            let extra = {};
            try {
                extra = JSON.parse(row.extra);
            } catch (ex) {}
            extra.captionImprover = p.pid || true;
            extra = JSON.stringify(extra);

            // And put it back
            await db.runP("UPDATE recordings SET extra=@EXTRA WHERE uid=@UID AND rid=@RID;", {
                "@EXTRA": extra,
                "@UID": uid,
                "@RID": rid
            });

            await db.runP("COMMIT;");

            break;

        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    // Redirect to the normal download site
    writeHead(302, {"location": "?i=" + recInfo.rid.toString(36)});
    return;
}

const dlName = (function() {
    if (recInfo.name)
        return recInfo.name;
    else
        return rid.toString(36);
})();

const uriName = encodeURIComponent(dlName);
const safeName = dlName.replace(/[^A-Za-z0-9]/g, "_");

function formatToName(format) {
    if (format === "aup")
        return "Audacity project";
    else if (format === "opus")
        return "Opus";
    else if (format === "vorbis")
        return "Ogg Vorbis";
    else if (format === "vtt")
        return "WebVTT captions";
    else
        return format.toUpperCase();
}

// Maybe do an actual download
if (request.query.f) {
    if (!request.query.s && !recInfo.purchased) {
        // Trying to do a full download of an un-purchased recording
        writeHead(402);
        write("You must purchase this recording before downloading a non-sample version.");
        return;
    }

    // No need for compression, as the download is already compressed
    response.compress(null);

    var format = "flac", container = "zip", mext = "flac", ext = "zip",
        mime = "application/zip", thru = null;
    switch (request.query.f) {
        case "aup":
            container = "aupzip";
            mext = "aup";
            break;
        case "aac":
            format = mext = "aac";
            break;
        case "opus":
            format = mext = "opus";
            break;
        case "vorbis":
            format = "vorbis";
            mext = "ogg";
            break;
        case "wav":
            format = mext = "wav";
            break;
        case "vtt":
            format = mext = "vtt";
            break;
        case "raw":
        case "sfx":
            format = request.query.f;
            container = "ogg";
            mext = null;
            ext = "ogg";
            mime = "audio/ogg";
            if (request.query.s) {
                writeHead(402);
                write("Raw audio is only available with purchase.");
                return;
            }
            break;
        case "info":
            format = "info";
            container = "json";
            mext = null;
            ext = "json";
            mime = "application/json";
            break;
        case "infotxt":
            format = "infotxt";
            container = "txt";
            mext = null;
            ext = "txt";
            mime = "text/plain";
            break;
        case "captions":
            format = "captions";
            container = "json";
            mext = null;
            ext = "json";
            mime = "application/json";
            break;
    }

    // If we're doing raw audio, possibly run it thru oggcorrect
    if (request.query.t) {
        let subTrack = 0;
        if (request.query.st)
            subTrack = Number.parseInt(request.query.st, 36);
        thru = [
            config.repo + "/cook/oggcorrect",
            Number.parseInt(request.query.t, 36), subTrack
        ];
    }

    writeHead(200, {
        "content-type": mime,
        "content-disposition": "attachment; filename=\"" + uriName + (request.query.s?"-sample":"") + (mext?"."+mext:"") + "." + ext + "\""
    });

    // Give plenty of time
    response.setTimeLimit(1000*60*60*24);

    // Handler for raw parts
    async function sendPart(part, writer) {
        await new Promise(function(res, rej) {
            var st = fs.createReadStream(config.rec + "/" + rid + ".ogg." + part);
            st.on("data", writer);
            st.on("end", res);
        });
    }


    if (format === "raw") {
        // Set up thru if applicable
        var writer = write, p = null;
        if (thru) {
            p = cp.spawn(thru[0], thru.slice(1), {
                stdio: ["pipe", "pipe", "ignore"]
            });
            p.stdout.on("data", write);
            writer = p.stdin.write.bind(p.stdin);
        }

        // Do the raw download
        await sendPart("header1", writer);
        await sendPart("header2", writer);
        await sendPart("data", writer);
        if (thru) {
            await sendPart("header1", writer);
            await sendPart("header2", writer);
            await sendPart("data", writer);
        }

        // Possibly wait for the thru program
        if (p) {
            await new Promise(function(res, rej) {
                p.stdin.end();
                p.stdout.on("end", res);
            });
        }

    } else if (format === "sfx") {
        await new Promise((res, rej) => {
            const p = cp.spawn(config.repo + "/cook/sfx-partwise.sh",
                [config.rec, ""+rid, ""+Number.parseInt(request.query.t, 36)],
                {
                    stdio: ["ignore", "pipe", "ignore"]
                }
            );
            p.stdout.on("data", write);
            p.stdout.on("end", res);
        });

    } else {
        // Jump through to the actual downloader
        await new Promise(function(resolve) {
            const args = [
                "--id", `${rid}`,
                "--rec-base", config.rec,
                "--file-name", safeName,
                "--format", format,
                "--container", container
            ];
            if (request.query.s)
                args.push("--sample");

            if (format === "vtt")
                args.push("--exclude", "audio");
            else if (format === "captions")
                args.push("--include", "captions");

            const p = cp.spawn(config.repo + "/cook/cook2.sh", args, {
                stdio: ["ignore", "pipe", "ignore"]
            });

            p.stdout.on("data", write);
            p.stdout.on("end", resolve);
        });

    }

    return;
}

// Determine their platform
const mac = (/mac os x/i.test(params.HTTP_USER_AGENT));
const mobile = (/(android|iphone|ipad)/i.test(params.HTTP_USER_AGENT));
const recommend = [];
if (!mobile)
    recommend.push("aup");
const recommendBasic = (mac?"aac":"flac");
recommend.push(recommendBasic);

var samplePost = "";

// Function to show a download button
function showDL(format) {
    ?><a class="button dl" href="?i=<?JS= recInfo.rid.toString(36) ?>&f=<?JS= format + samplePost ?>" onclick="disableDownloads();"><?JS= formatToName(format) ?></a> <?JS
}

// Since we show the download header at different points, a function to generate it
function dlHeader() {
    ?><header><h2>Download <?JS= recInfo.name.replace(/[<>]/g, "") || "(Anonymous)" ?></h2></header><?JS
}

// We say "sample download" if it's a sample download
function maybeSample() {
    if (!recInfo.purchased) {
        ?>
        <a name="sample"></a>
        <header><h2>Sample Download</h2></header>
        <?JS
    } else {
        dlHeader();
    }
}

// Show the downloader
await include("../../head.jss", {title: "Download", paypal: !recInfo.purchased});

if (!recInfo.purchased)
    samplePost = "&s=1";
if (!recInfo.purchased && !request.query.s) {
?>
    <section class="wrapper special style1" id="purchase-dialog">
        <?JS dlHeader(); ?>

        <p>You have not purchased this recording and do not have a subscription<?JS= accountCredits.subscription?" at the required level":"" ?>. You may <a href="#sample">download a sample</a> of this recording below, purchase the recording here and then download it, or <a href="/panel/subscription/">subscribe</a> at an appropriate level and then download it.</p>

        <p>This recording will cost $<?JS= credits.creditsToDollars(recInfo.cost) ?>.</p>

        <?JS
        if (recInfo.status < 0x30) {
            ?><p>Purchase options will be available when the recording is finished. You may download a sample even while recording.</p><?JS

        } else if (recInfo.cost <= accountCredits.credits) {
            // They have enough to buy on credits
            ?>
            <p><?JS= credits.creditsMessage(accountCredits) ?></p>

            <p><a class="button" href="?i=<?JS= recInfo.rid.toString(36) ?>&p=1">Use $<?JS= credits.creditsToDollars(recInfo.cost) ?> of your credit to purchase this recording</a></p>
            <?JS

        } else {
            // They need some credits. Calculate how many.
            let needed = recInfo.cost - accountCredits.credits;
            let excess = false;
            let needD = credits.creditsToDollars(needed);
            let needC = Number(needD) * 100;
            const minC = config[preferredGateway].minimum;
            const minD = minC / 100;
            if (needC < minC) {
                needC = minC;
                needD = (needC / 100).toFixed(2);
                excess = true;
            }

            if (accountCredits.credits) {
                ?><p><?JS= credits.creditsMessage(accountCredits, !excess) ?></p><?JS
            }

            if (excess) {
                ?><p>Because the minimum transaction is $<?JS= minD ?>, you will be charged $<?JS= minD ?>. The excess will be availble as credit towards future recordings.</p><?JS
            } else if (accountCredits.credits) {
                ?><p>Your previous credit counts towards this transaction, so you will be charged $<?JS= needD ?>.</p><?JS
            }

            // Finally, the transaction
            if (preferredGateway === "paypal") {
                ?>
                <div id="paypal-button-container"></div>
    
                <script type="text/javascript">
                (function() {
                    PayPalLoader.load().then(function() {
                    paypal.Buttons({
                        createOrder: function(data, actions) {
                            var value = <?JS= JSON.stringify(needD) ?>;
                            return actions.order.create({
                                purchase_units: [{
                                    amount: {
                                        currency_code: "USD",
                                        value: value
                                    },
                                    description: "Ennuicastr credit",
                                    soft_descriptor: "Ennuicastr",
    
                                }],
                                application_context: {
                                    shipping_preference: "NO_SHIPPING"
                                }
                            });
                        },
    
                        onApprove: function(data, actions) {
                            // To avoid confusion, don't show the main pane while transacting
                            $("#purchase-dialog")[0].innerText = "Loading...";
    
                            return fetch("/panel/credits/paypal/", {
                                method: "POST",
                                headers: {"content-type": "application/json"},
                                body: JSON.stringify({id:data.orderID})
    
                            }).then(function(res) {
                                return res.text();
    
                            }).then(function(res) {
                                try {
                                    res = JSON.parse(res);
                                } catch (ex) {
                                    alert("Order failed! You have not been charged. Details: " + res);
                                    return;
                                }
                                if (!res.success) {
                                    alert("Order failed! You have not been charged. Details: " + res.reason);
                                    return;
                                }
    
                            }).catch(function(ex) {
                                alert("Order failed! You have not been charged. " + ex.stack);
                            }).then(function() {
                                document.location = "?i=<?JS= recInfo.rid.toString(36) ?>&p=1";
                            });
                        }
                    }).render("#paypal-button-container");
                    });
                })();
                </script>
                <?JS

            } else if (preferredGateway === "stripe") {
                ?>
                <p>
                <button id="stripe-checkout">
                    <i class="bx bxl-stripe"></i>
                    Check out $<?JS= needD ?>
                </button>
                </p>

                <script type="text/javascript">
                (function() {
                    const btn = document.getElementById("stripe-checkout");
                    btn.onclick = function() {
                        btn.disabled = true;

                        fetch("/panel/credits/stripe/checkout-session.jss", {
                            method: "POST",
                            headers: {"content-type": "application/json"},
                            body: JSON.stringify({
                                value: <?JS= needed ?>,
                                success_url: document.location.href,
                                cancel_url: document.location.href
                            })

                        }).then(function(res) {
                            return res.json();

                        }).then(function(res) {
                            if (!res.success) {
                                alert("Checkout failed! You have not been charged. Details: " + res.reason);
                                return;
                            }

                            document.location.href = res.url;

                        }).catch(console.error);
                    };
                })();
                </script>
                <?JS

            }

        }
        ?>

        <p>If you would like to use a different payment gateway, you can <a href="/panel/gateway/?r=/panel/rec/dl/%3Fi=<?JS= rid.toString(36) ?>">change it at any time</a>.</p>
    </section>
<?JS

// Check for captioning in progress
} else if (recInfoExtra && recInfoExtra.captionImprover) {
    if (!hasCaptionsFile) {
?>
        <section class="wrapper special style1" id="captions-dialog">
            <header><h2>Note</h2></header>

            <p>Transcription is currently in progress. The transcript is not yet available.</p>

            <?JS if (recInfo.transcription) { ?>
                <p>The captions generated live while recording are available until the improved captions have been generated.</p>
            <?JS } ?>
        </section>
<?JS
    }
}
?>

<section class="wrapper special">
    <?JS maybeSample(); ?>

    <p><?JS= reclib.recordingName(recInfo) ?></p>

    <?JS if (recInfo.end) { ?>
    <p>Recording duration: <?JS {
        const start = new Date(recInfo.start);
        const end = new Date(recInfo.end);
        const dur = end.getTime() - start.getTime();
        let m = Math.round(dur / 60000);
        let h = Math.floor(m / 60);
        m -= h * 60;
        if (h) {
            write(`${h} hour`);
            if (h !== 1)
                write("s");
        }
        write(` ${m} minute`);
        if (m !== 1)
            write("s");
    } ?><br/>
    <span style="font-size: 0.8em">
    (NOTE: This duration will be incorrect if you paused during recording)
    </span></p>
    <?JS } ?>

    <p>Please choose a format</p>

    <script type="text/javascript"><!--
    function disableDownloads() {
        document.querySelectorAll(".dl").forEach(function(b) {
            b.classList.add("disabled");
        });
    }
    //--></script>

    <header><h3>Suggested formats</h3></header>

    <p><span style="display: inline-block; max-width: 50em;">
    <?JS if (!mobile) { ?>
    If you use Audacity (a popular, free audio editor), download the Audacity project. Otherwise, the
    <?JS } else { ?>
    The
    <?JS } ?>
    suggested format for your platform is <?JS= formatToName(recommendBasic) ?>.</span></p>

    <p><?JS
    recommend.forEach(showDL);
    ?></p>

    <p>&nbsp;</p>

    <div id="video-box" style="display: none">
    <header><h3>Video</h3></header>

    <p><span style="display: inline-block; max-width: 50em;">Video recorded during this session is stored in your browser.</span></p>

    <p><button id="video-button">Fetch video</button></p>

    <p>&nbsp;</p>
    </div>

    <?JS
    if (recInfo.purchased) {
        ?>
        <header><h3>Transcript</h3></header>

        <?JS
        if (hasCaptionsFile) {
        ?>
            <p><?JS showDL("vtt"); ?></p>
        <?JS
        } else if (recInfo.transcription) {
        ?>
        <p>Transcript generated while recording:<br/><?JS showDL("vtt"); ?></p>
        <?JS } ?>

        <?JS
        if (!recInfoExtra || !recInfoExtra.captionImprover) {
        ?>
        <p><a class="button" href="<?JS= `?i=${recInfo.rid.toString(36)}&amp;captionImprover=1` ?>">Transcribe speech</a></p>

        <p><span style="display: inline-block; max-width: 50em;">NOTE: Transcriptions are inferred by OpenAI Whisper. If you choose to generate a transcription, your audio data will be sent to a server operated by <a href="https://www.runpod.io/">RunPod</a>. Consult <a href="https://www.runpod.io/legal/privacy-policy">their privacy policy</a> for further information.</p>
        <?JS } ?>

        <p>&nbsp;</p>
        <?JS
    }
    ?>

    <?JS
    if (recInfo.purchased) {
        ?>
        <header><h3>Advanced processing</h3></header>

        <p><span style="display: inline-block; max-width: 50em;">If you need your audio mixed or leveled, want to perform noise reduction, or need other formats such as Apple's ALAC or uncompressed WAV, you can use this tool to do processing in your browser:</span></p>

        <p><a class="button" href="<?JS= config.ennuizel ?>?i=<?JS= recInfo.rid.toString(36) ?>&k=<?JS= recInfo.wskey.toString(36) ?>&nm=<?JS= uriName ?>" target="_blank">Advanced processing</a></p>

        <p>&nbsp;</p>
        <?JS
    }
    ?>

    <header><h3>Other formats</h3></header>

    <p><?JS
    if (mobile)
        showDL("aup");
    ["wav", (mac?"flac":"aac"), "opus", "vorbis"].forEach(showDL);
    ?></p>

    <?JS
    if (recInfo.purchased) {
        ?><p>Raw audio (NOTE: No audio editor will correctly read this file!): <a href="?i=<?JS= recInfo.rid.toString(36) ?>&f=raw">Raw</a></p><?JS
    }
    ?>
</section>

<script type="text/javascript" src="<?JS= config.client + "libs/sha512-es.min.js" ?>"></script>
<script type="text/javascript">(function() {
    var fs = new URL(<?JS= JSON.stringify(config.client + "fs/") ?>);
    var ifr = document.createElement("iframe");
    ifr.style.display = "none";
    ifr.src = fs.toString();

    var mp, key;

    window.addEventListener("message", function(ev) {
        if (ev.origin !== fs.origin)
            return;
        if (typeof ev.data !== "object" || ev.data === null || ev.data.c !== "ennuicastr-file-storage")
            return;
        mp = ev.data.port;
        mp.onmessage = onmessage;
        mp.postMessage({c: "ennuicastr-file-storage"});
    });

    function onmessage(ev) {
        var msg = ev.data;
        switch (msg.c) {
            case "salt":
                var hash = window["sha512-es"].default.hash;
                key = hash(hash(
                    <?= JSON.stringify(rid + ":" + recInfo.key + ":" + recInfo.master) ?> +
                    ":" + msg.global) +
                    ":" + msg.local);
                mp.postMessage({c: "list", key: key});
                break;

            case "list":
                var files = msg.files;
                if (files.length) {
                    document.getElementById("video-box").style.display = "";
                    document.getElementById("video-button").onclick = function() {
                        for (var i = 0; i < files.length; i++)
                            mp.postMessage({c: "download", id: files[i].id, key: key});
                    };
                }
                break;
        }
    }

    document.body.appendChild(ifr);
})();</script>

<?JS
await include("../../../tail.jss");
?>
