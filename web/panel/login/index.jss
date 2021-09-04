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

await include("../../head.jss", {menu: false, title: "Log in"});
?>

<style type="text/css">
    .loginblock {
        display: inline-block;
        vertical-align: middle;
        margin: 0.5em;
    }

    .loginb {
        display: inline-block;
        border-radius: 4px;
        min-width: 247px;
        min-height: 40px;
        padding: 0.5em 1em 0.5em 1em;
        text-decoration: none;
        text-align: center;
        vertical-align: middle;
    }
</style>

<section class="wrapper special">
    <!-- BETA -->
    <p>NOTE: During the beta, if you have <a href="https://discordapp.com/">Discord</a>, <em>please</em> <a href="https://discord.gg/ZKgWgyq">join the Discord server</a>.</p>

    <p>You may log in to Ennuicastr using an account on any of these online services:</p>
    <p>
    <?JS
    await include("paypal/button.jss");
    await include("google2/button.jss");
    ?><br/><?JS
    await include("facebook/button.jss");
    await include("discord/button.jss");
    ?><br/><?JS
    await include("firebase/button.jss");
    ?>
    </p>

    <p><a href="/">Return to home page</a></p>
</section>

<?JS
await include("../../tail.jss");
?>
