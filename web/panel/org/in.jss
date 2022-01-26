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
const uid = config.ruid;
const euid = config.euid;
const level = config.level;
if (!uid || !euid) return;

const levels = {
    member: 1,
    admin: 2,
    owner: 3
};

// Figure out the mode
let mode = "info";
if (request.query.act) {
    switch (request.query.act) {
        case "logout":
            mode = request.query.act;
            break;

        default:
            return writeHead(302, {"location": "/panel/org/"});
    }
}

// If we're logging out, just do so
if (mode === "logout") {
    await session.delete("euid");
    return writeHead(302, {"location": "/panel/org/"});
}

const credits = require("../credits.js");
const db = require("../db.js").db;
const unM = require("../username.js");

// Perhaps get the userlist
let users = null;
if (mode === "info" && level >= levels.admin) {
    users = await db.allP("SELECT * FROM user_share WHERE uid_shared=@UID;", {"@UID": euid});
    users = await Promise.all(users.map(async (u) => {
        u.display = await unM.getDisplay(u.uid_target);
        return u;
    }));
    users = users.sort((a, b) => {
        return (a.display > b.display) ? 1 : -1;
    });
}

// Function for making the user's level as a menu
function memberLevel(share) {
    const uid = share.uid_target;
    const level = share.level;

    function sel(lvl) {
        if (lvl === level)
            return " selected";
        else
            return "";
    }

    ?>
    <select id="level-<?JS= uid ?>" onchange='changeLevel("<?JS= uid ?>");' data-level="<?JS= level ?>" autocomplete="off">
        <option value=0>Remove</option>
        <option value=1<?JS= sel(1) ?>>Member</option>
        <option value=2<?JS= sel(2) ?>>Admin</option>
        <option value=3<?JS= sel(3) ?>>Owner</option>
    </select>
    <?JS
}

await include("../head.jss", {title: "Organizations"});
?>

<section class="wrapper special">
<?JS
if (mode === "info") {
    ?>
    <p>You are logged into the organization account for <?JS= await unM.getDisplay(euid) ?>.</p>

    <p><a href="?act=logout" class="button"><i class="fas fa-sign-out-alt"></i> Return to user account</a></p>

    <?JS
    if (users) {
        ?>
        <script type="text/javascript">
        function changeLevel(uid) {
            var box = $("#level-" + uid)[0];
            var oldLvl = +box.getAttribute("data-level");
            var newLvl = +box.value;
            var isOwner = <?JS= level === levels.owner ?>;

            if (oldLvl === newLvl)
                return;

            if (oldLvl === <?JS= levels.owner ?>) {
                box.value = oldLvl;
                if (isOwner) {
                    alert("To transfer ownership of this organization, please set a new owner.");
                } else {
                    alert("Only the owner may transfer ownership.");
                }
                return;
            }

            if (newLvl === <?JS= levels.owner ?> && !isOwner) {
                box.value = oldLvl;
                alert("Only the owner may transfer ownership.");
                return;
            }

            // All other changes are valid
            box.disabled = true;

            if (newLvl === <?JS= levels.owner ?>) {
                document.location.href = "/panel/org/transfer/?o=<?JS= euid ?>&u=" + uid;
                return;

            } else if (newLvl === 0) {
                document.location.href = "/panel/org/remove/?o=<?JS= euid ?>&u=" + uid;
                return;

            } else if (uid === <?JS= JSON.stringify(uid) ?>) {
                if (newLvl !== 1) {
                    console.assert(false, "Invalid level change!");
                    return;
                }

                document.location.href = "/panel/org/demote-self/?o=<?JS= euid ?>";
                return;

            }

            var done;

            fetch("/panel/org/level.jss", {
                method: "POST",
                headers: {"content-type": "application/json"},
                body: JSON.stringify({
                    oid: <?JS= JSON.stringify(euid) ?>,
                    uid: uid,
                    level: newLvl
                })

            }).then(function(res) {
                return res.text();

            }).then(function(res) {
                res = JSON.parse(res);

                if (res.error) {
                    box.value = oldLvl;
                    box.disabled = false;
                    throw new Error(res.error);
                }

                // Show them that it's done in the box
                done = document.createElement("option");
                done.innerHTML = "Done!";
                done.value = "done";
                box.appendChild(done);
                box.value = "done";

                return new Promise(function(res) {
                    setTimeout(res, 3000);
                });

            }).then(function() {
                box.value = newLvl;
                box.removeChild(done);
                box.setAttribute("data-level", newLvl);
                box.disabled = false;

            }).catch(function(ex) {
                alert(ex);

            });
        }

        function orgInvite() {
            var btn = $("#invite-button")[0];
            btn.classList.add("disabled");
            btn.disabled = true;

            fetch("/panel/org/invite.jss?" + Math.random())
            .then(function(res) {
                return res.text();

            }).then(function(res) {
                res = JSON.parse(res);

                if (res.fail) {
                    alert(res.fail);
                    return;
                }

                $("#invite-hider")[0].style.display = "";

                var box = $("#invite-box")[0];
                box.value = res.url;
                box.select();
                document.execCommand("copy");

                btn.classList.remove("disabled");
                btn.disabled = false;
            });
        }
        </script>

        <p>Users in this organization:</p>

        <table id="users">
            <thead>
            <tr><th>Name</th><th>Level</th></tr>
            </thead><tbody>
            <?JS
            for (const user of users) {
                ?>
                <tr>
                <td><?JS= user.display ?></td>
                <td><?JS memberLevel(user); ?></td>
                </tr>
                <?JS
            }
            ?>
            </tbody>
        </table>

        <p><button id="invite-button" onclick="orgInvite();"><i class="fas fa-share-square"></i> Invite a user to this organization</button></p>

        <p id="invite-hider" style="display: none">
            One-time use URL, expires in 24 hours:<br/>
            <input type="text" id="invite-box" readonly style="width: 100%" />
        </p>

        <?JS
        const uCredits = await credits.accountCredits(uid);
        const oCredits = await credits.accountCredits(euid);
        if (uCredits.subscription && !oCredits.subscription) {
            ?>
            <p><a class="button" href="/panel/org/credits/?o=<?JS= euid ?>"><i class="fas fa-exchange-alt"></i> Transfer subscription to organization</a></p>
            <?JS
        }
    }

    if (level >= levels.owner) {
        ?>
        <p><a href="/panel/delete/" class="button"><i class="fas fa-trash-alt"></i> Delete this organization</a></p>
        <?JS
    }

} else throw new Error();
?>
</section>

<?JS if (mode === "info" && level >= levels.admin) { ?>
<script type="text/javascript" src="/assets/js/tablesort.min.js"></script>
<script type="text/javascript"><!--
new Tablesort(document.getElementById("users"));
//--></script>
<?JS } ?>

<?JS
await include("../../tail.jss");
?>
