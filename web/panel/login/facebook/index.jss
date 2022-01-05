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

const fs = require("fs");
const util = require("util");

const nrc = new (require("node-rest-client-promise")).Client();

const config = require("../config.js");
const login = await include("../login.jss");

// Make sure we're an actual login
if (!request.query.code) {
    writeHead(302, {"location": "/panel/login/"});
    return;
}

// Get a client access token
var token = await nrc.getPromise("https://graph.facebook.com/v6.0/oauth/access_token?" +
    "client_id=" + encodeURIComponent(config.facebook.appId) +
    "&redirect_uri=" + encodeURIComponent(config.panel + "login/facebook/") +
    "&client_secret=" + encodeURIComponent(config.facebook.secret) +
    "&code=" + encodeURIComponent(request.query.code));
token = token.data;

if (!("access_token" in token)) {
    write("Failed to log in with Facebook!");
    return;
}

// Get an app access token
var atoken = await nrc.getPromise("https://graph.facebook.com/v6.0/oauth/access_token?" +
    "client_id=" + encodeURIComponent(config.facebook.appId) +
    "&client_secret=" + encodeURIComponent(config.facebook.secret) +
    "&grant_type=client_credentials");
atoken = atoken.data;

// Get the account ID
var id = await nrc.getPromise("https://graph.facebook.com/v6.0/debug_token?" +
    "input_token=" + encodeURIComponent(token.access_token) +
    "&access_token=" + encodeURIComponent(atoken.access_token));
id = id.data;
try {
    id = JSON.parse(id);
} catch (ex) {}
if ("data" in id) id = id.data;

if (!("user_id" in id)) {
    write("Failed to log in with Facebook!");
    return;
}

// Get the account info
var profile = await nrc.getPromise("https://graph.facebook.com/v6.0/" + id.user_id + "/?" +
    "access_token=" + encodeURIComponent(token.access_token));
profile = profile.data;
try {
    profile = JSON.parse(profile);
} catch (ex) {}

// Log in with this ID
await login.login("facebook:" + id.user_id, {name: profile.name});

// Redirect to the panel
writeHead(302, {"location": "/panel/"});
?>
