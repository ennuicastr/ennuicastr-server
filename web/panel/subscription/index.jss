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

const uid = await include("../uid.jss");
if (!uid) return;

const config = require("../config.js");
const db = require("../db.js").db;
const creditsj = await include("../credits.jss");

const accountCredits = await creditsj.accountCredits(uid);

await include("../head.jss", {title: "Subscription", paypal: true, paypalArgs: "&vault=true"});

// General function for generating subscription buttons
async function genSub(level) {
    var sub = {
        plan_id: config.paypal.subscription[level].id,
        application_context: {
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE"
        }
    };

    ?>
    <div id="paypal-button-container-<?JS= level ?>"></div>

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

// Generate a cancel button
async function genCancel(id) {
    var parts = /^([^:]*):.*$/.exec(id);
    if (!parts || parts[1] === "canceled") return;

    if (parts[1] !== "paypal") {
        // Non-PayPal subscription. Something special, can't be canceled here.
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
        return fetch("/panel/subscription/paypal/", {
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
    if (accountCredits.subscription < 2) {
?>
        <p>You may upgrade your subscription to ultra-high quality for $<?JS= config.subscription.hq/100 ?>/month, with the first month at only $<?JS= (config.subscription.hq-config.subscription.basic)/100 ?>:</p>
        <?JS await genSub("hqBasicUpgrade"); ?>
<?JS
    }
?>

        <?JS genCancel(accountCredits.subscription_id); ?>

        <p>(If you have canceled your subscription, you still get to keep the remainder of your subscription time, and so are still subscribed until the expiry date above.)</p>

<?JS } else { ?>

        <p>Please bear in mind that Ennuicastr was in free beta until November 1st, and since the beta was free, the payment processing is the least-tested component of the system. If you have any concerns, and <em>certainly</em> if you encounter any problems, <a href="/contact/">contact us</a> and they will be resolved as soon as possible.</p>


        <h2>Basic subscription</h2>
        <p>$<?JS= config.subscription.basic/100 ?>/month, unlimited recordings in high quality (128kbit Opus)</p>
        <?JS await genSub("basic"); ?>

        <hr/>

        <h2>UHQ subscription</h2>
        <p>$<?JS= config.subscription.hq/100 ?>/month, unlimited recordings in ultra-high quality (lossless FLAC and/or continuous mode)</p>
        <?JS await genSub("hq"); ?>

<?JS
}
?>
    </section>

<?JS await include("../../tail.jss"); ?>
