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

function facebookUrl() {
    return "https://www.facebook.com/v6.0/dialog/oauth?" +
        "client_id=" + encodeURIComponent(config.facebook.appId) +
        "&redirect_uri=" + encodeURIComponent(config.panel + "login/facebook/");
}
?>

<style type="text/css">
    .fblogin {
        display: inline-block;
        background-color: #1877f2;
        border-radius: 4px;
        font-family: Helvetica, Arial, sans-serif;
        color: white;
        min-width: 247px;
        min-height: 40px;
        padding: 0.5em 1em 0.5em 1em;
        text-decoration: none;
        text-align: center;
        vertical-align: middle;
    }
</style>

<p><a href="<?JS= facebookUrl() ?>" class="fblogin">
    <i class="fab fa-facebook"></i> Log in with Facebook
</a></p>
