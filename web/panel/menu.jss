<?JS!
/*
 * Copyright (c) 2020 Yahweasel
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

if (!config.nomain) {
?>
<div id="menuhide">
    <button onclick="toggleMenu();"><i class="fas fa-bars"></i></button>
</div>

<?JS
}

function b(target, icon, text, id) {
    var cl = "button";
    if (target === params.REQUEST_URI)
        cl += " recurrent";
    if (icon)
        text = '<i class="fas fa-' + icon + '"></i> ' + text;
    id = "ec-menu-" + id;
    if (config.nomain)
        id += "-mini";
    write('<a id="' + id + '" class="' + cl + '" href="' + target + '">' + text + '</a>\n');
}

if (!config.nomain)
    b("/panel/", "user", "Main panel", "main");
b("/panel/rec/", "microphone", "Recordings", "recordings");
b("/panel/subscription/", "calendar-alt", "Subscription", "subscription");
b("/panel/sounds/", "music", "Soundboard", "sounds");
//b("/panel/credits/", "dollar-sign", "Credit", "credit");
if (!config.nomain)
    b(econfig.site, "home", "Home page", "home");
b("/panel/logout/", "sign-out-alt", "Log out", "log-out");
?>
