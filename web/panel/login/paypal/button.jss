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
<span id='cwppButton'></span>
<script src='https://www.paypalobjects.com/js/external/connect/api.js'></script>
<script>
paypal.use( ['login'], function (login) {
  login.render ({
    "appid":"<?JS= config.paypal.clientId ?>",
    "authend":"sandbox",
    "scopes":"openid profile",
    "containerid":"cwppButton",
    "responseType":"code",
    "locale":"en-us",
    "buttonType":"CWP",
    "buttonShape":"pill",
    "buttonSize":"lg",
    "fullPage":"true",
    "returnurl":"https://ennuicastr.com/panel/login/paypal/"
  });
});
</script>
