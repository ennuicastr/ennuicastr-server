<?JS
/*
 * Copyright (c) 2021 Yahweasel
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

const creditsj = await include("../credits.jss");
const edb = require("../db.js");
const db = edb.db;
const logout = await include("../logout/logout.jss");

let canDelete = true,
    deleted = false,
    haveRecordings = false,
    haveSounds = false,
    haveSubscription = false;

while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        canDelete = true;

        // Check if there are any recordings
        haveRecordings = false;
        const recordings = await db.allP("SELECT rid FROM recordings WHERE uid=@UID;", {"@UID": uid});
        if (recordings.length) {
            canDelete = false;
            haveRecordings = true;
        }

        // Check if they have any sounds
        haveSounds = false;
        const sounds = await db.allP("SELECT sid FROM sounds WHERE uid=@UID;", {"@UID": uid});
        if (sounds.length) {
            canDelete = false;
            haveSounds = true;
        }

        // Check if they have a subscription
        const accountCredits = await creditsj.accountCredits(uid);
        haveSubscription = false;
        if (accountCredits.subscription) {
            // Check if it's canceled
            if (!/^canceled:/.test(accountCredits.subscription_id) &&
                // BETA
                !/^beta:/.test(accountCredits.subscription_id)) {
                canDelete = false;
                haveSubscription = true;
            }
        }

        if (canDelete && request.body && request.body.sure === "Yes") {
            // First log out everywhere
            logout.logOutAll(uid);

            // Perform the actual deletion

            /* First, get the user information so we know what to put in the
             * DB. We need to keep the UID in the DB so that it can't be
             * reused. */
            const user = await db.getP("SELECT * FROM users WHERE uid=@UID;", {"@UID": uid});

            // Replace the login info
            await db.runP("UPDATE users SET login=@LOGIN WHERE uid=@UID;", {
                "@LOGIN": "deleted:" + uid + ":" + user.login,
                "@UID": uid
            });

            // Delete in all the other tables
            for (const t of [
                "emails", "names", "otk", "credits", "defaults", "lobbies"
            ]) {
                await db.runP("DELETE FROM " + t + " WHERE uid=@UID;", {
                    "@UID": uid
                });
            }

            await db.runP("COMMIT;");
            deleted = true;
            break;
        }

        await db.runP("COMMIT;");
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");

    }
}

if (deleted) {
    // OK, the account was deleted
    await include("../head.jss", {menu: false, title: "Delete"});
    ?>

    <section class="wrapper special">
        <p>Your account has been deleted.</p>

        <p><a href="/">Return to home page</a></p>
    </section>

    <?JS
    await include("../../tail.jss");
    return;
}

await include("../head.jss", {title: "Delete"});
?>

<section class="wrapper special">
    <p>You may delete your account here if you wish. Note that deleting your account does <em>not</em> delete all personal information, but it does delete account information including your email address, so you will not be contacted. If you wish for us to expunge all personal information, consult the <a href="/privacy/">privacy policy</a>.</p>

    <p>Because accounts are created on demand whenever you newly log in with a login service, if you delete your account, you'll still be able to log in; a new account will be created if you do.</p>
</section>

<?JS
if (haveRecordings) { ?>
<section class="wrapper special style1">
    <p>Please delete all of your recordings <em>before</em> deleting your account.</p>
</section>
<?JS }

if (haveSounds) { ?>
<section class="wrapper special style1">
    <p>Please delete all soundboard sounds <em>before</em> deleting your account.</p>
</section>
<?JS }

if (haveSubscription) { ?>
<section class="wrapper special style1">
    <p>Please cancel your subscription <em>before</em> deleting your account.</p>
</section>
<?JS }

if (canDelete) { ?>
<section class="wrapper special style1">
    <p>Deleting your account is <em>permanent and irreversible</em>. If you have remaining credits or subscription time, <em>they will be lost</em>. Are you sure?</p>

    <form action="?" method="POST">
        <input type="submit" name="sure" value="Yes" />
        <a class="button" href="/panel/">No</a>
    </form>
</section>
<?JS }

await include("../../tail.jss");
?>
