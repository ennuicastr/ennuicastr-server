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

const uid = await include("../../uid.jss");
if (!uid) return;

if ((!request.query.r && !request.query.l) || !request.query.u)
    return writeHead(302, {"location": "/panel/share/"});

const isLobby = !!request.query.l;

const id = isLobby ?
    Number.parseInt(request.query.l, 36) :
    Number.parseInt(request.query.r, 36);
const typeNm = isLobby ? "lobby" : "recording";
const typeNmPub = isLobby ? "room" : "recording";
const typeId = isLobby ? "lid" : "rid";

const otherUid = request.query.u;
const sure = !!request.query.sure;

const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const id36 = require("../id36.js");
const recM = require("../rec.js");
const unM = require("../username.js");

const rec = isLobby ?
    await db.getP("SELECT * FROM lobbies2 WHERE lid=@LID AND uid=@UID;", {
        "@LID": id,
        "@UID": uid
    }) :
    await recM.get(id, uid);
if (!rec || rec.uid !== uid)
    return writeHead(302, {"location": "/panel/share/"});

// Make sure it's currently shared with them
const share = await db.getP(
    `SELECT * FROM ${typeNm}_share WHERE
        ${typeId}=@ID AND
        uid_from=@UIDF AND
        uid_to=@UIDT;`, {
    "@ID": id,
    "@UIDF": uid,
    "@UIDT": otherUid
});
if (!share)
    return writeHead(302, {"location": "/panel/share/"});

await include("../../head.jss", {title: "Share"});
?>

<section class="wrapper special">
<?JS
if (!sure) {
    ?>
    <header><h2>Unsharing <?JS= rec.name || "(Anonymous)" ?></h2></header>

    <p>This will <em>remove</em> <?JS= await unM.getDisplay(otherUid) ?>'s access to the <?JS= typeNmPub ?> <?JS= rec.name || "(Anonymous)" ?>. Are you sure?</p>

    <p>
    <a class="button" href="/panel/share/unshare/?<?JS= typeId[0] ?>=<?JS= id.toString(36) ?>&amp;u=<?JS= otherUid ?>&amp;sure=yes">Yes, unshare it</a>
    <a class="button" href="/panel/share/">No, cancel</a>
    </p>

    <p>Note that because sharing a <?JS= typeNmPub ?> involves sharing keys, a technically savvy user can still access its data even after unsharing; it must be deleted to prevent all future access.</p>
    <?JS

} else /* sure */ {
    // Remove it
    while (true) {
        try {
            await db.runP(
                `DELETE FROM ${typeNm}_share WHERE
                    ${typeId}=@ID AND
                    uid_from=@UIDF AND
                    uid_to=@UIDT;`, {
                "@ID": id,
                "@UIDF": uid,
                "@UIDT": otherUid
            });
            break;
        } catch (ex) {}
    }

    log(`${typeNm}-unshared`, JSON.stringify({otherUid}), {uid, rid: id});

    ?>
    <header><h2>Unsharing <?JS= rec.name || "(Anonymous)" ?></h2></header>

    <p>Unshared!</p>
    <?JS

}
?>

    <p><a href="/panel/share/">Return to sharing panel</a></p>
</section>

<?JS
await include("../../../tail.jss");
?>
