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
?>
<script type="text/javascript"><!--
    function googleRenderButton() {
        gapi.signin2.render("google-signin2", {
            "scope": "openid profile email",
            "width": 240,
            "height": 50,
            "longtitle": true,
            "theme": "dark",
            "ux_mode": "redirect",
            "redirect_uri": "https://ennuicastr.com/panel/login/google/"
        });
    }
//--></script>
<meta name="google-signin-client_id" content="<?JS= config.google.clientId ?>">
<p class="align-center"><div id="google-signin2" style="display: inline-block"></div></p>
<script src="https://apis.google.com/js/platform.js?onload=googleRenderButton" async defer></script>
