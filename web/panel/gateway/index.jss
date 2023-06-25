<?JS
/*
 * Copyright (c) 2023 Yahweasel
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

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const payment = require("../payment.js");

// Set it if asked
if (request.query.g) {
    const g = request.query.g === "stripe" ? "stripe" :
        "paypal";

    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");
            await db.runP("DELETE FROM preferred_payment_gateways WHERE uid=@UID;", {
                "@UID": uid
            });
            await db.runP("INSERT INTO preferred_payment_gateways (uid, gateway) VALUES (@UID, @GATEWAY);", {
                "@UID": uid,
                "@GATEWAY": g
            });
            await db.runP("COMMIT;");
            break;
        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    if (request.query.r) {
        const r = request.query.r;
        if (r.indexOf(config.panel) === 0 || r.indexOf("/panel/") === 0) {
            writeHead(302, {"location": r});
            return;
        }
    }
}

let returnAddr = "";
if (request.query.r)
    returnAddr = "&amp;r=" + encodeURIComponent(request.query.r);

const preferredGateway = await payment.preferredGateway(uid);
const preferredGatewayName = preferredGateway === "stripe" ? "Stripe" :
    "PayPal";

await include("../head.jss", {title: "Preferred Payment Gateway"});
?>

<section class="wrapper special">
    <p>Your current preferred payment gateway is <?JS= preferredGatewayName ?>.</p>

    <p>Set your preferred payment gateway:</p>

    <h2><i class="bx bxl-paypal"></i> PayPal</h2>
    <p>Minimum charge: $<?JS= config.paypal.minimum / 100 ?></p>
    <p><a href="?g=paypal<?JS= returnAddr ?>" class="button">
        <i class="bx bxl-paypal"></i>
        Use PayPal
    </a><br/><br/></p>

    <h2><i class="bx bxl-stripe"></i> Stripe</h2>
    <p>Minimum charge: $<?JS= config.stripe.minimum / 100 ?></p>
    <p>Note: Stripe is supported in some countries that do not support PayPal, but a different minimum is required due to their different fee structures.</p>
    <p><a href="?g=stripe<?JS= returnAddr ?>" class="button">
        <i class="bx bxl-stripe"></i>
        Use Stripe
    </a></p>
</section>

<?JS
await include("../../tail.jss");
?>
