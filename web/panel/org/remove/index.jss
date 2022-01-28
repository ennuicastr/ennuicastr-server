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

// Need someone to remove
if (!request.query.u)
    return writeHead(302, {"location": "/panel/org/"});
const target = request.query.u;

const db = require("../db.js").db;
const unM = require("../username.js");

// Perform the database tomfoolery
let removed = false;
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

        // Make sure they're not the owner
        if (shareTarget.level >= 3) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Get the source too
        const shareSource = await db.getP("SELECT * FROM user_share WHERE uid_shared=@OID AND uid_target=@UID;", {
            "@OID": oid,
            "@UID": uidX.ruid
        });
        if (!shareSource || shareSource.level < 2) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Maybe perform the removal
        if (request.query.sure) {
            await db.runP(
                "DELETE FROM user_share WHERE uid_shared=@OID AND uid_target=@UID;", {
                "@OID": oid,
                "@UID": target
            });
        }

        await db.runP("COMMIT;");
        removed = !!request.query.sure;
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");
    }
}

await include("../../head.jss", {title: "Remove User"});
?>

<section class="wrapper special">
    <h2>Removing user <?JS= await unM.getDisplay(target) ?> from <?JS= await unM.getDisplay(oid) ?></h2>
<?JS
if (!removed) {
    ?>
    <p>This will remove <?JS= await unM.getDisplay(target) ?> from the organization <?JS= await unM.getDisplay(oid) ?>. Are you sure?</p>

    <p>
    <a class="button" href="/panel/org/remove/?o=<?JS= oid ?>&amp;u=<?JS= target ?>&amp;sure=yes">Yes, remove them</a>
    <a class="button" href="/panel/org/">No, cancel</a>
    </p>
    <?JS

} else /* removed */ {
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
