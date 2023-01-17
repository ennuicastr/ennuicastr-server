<?JS!
/*
 * Copyright (c) 2020-2023 Yahweasel
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

const config = (arguments[1] || {});
const econfig = require("../config.js");

const uidX = await include("uid.jss", {noRedirect: true, verbose: true});
const {ruid, euid, uid} = uidX;
const db = require("../db.js").db;

// The sharing panel is only shown if anything is shared
const showSharing = await (async function() {
    if (!uid || uidX.level < 2 /* admin */)
        return false;

    const shareR = await db.getP(
        "SELECT * FROM recording_share WHERE uid_from=@UID;",
        {"@UID": uid});
    if (shareR)
        return true;

    const shareL = await db.getP(
        "SELECT * FROM lobby_share WHERE uid_from=@UID;",
        {"@UID": uid});
    return !!shareL;
})();

/* The organization panel is always shown if the user is involved in
 * organizations */
const showOrg = await (async function() {
    if (!ruid)
        return false;

    const share = await db.getP(
        "SELECT * FROM user_share WHERE uid_target=@UID;",
        {"@UID": ruid});
    return !!share;
})();

if (!config.nomain) {
?>
<div id="menuhide">
    <button onclick="toggleMenu();"><i class="bx bx-menu"></i></button>
</div>

<?JS
}

function b(target, icon, text, id) {
    var cl = "button";
    if (target === params.REQUEST_URI)
        cl += " recurrent";
    if (icon)
        text = '<i class="bx bx' + icon + '"></i> ' + text;
    id = "ec-menu-" + id;
    if (config.nomain)
        id += "-mini";
    write('<a id="' + id + '" class="' + cl + '" href="' + target + '">' + text + '</a>\n');
}

if (!config.nomain)
    b("/panel/", "s-user", "Main panel", "main");
if (config.all && config.username)
    b("/panel/username/", "s-rename", "Username", "username");
b("/panel/rec/", "s-microphone", "Recordings", "recordings");
if (showSharing)
    b("/panel/share/", "s-share", "Sharing", "sharing");
b("/panel/subscription/", "s-calendar", "Subscription", "subscription");
if (config.all || showOrg)
    b("/panel/org/", "s-buildings", "Organizations", "organizations");
b("/panel/sounds/", "s-music", "Soundboard", "sounds");
if (!config.nomain)
    b(econfig.site, "s-home", "Home page", "home");
b("/panel/logout/", "-log-out", "Log out", "log-out");
?>
