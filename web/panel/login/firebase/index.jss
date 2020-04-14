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

const fs = require("fs");
const util = require("util");

const admin = require("firebase-admin");

const config = require("../config.js");
const login = await include("../login.jss");

// Are we performing the actual login, or just displaying the UI?
if (request.query.token) {
    // Initialize Firebase
    admin.initializeApp({
        credential: admin.credential.cert(require(config.firebase.serviceAccountKey.replace(/~/g, process.env.HOME))),
        databaseURL: config.firebase.config.databaseURL
    });

    // Verify the token
    var token = null;
    try {
        token = await admin.auth().verifyIdToken(request.query.token);
    } catch (ex) {
        writeHead(302, {"location": "/panel/login/"});
        return;
    }

    // We only support email-password signin with Firebase
    if (token.firebase.sign_in_provider !== "password") {
        writeHead(302, {"location": "/panel/login/"});
        return;
    }

    // We demand a verified email address
    if (!token.email_verified) {
        writeHead(302, {"location": "/panel/login/"});
        return;
    }

    // Log in with this ID
    await login.login("firebase:password:" + token.uid, {name: token.name, email: token.email});

    // Redirect to the panel
    writeHead(302, {"location": "/panel/"});

    return;
}

// Otherwise, this is the login landing page
await include("../../../head.jss", {menu: false, title: "Log in — Email"});
?>

<link type="text/css" rel="stylesheet" href="https://www.gstatic.com/firebasejs/ui/4.5.0/firebase-ui-auth.css" />

<section class="wrapper special">
    <p id="firebaseui-auth-container">Loading...</p>

    <p>NOTE: Email/password login is provided by <a href="https://firebase.google.com/">Firebase</a>, a service by Google. Ennuicastr itself does not know or store any account passwords.</p>

    <p><a href="/panel/login/">Use another login method</a></p>

    <p><a href="/">Return to home page</a></p>
</section>

<script type="text/javascript">
var firebaseConfig = <?JS= JSON.stringify(config.firebase.config) ?>;
</script>

<script type="text/javascript">(function() {
    var container = document.getElementById("firebaseui-auth-container");

    function load(src) {
        return new Promise(function(res, rej) {
            var scr = document.createElement("script");
            scr.async = true;
            scr.src = src;
            scr.onload = res;
            scr.onerror = rej;
            document.body.appendChild(scr);
        });
    }

    load("https://www.gstatic.com/firebasejs/7.14.0/firebase-app.js").then(function() {
        return load("https://www.gstatic.com/firebasejs/7.14.0/firebase-auth.js");
    }).then(function() {
        return load("https://www.gstatic.com/firebasejs/ui/4.5.0/firebase-ui-auth.js");
    }).then(function() {
        firebase.initializeApp(firebaseConfig);
        var ui = new firebaseui.auth.AuthUI(firebase.auth());
        container.innerHTML = "";

        ui.start('#firebaseui-auth-container', {
            signInOptions: [
                firebase.auth.EmailAuthProvider.PROVIDER_ID
            ],
            callbacks: {
                signInSuccessWithAuthResult: signedIn
            },
            credentialHelper: firebaseui.auth.CredentialHelper.NONE,
            tosUrl: <?JS= JSON.stringify(config.site + "terms.jss") ?>,
            privacyPolicyUrl: <?JS= JSON.stringify(config.site + "privacy.jss") ?>
        });
    });

    function signedIn(user) {
        user = user.user;
        container.innerText = "Loading...";
        if (user.emailVerified) {
            user.getIdToken(true).then(function(idToken) {
                document.location = "/panel/login/firebase/?token=" + encodeURIComponent(idToken);
            });
        } else {
            user.sendEmailVerification().then(function() {
                container.innerHTML = "Verification email sent. Please check your inbox. When you've verified your email address, <a href=\"?\">log in</a>.";
            }).catch(function() {
                container.innerText = "Error sending verification email! Please use a different login method.";
            });
        }
    }
})();</script>

<?JS
await include("../../../tail.jss");
?>
