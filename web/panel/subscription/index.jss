<?JS
/*
 * Copyright (c) 2020-2023 Yahweasel
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
const {uid, level} = uidX;

const config = require("../config.js");
const db = require("../db.js").db;
const creditsj = await include("../credits.jss");
const payment = require("../payment.js");

// Possibly finish a Stripe purchase
if (request.query.ps) {
    let ps = request.query.ps;
    if (ps instanceof Array)
        ps = ps[ps.length - 1];
    const stripeFinalizeCheckout = await include("stripe/finalize-checkout.jss");
    const res = await stripeFinalizeCheckout.finalizeCheckout(uid, ps);
    if (!res.success) {
        // This is not a clean way to inform them, but we need some way
        ?>
        <script type="text/javascript">
            alert(<?JS= JSON.stringify(res.reason) ?>);
        </script>
        <?JS
    } else {
        // Get rid of that ps= in the header
        writeHead(302, {location: "?"});
        return;
    }
}

const accountCredits = await creditsj.accountCredits(uid);
const preferredGateway = await payment.preferredGateway(uid);

await include("../head.jss", {title: "Subscription", paypal: true, paypalArgs: "&vault=true"});

// General function for generating subscription buttons (PayPal)
async function genSubPayPal(level) {
    var sub = {
        plan_id: config.paypal.subscription[level].id,
        application_context: {
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE"
        }
    };

    ?>
    <p><span id="paypal-button-container-<?JS= level ?>"></span></p>

    <script type="text/javascript">
    PayPalLoader.load().then(function() {
        paypal.Buttons({
            createSubscription: function(data, actions) {
                return actions.subscription.create(<?JS= JSON.stringify(sub) ?>);
            },

            onApprove: function(data, actions) {
                try {
                    document.getElementById("sub-box").innerHTML = "Loading...";
                } catch (ex) {}
                return fetch("/panel/subscription/paypal/", {
                    method: "POST",
                    headers: {"content-type": "application/json"},
                    body: JSON.stringify({id:data.subscriptionID})
                    
                }).then(function(res) {
                    return res.json();

                }).then(function(res) {
                    if (!res.success) {
                        alert("Subscription failed! Details: " + res.reason);
                        return;
                    }

                }).catch(function(ex) {
                }).then(function() {
                    document.location.reload();
                });
            }

        }).render('#paypal-button-container-<?JS= level ?>');
    });
    </script>
    <?JS
}

// General function for generating subscription buttons (Stripe)
async function genSubStripe(level) {
    ?>
    <p><button id="stripe-checkout-<?JS= level ?>">
        <i class="bx bxl-stripe"></i>
        Subscribe
    </button></p>

    <script type="text/javascript">
    (function() {
        const btn = document.getElementById("stripe-checkout-<?JS= level ?>");
        btn.onclick = function() {
            btn.disabled = true;

            fetch("/panel/subscription/stripe/checkout-session.jss", {
                method: "POST",
                headers: {"content-type": "application/json"},
                body: JSON.stringify({
                    type: <?JS= JSON.stringify(level) ?>,
                    success_url: document.location.href,
                    cancel_url: document.location.href
                })

            }).then(function(res) {
                return res.json();

            }).then(function(res) {
                if (!res.success) {
                    alert("Subscription failed! You have not been charged. Details: " + res.reason);
                    return;
                }

                document.location.href = res.url;

            }).catch(console.error);
        };
    })();
    </script>
    <?JS
}

async function genSub(level) {
    if (preferredGateway === "stripe") {
        return await genSubStripe(level);
    } else {
        return await genSubPayPal(level);
    }
}

// Generate a cancel button
async function genCancel(id) {
    var parts = /^([^:]*):.*$/.exec(id);
    if (!parts || parts[1] === "canceled") return;

    const gateway = parts[1];
    if (gateway !== "paypal" && gateway !== "stripe") {
        // Something special, can't be canceled here.
        ?>
        <p>If you wish to cancel your subscription, please <a href="/contact/">contact us</a>.</p>
        <?JS
        return;
    }

    ?>
    <p id="cancel-box" style="margin-top: 2em">
        <button id="cancel-button">Cancel subscription</button>
        <span id="cancel-sure" style="display: none">
            <br/>
            Are you sure?<br/>
            <button id="cancel-button-yes">Yes</button>
            <button id="cancel-button-no">No</button>
        </span>
    </p>

    <script type="text/javascript">(function() {
    var cbox = document.getElementById("cancel-box");
    var cb = document.getElementById("cancel-button");
    var cs = document.getElementById("cancel-sure");
    var cby = document.getElementById("cancel-button-yes");
    var cbn = document.getElementById("cancel-button-no");
    cb.onclick = function() {
        cb.disabled = true;
        cs.style.display = "";
    };
    cby.onclick = function() {
        cs.style.display = "none";
        return fetch("/panel/subscription/<?JS= gateway ?>/", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({cancel: true})

        }).then(function(res) {
            return res.json();

        }).then(function(res) {
            if (res.success) {
                cbox.innerText = "Your subscription has been canceled. Note that you still get to keep the remainder of your subscription time, so this page will only be updated when that time expires.";

            } else {
                alert("Cancelation failed! Details: " + res.reason);

            }

        }).catch(function(ex) {
            alert("Cancelation failed! Details: " + ex);

        });
    };
    cbn.onclick = function() {
        cb.disabled = false;
        cs.style.display = "none";
    };
    })();
    </script>
    <?JS
}

?>
    <section class="wrapper special" id="sub-box">
<?JS

// We do something different if they already have a subscription
if (accountCredits.subscription) {
?>
        <h2>Subscription</h2>

        <p>You have a<?JS= [""," basic","n ultra-high quality"][accountCredits.subscription] ?> subscription until <?JS= accountCredits.subscription_expiry ?> UTC. Thanks!</p>

<?JS
    if (accountCredits.subscription < 2 && level >= 2) {
?>
        <p>You may upgrade your subscription to ultra-high quality for $<?JS= config.subscription.hq/100 ?>/month, with the first month at only $<?JS= (config.subscription.hq-config.subscription.basic)/100 ?>:</p>
        <?JS await genSub("hqBasicUpgrade"); ?>
<?JS
    }
?>

        <?JS genCancel(accountCredits.subscription_id); ?>

        <p>(If you have canceled your subscription, you still get to keep the remainder of your subscription time, and so are still subscribed until the expiry date above.)</p>

<?JS } else if (level >= 2) { ?>

        <h2>Basic subscription</h2>
        <p>$<?JS= config.subscription.basic/100 ?>/month, unlimited recordings in high quality (128kbit Opus)</p>
        <?JS await genSub("basic"); ?>

        <hr/>

        <h2>UHQ subscription</h2>
        <p>$<?JS= config.subscription.hq/100 ?>/month, unlimited recordings in ultra-high quality (lossless FLAC and/or continuous mode)</p>
        <?JS await genSub("hq"); ?>

<?JS } else { ?>
        <p>Only an organization's admins may alter its subscription.</p>

<?JS } ?>

        <p>If you would like to use a different payment gateway, you can <a href="/panel/gateway/?r=/panel/subscription/">change it at any time</a>.</p>
    </section>

<?JS await include("../../tail.jss"); ?>
