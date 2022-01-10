<?JS
/*
 * Copyright (c) 2020-2022 Yahweasel
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

await include("../../head.jss", {menu: false, title: "Log in"});
?>

<section class="wrapper special">
    <!--<p>Please log in in your browser. Once you have, you will either be logged in through the client automatically, or given a one-time key. If you're given a one-time key, enter it here:</p>-->
    <p>Please log in in your browser. Once you have you will be given a one-time key. Enter it here:</p>

    <form method="POST" action="/panel/login/otk/">
        <div style="display: flex; align-items: center; max-width: 50em; margin: auto;">
            <label for="otk">One-time key:&nbsp;</label>
            <input type="text" name="otk" id="otk" style="flex: auto; min-width: 10em;" />
            <span>&nbsp;</span>
            <input type="submit" value="Log in" />
        </div>
    </form>

    <p><a href="/">Return to home page</a></p>
</section>

<?JS
await include("../../tail.jss");
?>
