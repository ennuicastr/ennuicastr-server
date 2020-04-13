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

const config = require("../config.js");
const login = await include("../login.jss");

const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(config.google.clientId);

// Perform an actual login if that's the request
if (request.body && request.body.token) {
    // Verify it
    const ticket = await client.verifyIdToken({
        idToken: request.body.token,
        audience: config.google.clientId
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.sub)
        return write('{"success": false}');

    // Log in with this ID
    await login.login("google:" + payload.sub, {
        name: payload.name,
        email: payload.email
    });

    write('{"success": true}');
    return;

}

// Otherwise, this is the login landing page
await include("../../../head.jss", {menu: false, title: "Log in — Google"});
?>

<section class="wrapper special">
    Logging in...
</section>

<script type="text/javascript">
    function googleInit() {
        gapi.load("auth2", function() {
            gapi.auth2.init({client_id: <?JS= JSON.stringify(config.google.clientId) ?>}).then(function() {
                try {
                    googleSignIn(gapi.auth2.getAuthInstance().currentUser.get());
                } catch (ex) {
                    googleError(ex);
                }
            }, googleError);
        });
    }

    function googleSignIn(googleUser) {
        var token = googleUser.getAuthResponse().id_token;
        if (!token) {
            // Not logged in?
            googleError("Check for browser plugins blocking Google's cookies.");
            return;
        }

        fetch("/panel/login/google/", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({token: token})

        }).then(function(res) {
            return res.text();

        }).then(function(res) {
            googleUser.disconnect();
            res = JSON.parse(res);
            if (res.success)
                document.location = "/panel/";
            else
                googleError();

        }).catch(googleError);
    }

    function googleError(ex) {
        alert("Failed to log in! " + (ex||""));
        document.location = "/panel/login/";
    }
</script>
<script src="https://apis.google.com/js/platform.js?onload=googleInit" async defer></script>

<?JS
await include("../../../tail.jss");
?>
