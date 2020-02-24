<?JS
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

await session.init();

if (request.query.secret) {
    // Beta account. Maybe give them access
    await include("beta.jss");
    return;
}

const util = require("util");
const db = require("../db.js");

function up(obj, meth) {
    return util.promisify(obj[meth].bind(obj));
}

await include("../../head.jss", {menu: false, title: "Log in"});
/*
?>

<section class="wrapper special">
    <p>To use Ennuicastr, you must have a PayPal account. Please log in with PayPal:</p>
    <?JS await include("paypal/button.jss"); ?>

    <p><a href="/">Return to home page</a></p>
</section>

<?JS */ ?>

<section class="wrapper special">
    <p>Sorry, but Ennuicastr is currently in early beta. If you've been invited to participate, you should have received a specialized login link.</p>

    <p><a href="/">Return to home page</a></p>
</section>

<?JS
await include("../../tail.jss");
?>
