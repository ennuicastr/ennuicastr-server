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
if (request.query.o !== uidX.euid || uidX.level !== 3 /* owner */)
    return writeHead(302, {"location": "/panel/org/"});
const oid = uidX.euid;

// Need someone to transfer to
if (!request.query.u)
    return writeHead(302, {"location": "/panel/org/"});
const target = request.query.u;

const db = require("../db.js").db;
const unM = require("../username.js");

// Perform the database tomfoolery
let transferred = false;
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        // Make sure they're in
        const shareTarget = await db.getP("SELECT * FROM user_share WHERE uid_shared=@OID AND uid_target=@UID;", {
            "@OID": oid,
            "@UID": target
        });
        if (!shareTarget) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Make sure they're not already the owner
        if (shareTarget.level >= 3) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Get the source too
        const shareSource = await db.getP("SELECT * FROM user_share WHERE uid_shared=@OID AND uid_target=@UID;", {
            "@OID": oid,
            "@UID": uidX.ruid
        });
        if (!shareSource || shareSource.level < 3) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Maybe perform the transfer
        if (request.query.sure) {
            await db.runP(
                `UPDATE user_share
                    SET level=3
                    WHERE uid_shared=@OID AND uid_target=@UID;`, {
                "@OID": oid,
                "@UID": target
            });

            await db.runP(
                `UPDATE user_share
                    SET level=2
                    WHERE uid_shared=@OID AND uid_target=@UID;`, {
                "@OID": oid,
                "@UID": uidX.ruid
            });
        }

        await db.runP("COMMIT;");
        transferred = !!request.query.sure;
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");
    }
}

await include("../../head.jss", {title: "Transfer Ownership"});
?>

<section class="wrapper special">
    <h2>Transferring ownership of <?JS= await unM.getDisplay(oid) ?></h2>
<?JS
if (!transferred) {
    ?>
    <p>This will make <?JS= await unM.getDisplay(target) ?> the new owner of <?JS= await unM.getDisplay(oid) ?>, and demote you to an administrator. Are you sure?</p>

    <p>
    <a class="button" href="/panel/org/transfer/?o=<?JS= oid ?>&amp;u=<?JS= target ?>&amp;sure=yes">Yes, transfer it</a>
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
