<?JS!
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

const config = arguments[1];
const uid = config.uid;
if (!uid) return;

const db = require("../db.js").db;
const id36 = require("../id36.js");
const unM = require("../username.js");

// Consider the various actions we could be performing
let mode = "show";
if (request.query.t) {
    mode = "invite";

} else if (request.query.act) {
    switch (request.query.act) {
        case "create":
        case "leave":
        case "login":
            mode = request.query.act;
            break;

        default:
            return writeHead(302, {"location": "/panel/org/"});
    }
}

// Possibly do the login
if (mode === "login") {
    const oid = request.query.i;

    // Make sure they're actually *in* this organization
    const org = await db.getP(
        `SELECT * FROM
            users INNER JOIN user_share
            ON users.uid = user_share.uid_shared
        WHERE
            users.uid=@OID AND
            user_share.uid_target=@UID;`, {
        "@OID": oid,
        "@UID": uid
    });
    if (!org)
        return writeHead(302, {"location": "/panel/org/"});

    // OK, log them in
    await session.set("euid", oid);
    return writeHead(302, {"location": "/panel/org/"});
}

// Get the list of all organizations to which this user belongs
const orgs = await db.allP(
    "SELECT * FROM user_share WHERE uid_target=@UID;", {"@UID": uid});

// Possibly do the creation
if (mode === "create" && request.query.n && orgs.length < 8) {
    let oid = null;

    // FIXME: Duplication
    const oname = request.query.n
        .replace(/[^\p{Letter}\p{Number}\p{Punctuation} _-]/gu, "_")
        .trim() || "_";

    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            // 1: Create the organization
            oid = id36.genID(32);
            await db.runP(
                `INSERT INTO users
                    ( uid,  login)
                VALUES
                    (@UID, @LOGIN);`, {
                "@UID": oid,
                "@LOGIN": "organization:" + oid
            });

            // 2: Put the user in the organization
            await db.runP(
                `INSERT INTO user_share
                    ( uid_shared,  uid_target, level)
                VALUES
                    (@UIDS,       @UIDT,       3);`, {
                "@UIDS": oid,
                "@UIDT": uid
            });

            // 3: Give the organization a name
            await db.runP(
                `INSERT INTO usernames
                    ( uid,  username)
                VALUES
                    (@UID, @USERNAME);`, {
                "@UID": oid,
                "@USERNAME": oname
            });

            await db.runP("COMMIT;");
            break;

        } catch (ex) {
            await db.runP("ROLLBACK;");
            write(ex.toString());
            throw ex;
        }
    }

    // 4: Log them in
    return writeHead(302, {
        "location": "/panel/org/?act=login&i=" + oid
    });
    return;
}

await include("../head.jss", {title: "Organizations"});
?>

<section class="wrapper special">
<?JS
if (mode === "invite") {
    // Join the organization
    let success = false;
    let oid, msg;
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            await db.runP(
                "DELETE FROM user_share_key WHERE expiry < datetime('now');");

            const invite = await db.getP(
                "SELECT * FROM user_share_key WHERE key=@KEY;", {
                "@KEY": request.query.t
            });

            if (!invite) {
                // Invalid!
                await db.runP("ROLLBACK;");
                msg = "Invalid or expired invite.";
                break;
            }
            oid = invite.uid_shared;

            // Make sure they're not already in
            const share = await db.getP(
                `SELECT * FROM user_share WHERE
                    uid_shared=@OID AND
                    uid_target=@UID;`, {
                "@OID": oid,
                "@UID": uid
            });
            if (share) {
                await db.runP("ROLLBACK;");
                msg = "You are already a member of that organization!";
                break;
            }

            // Delete the invite token
            await db.runP(
                "DELETE FROM user_share_key WHERE key=@KEY;", {
                "@KEY": request.query.t
            });

            // OK, join the organization
            await db.runP(
                `INSERT INTO user_share
                    ( uid_shared,  uid_target,  level)
                VALUES
                    (@UIDS,       @UIDT,       1);`, {
                "@UIDS": oid,
                "@UIDT": uid
            });

            await db.runP("COMMIT;");
            success = true;
            break;

        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    if (success) {
        // Log into it
        await session.set("euid", oid);
        msg = "You have joined the organization " + await unM.getDisplay(oid);
    }

    ?>
    <p><?JS= msg ?></p>
    <p><a href="/panel/org/">Return to organizations panel</p>
    <?JS

} else if (mode === "create" && orgs.length >= 8) {
    // Creating an organization, but too many
    ?>
    <p>You may not be in more than eight organizations at a time.</p>
    <p><a href="?">Return to organizations panel</a></p>
    <?JS

} else if (mode === "create") {
    ?>
    <header class="align-center"><h2>Creating organization</h2></header>

    <form method="GET" action="?">
        <input type="hidden" name="act" value="create" />
        <label for="org-name">Organization name:&nbsp;</label>
        <input type="text" name="n" id="org-name" />
        <input type="submit" value="Create" />
    </form>

    <script type="text/javascript">
        $("#org-name")[0].select();
    </script>
    <?JS

} else if (mode === "leave") {
    // Make sure they're actually *in* the organization
    const oid = request.query.i;
    const org = await db.getP(
        `SELECT * FROM 
            users INNER JOIN user_share ON users.uid=user_share.uid_shared
        WHERE
            users.uid=@OID AND
            user_share.uid_target=@UID;`, {
        "@OID": oid,
        "@UID": uid
    });
    if (!org)
        return writeHead(302, {"location": "/panel/org/"});

    ?><header class="align-center"><h2>Leaving organization <?JS= await unM.getDisplay(oid) ?></h2></header><?JS

    if (org.level >= 3 /* owner */) {
        ?><p>An organization's owner cannot leave it. You can delete the organization after logging into it.</p><?JS

    } else if (request.query.sure) {
        while (true) {
            try {
                await db.runP(
                    `DELETE FROM user_share WHERE
                        uid_shared=@OID AND
                        uid_target=@UID;`, {
                    "@OID": oid,
                    "@UID": uid
                });
                break;
            } catch (ex) {}
        }

        ?><p>You have been removed from the organization.</p><?JS

    } else {
        ?>
        <p>This will remove you from the organization <?JS= await unM.getDisplay(oid) ?>. You will no longer have access to recordings or rooms in the organization. To rejoin, you will need a new invite link.</p>

        <p>Are you sure?</p>

        <p>
        <a class="button" href="/panel/org/?act=leave&amp;i=<?JS= oid.toString(36) ?>&amp;sure=yes">Yes, leave the organization</a>
        <a class="button" href="/panel/org/">No, cancel</a>
        </p>
        <?JS

    }

    ?><p><a href="/panel/org/">Return to organizations panel</a></p><?JS

} else if (mode === "show") {
    ?>
    <p>Organizations are accounts shared by a number of users. Organizations have their own subscription and/or credit, and all members of the organization share equal access to recordings and rooms within the organization. Note that this means that organization members may <em>delete</em> recordings and rooms within the organization, as well as create and access them.</p>

    <p>It is not necessary for guests or regular hosts in recordings to be members of a shared organization. The purpose of an organization is to give multiple parties access to create and download recordings, not to simply participate in them.</p>

    <p>You are a member of the following organizations:</p>

    <div style="overflow: auto">
    <table id="organizations">
        <thead>
        <tr><th>Name</th><th>Log in</th><th>Leave</th></tr>
        </thead><tbody>
    <?JS

    for (const org of orgs) {
        ?>
        <tr>
            <td><?JS= await unM.getDisplay(org.uid_shared) ?></td>
            <td><a href="?act=login&amp;i=<?JS= org.uid_shared ?>" class="button"><i class="fas fa-sign-in-alt"></i> Log in</a></td>
            <td><a href="?act=leave&amp;i=<?JS= org.uid_shared ?>" class="button"><i class="fas fa-trash-alt"></i> Leave</td>
        </tr>
        <?JS
    }

    if (!orgs.length) {
        ?><tr><td class="align-center" colspan=3>(none)</td></tr><?JS
    }
    ?>
    </tbody></table>
    </div>

    <p><a href="?act=create" class="button"><i class="fas fa-building"></i> Create a new organization</a></p>
<?JS

} else throw new Error();
?>
</section>

<script type="text/javascript" src="/assets/js/tablesort.min.js"></script>
<script type="text/javascript"><!--
new Tablesort(document.getElementById("organizations"));
//--></script>

<?JS
await include("../../tail.jss");
?>
