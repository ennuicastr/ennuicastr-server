<?JS!
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

const nrc = new (require("node-rest-client-promise")).Client();

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const login = await include("../../login/login.jss");
const credits = require("../credits.js");

const authorization = "Basic " + Buffer.from(config.paypal.clientId + ":" + config.paypal.secret).toString("base64");

async function cancel(sid) {
    return await nrc.postPromise("https://" + config.paypal.api + "/v1/billing/subscriptions/" + sid + "/cancel", {
        headers: {
            "content-type": "application/json",
            authorization
        },
        data: JSON.stringify({
            reason: "Unspecified"
        })
    });
}

async function updateSubscription(uid, sid, sconfig) {
    sconfig = sconfig || {};

    function fail(reason) {
        return {success: false, reason};
    }

    // Only paypal subscriptions are supported
    var parts = /^paypal:(.*)$/.exec(sid);
    if (!parts) return fail("Unsupported subscription service");
    sid = parts[1];

    // Check for a previous subscription
    var accountCredits = await credits.accountCredits(uid);
    var prevSubscription = null;
    if (accountCredits.subscription) {
        parts = /^paypal:(.*)$/.exec(accountCredits.subscription_id);
        if (!parts) return fail("Unsupported subscription service");
        prevSubscription = parts[1];
    }

    // Get the subscription details
    var subscription = await nrc.getPromise("https://" + config.paypal.api + "/v1/billing/subscriptions/" + sid, {
        headers: {
            "content-type": "application/json",
            authorization
        }
    });
    subscription = subscription.data;

    // Figure out which subscription it is
    var level = 0;
    if (subscription.plan_id === config.paypal.subscription.basic.id)
        level = 1;
    else if (subscription.plan_id === config.paypal.subscription.hq.id)
        level = 2;
    else if ((prevSubscription || sconfig.updateOnly) &&
             subscription.plan_id === config.paypal.subscription.hqBasicUpgrade.id)
        level = 2;

    // Ignore it if it's not active
    if (subscription.status !== "ACTIVE")
        level = 0;

    // Figure out when it expires
    var startTime = "0", expiry = "0";
    if (level) {
        startTime = subscription.start_time;
        expiry = subscription.billing_info.next_billing_time;
    }

    if (level === 0) {
        if (sconfig.activateOnly)
            return fail("Unrecognized subscription plan");
        else
            sid = "";
    }

    // This is our only opportunity to remember email addresses for PayPal users
    try {
        await login.setEmail(uid, order.subscriber.email_address);
    } catch (ex) {}

    // Update the user's account
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            // Make sure the user has defined credits
            var row = await db.getP("SELECT credits FROM credits WHERE uid=@UID;", {"@UID": uid});
            if (!row) {
                await db.runP("INSERT INTO credits (uid, credits, purchased, subscription, subscription_expiry, subscription_id) VALUES " +
                              "(@UID, 0, 0, 0, '', '');", {"@UID": uid});
            }

            // Then update it
            await db.runP("UPDATE credits SET " +
                "subscription=@LEVEL, " +
                //"subscription_expiry=max(datetime(@START, '1 month', '1 day'), datetime(@EXPIRY, '1 day')), " +
                "subscription_expiry=datetime(@EXPIRY, '1 day'), " +
                "subscription_id=@SID WHERE uid=@UID;", {
                "@UID": uid,
                "@LEVEL": level,
                "@EXPIRY": expiry,
                "@SID": (sid ? ("paypal:" + sid) : "")
            });

            await db.runP("COMMIT;");
            break;
        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    // Log it
    if (level > 0)
        log("purchased-subscription", JSON.stringify({subscription, level}), {uid});
    else
        log("expired-subscription", JSON.stringify({level}), {uid});

    // And cancel any old subscription
    if (prevSubscription) {
        let res = await cancel(prevSubscription);
        res = res.data;
        log("canceled-subscription", JSON.stringify(res), {uid});
    }

    return {success: true, level};
}

async function cancelSubscription(uid, sconfig) {
    sconfig = sconfig || {};

    function fail(reason) {
        return {success: false, reason};
    }

    // Check for the current subscription
    var accountCredits = await credits.accountCredits(uid);
    var sid = null;
    if (accountCredits.subscription) {
        // If it's already canceled, say so
        if (/^canceled:/.test(accountCredits.subscription_id))
            return fail("Already canceled");

        parts = /^paypal:(.*)$/.exec(accountCredits.subscription_id);
        if (!parts) return fail("Unsupported subscription service");
        sid = parts[1];
    } else {
        return fail("Not subscribed");
    }

    // Cancel the subscription
    let result = await cancel(sid);
    if (result.response.statusCode !== 204)
        return fail("Paypal refused the cancelation? " + result.response.statusCode);

    // Update the user's account
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            await db.runP("UPDATE credits SET " +
                "subscription_id=@SID WHERE uid=@UID;", {
                "@SID": ("canceled:paypal:" + sid),
                "@UID": uid
            });

            await db.runP("COMMIT;");
            break;
        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    // Log it
    log("canceled-subscription", JSON.stringify(sid), {uid});

    return {success: true};
}

module.exports = {updateSubscription, cancelSubscription};
?>
