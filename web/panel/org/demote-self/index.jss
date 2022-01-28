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

const db = require("../db.js").db;
const unM = require("../username.js");

// Perform the database tomfoolery
let demoted = false;
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        // Make sure they're in
        const shareTarget = await db.getP("SELECT * FROM user_share WHERE uid_shared=@OID AND uid_target=@UID;", {
            "@OID": oid,
            "@UID": uid
        });
        if (!shareTarget) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Make sure they're an admin
        if (shareTarget.level !== 2) {
            await db.runP("ROLLBACK;");
            return writeHead(302, {"location": "/panel/org/"});
        }

        // Maybe perform the demotion
        if (request.query.sure) {
            await db.runP(
                "UPDATE user_share SET level=1 WHERE uid_shared=@OID AND uid_target=@UID;", {
                "@OID": oid,
                "@UID": uid
            });
        }

        await db.runP("COMMIT;");
        demoted = !!request.query.sure;
        break;

    } catch (ex) {
        await db.runP("ROLLBACK;");
    }
}

await include("../../head.jss", {title: "Demote"});
?>

<section class="wrapper special">
    <h2>Revoking administration of <?JS= await unM.getDisplay(oid) ?></h2>
<?JS
if (!demoted) {
    ?>
    <p>This will <em>remove</em> your right to administrate <?JS= await unM.getDisplay(oid) ?>. You will be unable to reverse this action! Are you sure?</p>

    <p>
    <a class="button" href="/panel/org/demote-self/?o=<?JS= oid ?>&amp;sure=yes">Yes, revoke rights</a>
    <a class="button" href="/panel/org/">No, cancel</a>
    </p>
    <?JS

} else /* demoted */ {
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
