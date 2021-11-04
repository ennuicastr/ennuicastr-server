<?JS
/*
 * Copyright (c) 2020, 2021 Yahweasel
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

const uid = await include("uid.jss");
if (!uid) return;

const providerNames = {
    beta: "a beta account",
    google: "Google",
    paypal: "PayPal",
    facebook: "Facebook",
    discord: "Discord",
    firebase: "password authentication"
};

const edb = require("../db.js");
const db = edb.db;
const credits = require("../credits.js");
const creditsj = await include("./credits.jss");

const ua = params.HTTP_USER_AGENT || "";
const isChrome = ua.indexOf("Chrome") >= 0;
const isSafari = ua.indexOf("Safari") >= 0 && !isChrome;
let warning = "";
if (isSafari) {
    const isIOS = ua.indexOf("iPhone") >= 0 || ua.indexOf("iPad") >= 0 || ua.indexOf("iOS") >= 0;

    // Please only use Safari on iOS
    if (isIOS) {
        const isFake = ua.indexOf("CriOS") >= 0 || ua.indexOf("FxiOS") >= 0;
        if (isFake)
            warning = "Non-Safari browsers on iOS do not support microphone capture. Please switch to Safari.";

    } else {
        warning = "Chrome and Firefox are more well supported on Mac than Safari. Consider switching to one of them.";

    }
}

// Get other info associated with this account
const login = await session.get("login");
const loginProvider = (function() {
    if (login) {
        var provider = login.split(":")[0];
        return providerNames[provider] || provider;
    }
    return null;
})();
const loginName = await (async function() {
    var row = await db.getP("SELECT name FROM names WHERE uid=@UID;", {"@UID": uid});
    if (row)
        return row.name;
    return null;
})();
const email = await (async function() {
    var row = await db.getP("SELECT email FROM emails WHERE uid=@UID;", {"@UID": uid});
    if (row)
        return row.email;
    return null;
})();

const accountCredits = await creditsj.accountCredits(uid);

// Make an "as" line based on what they're logged in as
var asLine = "";
if (email) {
    asLine = " as " + email;
} else if (loginName) {
    asLine = " as " + loginName;
}

await include("head.jss");
?>

<?JS
if (uid === "8r0yhzg2bawwig7id2h6u0ip6wm2535us") {
?>
<script type="text/javascript">
(function() {
    // Check for client login
    if (!window.parent) return;
    const wUrl = new URL(document.location.href);
    const pUrl = new URL(window.parent.document.location.href);
    if (window.parent.ennuicastrClientLogin &&
        wUrl.origin === pUrl.origin) {
        window.parent.document.location.href = "/panel/login-client/otk/";
    }
})();
</script>
<?JS
}
?>

<section class="wrapper special">
    <p onclick="showUID();">You are logged into Ennuicastr using <?JS= loginProvider + asLine ?>.</p>

    <p style="display: none" id="uidbox">Your UID is <?JS= uid ?></p>

    <script type="text/javascript"><!--
    function showUID() { $("#uidbox")[0].style.display = ""; }
    //--></script>

    <?JS
    if (accountCredits.credits) { ?><p><?JS= credits.creditsMessage(accountCredits) ?></p><?JS }

    if (warning) {
        ?><div style="background-color: #933; color: #fff; text-align: center; border: 2px solid #fff; border-radius: 0.5em; padding: 0.5em; margin: 1em;"><?JS= warning ?></div><?JS
    }

    await include("rec/interface.jss");
    ?>

    <p>
    <?JS await include("menu.jss", {nomain: true}); ?>
    </p>

    <p><a class="button" href="/panel/logout/?all"><i class="fas fa-sign-out-alt"></i> Log out on <em>all</em> devices</a></p>

    <p><a class="button" href="/panel/delete/" style="font-size: 0.75em"><i class="fas fa-trash-alt"></i> Delete account</a></p>
</section>

<?JS await include("../tail.jss"); ?>
