<?JS
/*
 * Copyright (c) 2022 Yahweasel
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

const uidX = await include("../../uid.jss", {verbose: true});
if (!uidX) return;
if (request.query.o !== uidX.euid || uidX.level < 2 /* admin */)
    return writeHead(302, {"location": "/panel/org/"});
const oid = uidX.euid;
const uid = uidX.ruid;

const credits = require("../credits.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const unM = require("../username.js");

// Perform the database tomfoolery
let transferred = false, alreadySubscribed = false;
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        // Make sure they're in
        const share = await db.getP("SELECT * FROM user_share WHERE uid_shared=@OID AND uid_target=@UID;", {
            "@OID": oid,
            "@UID": uid
        });
        if (!share) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Make sure they're an admin
        if (share.level < 2 /* admin */) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Get the *from* credits
        const fromCredits = await credits.accountCredits(uid);
        if (!fromCredits) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Get the *to* credits
        const toCredits = await credits.accountCredits(oid);
        if (!toCredits) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Check that the organization does not already have a subscription
        if (toCredits.subscription) {
            await db.runP("ROLLBACK;");
            alreadySubscribed = true;
            break;
        }

        // Maybe perform the transfer
        if (request.query.sure) {
            await db.runP(
                `INSERT OR IGNORE INTO credits
                    ( uid,  credits,  purchased,  subscription,
                      subscription_expiry,  subscription_id)
                    VALUES
                    (@UID, 0,        0,          0,
                     '',                   '');`, {
                "@UID": oid
            });

            await db.runP(
                `UPDATE credits SET
                    credits = credits + @CREDITS,
                    purchased = purchased + @PURCHASED,
                    subscription = @SUBSCRIPTION,
                    subscription_expiry = @EXPIRY,
                    subscription_id = @SID
                WHERE
                    uid=@UID;`, {
                "@CREDITS": fromCredits.credits,
                "@PURCHASED": fromCredits.purchased,
                "@SUBSCRIPTION": fromCredits.subscription,
                "@EXPIRY": fromCredits.subscription_expiry,
                "@SID": fromCredits.subscription_id,
                "@UID": oid
            });

            await db.runP(
                `UPDATE credits SET
                    credits = 0,
                    purchased = 0,
                    subscription = 0,
                    subscription_expiry = '',
                    subscription_id = ''
                WHERE
                    uid=@UID;`, {
                "@UID": uid
            });
        }

        await db.runP("COMMIT;");
        transferred = !!request.query.sure;
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");
    }
}

if (transferred) {
    // Log it
    log("credits-transferred", JSON.stringify({otherUid: oid}), {uid});
}

await include("../../head.jss", {title: "Transfer Ownership"});
?>

<section class="wrapper special">
    <h2>Transferring subscription to <?JS= await unM.getDisplay(oid) ?></h2>

<?JS
if (alreadySubscribed) {
    ?>
    <p>This organization already has a subscription, so you may not transfer yours.</p>
    <?JS

} else if (!transferred) {
    ?>
    <p>This will transfer your subscription and any credits from your user account to the organization account <?JS= await unM.getDisplay(oid) ?>. Your user account will no longer have a subscription. All members of the organization can use the subscription by using the organization account, and all admins in the organization can cancel the subscription. Are you sure?</p>

    <p>
    <a class="button" href="/panel/org/credits/?o=<?JS= oid ?>&amp;sure=yes">Yes, transfer it</a>
    <a class="button" href="/panel/org/">No, cancel</a>
    </p>
    <?JS

} else /* transferred */ {
    ?>
    <p>Done.</p>
    <?JS

}
?>

    <p><a href="/panel/org/">Return to organizations panel</a></p>
</section>

<?JS
await include("../../../tail.jss");
?>
