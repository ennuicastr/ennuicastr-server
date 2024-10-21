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

const noRedirect = !!request.query.noredirect;

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

// Maybe do an actual download
if (request.query.f) {
    await include("./dl.jss", {rid, recInfo, uriName, safeName});
    return;
}

// Since we show the download header at different points, a function to generate it
function dlHeader() {
    ?><header><h2>Download <?JS= recInfo.name.replace(/[<>]/g, "") || "(Anonymous)" ?></h2></header><?JS
}

// Show the downloader
await include("../../head.jss", {title: "Download", paypal: !recInfo.purchased});

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

<link rel="stylesheet" href="ennuicastr-download-chooser.css" />

<section class="wrapper special">
    <?JS
    const {showDLHeader, showMainDLs, showOtherDLs, showDL} =
        await include("./dl-interface.jss", {rid, recInfo, dlHeader});

    showDLHeader();

    let useDLX = (recInfo.purchased && !request.query.nox);
    if (useDLX) {
        await include("./dlx-interface.jss", {rid, recInfo, safeName, noRedirect});
    } else {
        showMainDLs();
    }

    await include("./video-interface.jss", {rid, recInfo});

    if (/*!useDLX &&*/ recInfo.purchased) {
        await include("./transcript-interface.jss", {
            rid, recInfo, recInfoExtra, hasCaptionsFile, showDL
        });
    }

    if (!useDLX)
        showOtherDLs();
    ?>
</section>

<?JS
await include("../../../tail.jss");
?>
