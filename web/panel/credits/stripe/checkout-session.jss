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

const uid = await include("../../uid.jss");
if (!uid) return;

const nrc = new (require("node-rest-client-promise")).Client();

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const credits = require("../credits.js");
const login = await include("../../login/login.jss");

if (!request.body || !request.body.success_url || !request.body.cancel_url ||
    !request.body.value ||
    typeof request.body.success_url !== "string" ||
    typeof request.body.cancel_url !== "string" ||
    typeof request.body.value !== "number") {
    writeHead(500);
    write("{\"success\":false}");
    return;
}

// Sanitize the info
let success_url = request.body.success_url,
    cancel_url = request.body.cancel_url;
if (success_url.indexOf(config.panel) !== 0 ||
    success_url.indexOf("..") !== -1) {
    success_url = config.panel;
}
if (cancel_url.indexOf(config.panel) !== 0 ||
    cancel_url.indexOf("..") !== -1) {
    cancel_url = config.panel;
}
const value = ~~request.body.value;
let cents = credits.creditsToCents(value);
if (cents < config.stripe.minimum)
    cents = config.stripe.minimum;

writeHead(200, {"content-type": "application/json"});

function fail(reason) {
    write(JSON.stringify({success: false, reason}));
}

const authorization = "Basic " + Buffer.from(config.stripe.secret).toString("base64");

// The success URL should have callback info
if (success_url.indexOf("?") === -1)
    success_url += "?";
else
    success_url += "&";
success_url += "ps={CHECKOUT_SESSION_ID}";

// Create the checkout session
const chkout = await nrc.postPromise("https://api.stripe.com/v1/checkout/sessions", {
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        authorization
    },
    data: {
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": "Ennuicastr credit",
        "line_items[0][price_data][unit_amount]": cents,
        "line_items[0][quantity]": 1,
        mode: "payment",
        success_url,
        cancel_url
    }
});
if (!chkout || !chkout.data || !chkout.data.id) {
    // No checkout session ID!
    return fail("Could not create checkout session");
}

log("stripe-checkout-session", JSON.stringify(chkout.data), {uid});

write(JSON.stringify({
    success: true,
    id: chkout.data.id,
    url: chkout.data.url
}));
?>
