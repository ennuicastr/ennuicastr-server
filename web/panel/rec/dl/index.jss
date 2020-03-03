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

// Get all the info and make sure it's correct
const uid = await include("../../uid.jss");
if (!uid) return;

if (!request.query.i)
    return writeHead(302, {"location": "/panel/rec/"});

const rid = Number.parseInt(request.query.i, 36);

const cp = require("child_process");
const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const reclib = await include("../lib.jss");
const credits = require("../credits.js");
const creditsj = await include("../../credits.jss");

const recInfo = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
if (recInfo.uid !== uid)
    return writeHead(302, {"location": "/panel/rec/"});

const accountCredits = await creditsj.accountCredits(uid);

/* Account for the weird case of free recordings (shouldn't happen, but bug in
 * their favor) */
if (recInfo.cost === 0 && !recInfo.purchased)
    recInfo.purchased = "1";

// Possibly purchase it now
if (request.query.p && !recInfo.purchased) {
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            /* BETA
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
            */

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
}

const dlName = (function() {
    if (recInfo.name)
        return recInfo.name.replace(/["\r\n\\]/g, "_");
    else
        return rid.toString(36);
})();

const safeName = dlName.replace(/[^A-Za-z0-9]/g, "_");

function formatToName(format) {
    if (format === "aup")
        return "Audacity project";
    else if (format === "heaac")
        return "HE-AAC";
    else if (format === "opus")
        return "Opus";
    else
        return format.toUpperCase();
}

// Maybe do an actual download
if (request.query.f) {
    var format = "flac", container = "zip", mext = "flac",
        mime = "application/zip";
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
    }

    writeHead(200, {
        "content-type": mime,
        "content-disposition": "attachment; filename=\"" + dlName + "." + mext + ".zip\""
    });

    // Give plenty of time
    response.setTimeLimit(1000*60*60*3);

    // Jump through to the actual downloader
    await new Promise(function(resolve) {
        var p = cp.spawn(config.repo + "/cook/cook.sh", [config.rec, safeName, rid, format, container], {
            stdio: ["ignore", "pipe", "ignore"]
        });

        p.stdout.on("data", (chunk) => {
            write(chunk);
        });

        p.stdout.on("end", resolve);
    });

    return;
}

// Determine their platform
var mac = (/mac os x/i.test(params.HTTP_USER_AGENT));
var recommend = (mac?"heaac":"flac");

// Function to show a download button
function showDL(format) {
    ?><a class="button dl" href="?i=<?JS= recInfo.rid.toString(36) ?>&f=<?JS= format ?>" onclick="disableDownloads();"><?JS= formatToName(format) ?></a> <?JS
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
await include("../../head.jss", {title: "Download", paypal: true});

if (!recInfo.purchased) {
?>
    <section class="wrapper special style1" id="purchase-dialog">
        <?JS dlHeader(); ?>

        <p>(<strong>NOTE:</strong> During closed beta, you may ignore this message and download complete audio below.)</p>

        <p>You have not purchased this recording and do not have a subscription<?JS= accountCredits.subscription?" at the required level":"" ?>. You may <a href="#sample">download a sample</a> of this recording below, purchase the recording here and then download it, or <a href="/panel/subscription/">subscribe</a> at an appropriate level and then download it.</p>

        <p>This recording will cost $<?JS= credits.creditsToDollars(recInfo.cost) ?>.</p>

        <?JS
        if (recInfo.cost <= accountCredits.credits) {
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

    <p><?JS
    ["aup", recommend].forEach(showDL);
    ?></p>

    <header><h3>Other formats</h3></header>

    <p><?JS
    [(mac?"flac":"heaac"), "aac", "opus"].forEach(showDL);
    ?></p>
</section>

<?JS
await include("../../../tail.jss");
?>
