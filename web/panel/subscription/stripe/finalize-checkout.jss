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

const s = await include("./s.jss");

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

    if (!chkout || !chkout.data || !chkout.data.subscription) {
        // No checkout session ID!
        return fail("Could not retrieve checkout data");
    }

    // The rest is up to the subscription module
    return await s.updateSubscription(
        uid, "stripe:" + chkout.data.subscription, {activateOnly: true}
    );
}

module.exports = {finalizeCheckout};
?>
