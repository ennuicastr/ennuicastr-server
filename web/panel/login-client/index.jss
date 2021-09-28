<?JS
/*
 * Copyright (c) 2021 Yahweasel
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

/* Here's how client login works: The client opens this page, and it then opens
 * the browser, and is redirected to login-client.jss . The browser opens this
 * page, which opens the standard login page (if applicable) in an iframe.
 * /panel/ checks if it's part of the client login, and if it is, forwards to
 * otk/ . otk/ generates a one-time key, which the user then pastes into
 * login-client.jss in the client. The one-time key login is through
 * /panel/login/otk/ */

const uid = await include("../uid.jss", {noRedirect: true});
const frame = uid ? "/panel/" : "/panel/login/";

?><!DOCTYPE HTML>
<html>
    <head>
        <title>Log in — Ennuicastr</title>
        <meta charset="utf-8" />

        <link rel="apple-touch-icon" sizes="180x180" href="/img/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/img/favicon-16x16.png" />
        <link rel="manifest" href="/img/site.webmanifest" />
    </head>
    <body>

<script type="text/javascript">
(function() {
    if (typeof EnnuicastrClient !== "undefined") {
        if (<?JS= !!uid ?>) {
            // Already logged in
            document.location.href = "/panel/";
        } else {
            // Need to redirect to the browser
            EnnuicastrClient().login();
            document.location.href = "login-client.jss";
        }

    } else {
        // Browser
        ennuicastrClientLogin = true;

    }
})();

</script>

<iframe
    style="border: 0; position: absolute; left: 0; top: 0; width: 100%; height: 100%;"
    src="<?JS= frame ?>"
    id="login-frame">
</iframe>

    </body>
</html>
