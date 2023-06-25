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
const creditsj = await include("../../credits.jss");
const login = await include("../../login/login.jss");

if (!request.body || !request.body.success_url || !request.body.cancel_url ||
    !request.body.type ||
    typeof request.body.success_url !== "string" ||
    typeof request.body.cancel_url !== "string" ||
    typeof request.body.type !== "string") {
    writeHead(500);
    write("{\"success\":false}");
    return;
}

const accountCredits = await creditsj.accountCredits(uid);

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
const type = request.body.type === "hq" ? "hq" :
    request.body.type === "hqBasicUpgrade" ? "hq" :
    "basic";

let upgrade = request.body.type === "hqBasicUpgrade";
if (upgrade && !accountCredits.subscription)
    upgrade = false;

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

// Set up the request
const chkoutData = {
    "line_items[0][price]": config.stripe.subscription[type].id,
    "line_items[0][quantity]": 1,
    "mode": "subscription",
    success_url,
    cancel_url
};

// Possibly discount for upgrade
if (upgrade) {
    chkoutData["discounts[0][coupon]"] =
        config.stripe.subscription.hqBasicUpgrade.id;
}

// Create the checkout session
const chkout = await nrc.postPromise("https://api.stripe.com/v1/checkout/sessions", {
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        authorization
    },
    data: chkoutData
});
if (!chkout || !chkout.data || !chkout.data.id) {
    // No checkout session ID!
    return fail("Could not create checkout session");
}

log("stripe-subscription-session", JSON.stringify(chkout.data), {uid});

write(JSON.stringify({
    success: true,
    id: chkout.data.id,
    url: chkout.data.url
}));
?>
