<?JS!
/*
 * Copyright (c) 2020-2022 Yahweasel
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

const credits = require("../credits.js");
const s = {
    "paypal": await include("subscription/paypal/s.jss"),
    "stripe": await include("subscription/stripe/s.jss")
};

async function accountCredits(uid) {
    let c = await credits.accountCredits(uid);
    if (c.subscription_expired) {
        // Check if it's been updated
        const parts = /^([^:]*):(.*)/.exec(c.subscription_id);
        if (parts && parts[1] && s[parts[1]]) {
            await s[parts[1]].updateSubscription(
                uid, c.subscription_id, {updateOnly: true});
            c = await credits.accountCredits(uid);
        }
    }
    return c;
}

module.exports = {accountCredits};
?>
