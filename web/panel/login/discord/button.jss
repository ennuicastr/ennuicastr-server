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

const config = require("../config.js");

function discordUrl() {
    return "https://discordapp.com/api/oauth2/authorize?" +
        "client_id=" + encodeURIComponent(config.discord.clientId) +
        "&redirect_uri=" + encodeURIComponent(config.panel + "login/discord/") +
        "&response_type=code&scope=identify%20email";
}
?>

<style type="text/css">
    .discordlogin {
        display: inline-block;
        background-color: #26262b;
        border-radius: 4px;
        color: white;
        min-width: 247px;
        min-height: 40px;
        padding: 0.5em 1em 0.5em 1em;
        text-decoration: none;
        text-align: center;
        vertical-align: middle;
    }
</style>

<p><a href="<?JS= discordUrl() ?>" class="discordlogin">
    <i class="fab fa-discord"></i> Log in with Discord
</a></p>
