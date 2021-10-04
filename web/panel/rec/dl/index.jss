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
const reclib = await include("../lib.jss");
const credits = require("../credits.js");
const creditsj = await include("../../credits.jss");

const recInfo = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
if (!recInfo || recInfo.uid !== uid)
    return writeHead(302, {"location": "/panel/rec/"});

const accountCredits = await creditsj.accountCredits(uid);

/* Account for the weird case of free recordings (shouldn't happen, but bug in
 * their favor) */
if (recInfo.cost === 0 && !recInfo.purchased && recInfo.status >= 0x30)
    recInfo.purchased = "1";

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
                "@UID": uid,
                "@RID": rid
            });
            accountCredits.credits -= recInfo.cost;
            recInfo.purchased = "1";

            // Log it
            log("recording-purchased", JSON.stringify(recInfo), {uid, rid});

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
    else if (format === "heaac")
        return "HE-AAC";
    else if (format === "opus")
        return "Opus";
    else if (format === "vorbis")
        return "Ogg Vorbis";
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
        case "heaac":
            format = mext = "heaac";
            break;
        case "opus":
            format = mext = "opus";
            break;
        case "vorbis":
            format = "vorbis";
            mext = "ogg";
            break;
        case "raw":
            format = "raw";
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
    }

    // If we're doing raw audio, possibly run it thru oggstension
    if (request.query.t)
        thru = [config.repo + "/cook/oggstender", Number.parseInt(request.query.t, 36)];

    writeHead(200, {
        "content-type": mime,
        "content-disposition": "attachment; filename=\"" + uriName + (request.query.s?"-sample":"") + (mext?"."+mext:"") + "." + ext + "\""
    });

    // Give plenty of time
    response.setTimeLimit(1000*60*60*3);

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

        // Possibly wait for the thru program
        if (p) {
            await new Promise(function(res, rej) {
                p.stdin.end();
                p.stdout.on("end", res);
            });
        }

    } else if (format === "info") {
        write("{\"tracks\":{\n");
        await sendPart("users", write);
        write("},\"sfx\":");

        await new Promise((res, rej) => {
            let p = cp.spawn(config.repo + "/cook/sfx-partwise.sh",
                [config.rec, ""+rid],
                {
                stdio: ["ignore", "pipe", "ignore"]
            });
            p.stdout.on("data", write);
            p.stdout.on("end", res);
        });

        write("}\n");

    } else {
        // Jump through to the actual downloader
        await new Promise(function(resolve) {
            var args = [config.rec, safeName, rid, format, container];
            if (request.query.s)
                args.push("sample");

            var p = cp.spawn(config.repo + "/cook/cook.sh", args, {
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
const recommendBasic = (mac?"heaac":"flac");
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

if (!recInfo.purchased) {
    samplePost = "&s=1";
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
            var needed = recInfo.cost - accountCredits.credits;
            var excess = false;
            var needD = credits.creditsToDollars(needed);
            var needDF = Number(needD);
            if (needDF < 2) {
                needD = "2.00";
                needDF = 2;
                excess = true;
            }

            if (accountCredits.credits) {
                ?><p><?JS= credits.creditsMessage(accountCredits, !excess) ?></p><?JS
            }

            if (excess) {
                ?><p>Because the minimum transaction is $2, you will be charged $2. The excess will be availble as credit towards future recordings.</p><?JS
            } else if (accountCredits.credits) {
                ?><p>Your previous credit counts towards this transaction, so you will be charged $<?JS= needD ?>.</p><?JS
            }

            // Finally, the PayPal transaction
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

        }
        ?>
    </section>
<?JS

// Check for transcription with no finished post-processing
} else if (recInfo.transcription) {
    let hasCaptionsFile = false;
    try {
        fs.accessSync(config.rec + "/" + rid + ".ogg.captions", fs.constants.R_OK);
        hasCaptionsFile = true;
    } catch (ex) {}

    if (!hasCaptionsFile) {
?>
        <section class="wrapper special style1" id="captions-dialog">
            <header><h2>Note</h2></header>

            <p>Your recording used live captioning. Post-processing is currently running to improve the quality of the captions. That post-processing has not yet finished; check back later for improved captions. You may download with the original (live) captions now.</p>
        </section>
<?JS
    }
}
?>

<section class="wrapper special">
    <?JS maybeSample(); ?>

    <p>Please choose a format to download <?JS= reclib.recordingName(recInfo) ?></p>

    <script type="text/javascript"><!--
    function disableDownloads() {
        document.querySelectorAll(".dl").forEach(function(b) {
            b.classList.add("disabled");
        });
    }
    //--></script>

    <header><h3>Suggested formats</h3></header>

    <p><span style="display: inline-block; max-width: 50em">
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

    <?JS
    if (recInfo.purchased) {
        ?>
        <header><h3>Advanced processing</h3></header>

        <p><span style="display: inline-block; max-width: 50em">If you need your audio mixed or leveled, want to perform noise reduction, or need other formats such as Apple's ALAC or uncompressed WAV, you can use this tool to do processing in your browser:</span></p>

        <p><a class="button" href="/ez/?i=<?JS= recInfo.rid.toString(36) ?>&k=<?JS= recInfo.wskey.toString(36) ?>&nm=<?JS= uriName ?>" target="_blank">Advanced processing</a></p>

        <p>&nbsp;</p>
        <?JS
    }
    ?>

    <header><h3>Other formats</h3></header>

    <p><?JS
    if (mobile)
        showDL("aup");
    [(mac?"flac":"heaac"), "aac", "opus", "vorbis"].forEach(showDL);
    ?></p>

    <?JS
    if (recInfo.purchased) {
        ?><p>Raw audio (NOTE: No audio editor will correctly read this file!): <a href="?i=<?JS= recInfo.rid.toString(36) ?>&f=raw">Raw</a></p><?JS
    }
    ?>
</section>

<?JS
await include("../../../tail.jss");
?>
