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
const db = require("../db.js").db;
const credits = require("../credits.js");
const creditsj = await include("../credits.jss");

const accountCredits = await creditsj.accountCredits(uid);

await include("../head.jss", {title: "Credits", paypal: true});

if (accountCredits.subscription) {
?>
    <section class="wrapper special">
        <p>You have a subscription, so you don't need credit for covered recordings. Any credit you had before subscribing will still be available if you cancel.</p>
    </section>
<?JS
}

if (accountCredits.subscription < 2) {
?>
    <section class="wrapper special<?JS= accountCredits.subscription?" style1":""?>">
        <p>Recording is currently free. The whole credit system is just here for testing purposes. It shouldn't be able to charge real money, but if you try it and it does, you're just giving me free money for no reason. Thanks!</p>

        <p id="current-credits"><?JS= credits.creditsMessage(accountCredits) ?></p>

        <p>Buy $<input type="text" id="amount" size=2 value="2" /> of credit:</p>
        <div id="paypal-button-container"></div>
        <p id="invalid1" class="warning">The minimum transaction is $2.</p>
        <p id="invalid2" class="warning">You may not have a total of more than 24 hours in credit.</p>

        <script type="text/javascript">
        (function() {
            var enabled = true;
            var invalid = "invalid1";
            PayPalLoader.load().then(function() {
            paypal.Buttons({
                onInit: function(data, actions) {
                    var amt = $("#amount")[0];

                    function validate() {
                        $("#invalid1")[0].style.display =
                            $("#invalid2")[0].style.display = "none";
                        var i = Number(amt.value);
                        var c = <?JS= credits.centsToCreditsClient("i*100") ?>;
                        if (i < 2) {
                            actions.disable();
                            invalid = "invalid1";
                            enabled = false;
                        } else if (<?JS= accountCredits.credits ?> + c > <?JS= config.maxCredits ?>) {
                            actions.disable();
                            invalid = "invalid2";
                            enabled = false;
                        } else {
                            actions.enable();
                            enabled = true;
                        }
                        i = Math.floor(i);
                        if (i+"" !== amt.value)
                            amt.value = i+"";
                    }

                    amt.addEventListener("change", validate);
                    validate();
                },

                onClick: function(data, actions) {
                    if (enabled) return;
                    $("#"+invalid)[0].style.display = "block";
                },

                createOrder: function(data, actions) {
                    if (!enabled) return;
                    var value = $("#amount")[0].value + ".00";
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
                    // To avoid confusion, don't show the current value while reloading
                    $("#current-credits")[0].style.display = "none";

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
                        document.location.reload();
                    });
                }
            }).render("#paypal-button-container");
            });
        })();
        </script>
    </section>

<?JS
}

await include("../../tail.jss");
?>
