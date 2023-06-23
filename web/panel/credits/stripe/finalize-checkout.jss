<?JS!
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

const nrc = new (require("node-rest-client-promise")).Client();

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const credits = require("../credits.js");

async function finalizeCheckout(uid, checkoutId) {
    checkoutId = checkoutId.replace(/[^A-Za-z0-9_]/g, "_");

    function fail(reason) {
        return {success: false, reason};
    }

    const authorization = "Basic " + Buffer.from(config.stripe.secret).toString("base64");

    // Get the checkout session
    const chkout = await nrc.getPromise(`https://api.stripe.com/v1/checkout/sessions/${checkoutId}`, {
        headers: {authorization}
    });

    if (!chkout || !chkout.data || !chkout.data.id) {
        // No checkout session ID!
        return fail("Could not retrieve checkout data");
    }

    if (chkout.data.payment_status !== "paid") {
        return fail("Checkout is not paid");
    }

    // Find the value
    let value = chkout.data.amount_subtotal;
    if (value < config.stripe.minimum || Number.isNaN(value))
        return fail("Invalid purchase value");

    // Figure out how many credits they just bought
    let purchased = credits.centsToCredits(value);

    // Add the credits to the user's account
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            // Make sure we haven't already done this one
            let row = await db.getP("SELECT * FROM stripe_checkouts WHERE checkout_id=@ID;", {"@ID": checkoutId});
            if (row) {
                await db.runP("ROLLBACK;");
                return fail("Checkout already finalized");
            }

            // Make sure the user has defined credits
            row = await db.getP("SELECT credits FROM credits WHERE uid=@UID;", {"@UID": uid});
            if (!row) {
                await db.runP("INSERT INTO credits (uid, credits, purchased, subscription, subscription_expiry) VALUES " +
                    "(@UID, 0, 0, 0, '');", {"@UID": uid});
                row = {credits: 0};
            }

            // Then update it
            await db.runP("UPDATE credits SET credits=credits+@V, purchased=purchased+@V WHERE uid=@UID;", {
                "@UID": uid,
                "@V": purchased
            });
            await db.runP("INSERT INTO stripe_checkouts (uid, checkout_id) VALUES (@UID, @ID)", {
                "@UID": uid,
                "@ID": checkoutId
            });

            await db.runP("COMMIT;");
            break;
        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    log("purchased-credits", JSON.stringify(chkout.data), {uid});

    return {success: true};
}

module.exports = {finalizeCheckout};
?>
