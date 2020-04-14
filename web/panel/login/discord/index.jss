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

const nrc = new (require("node-rest-client-promise")).Client();

const config = require("../config.js");
const login = await include("../login.jss");

// Make sure we're an actual login
if (!request.query.code) {
    writeHead(302, {"location": "/panel/login/"});
    return;
}

const authorization = "Basic " + Buffer.from(config.discord.clientId + ":" + config.discord.secret).toString("base64");

// Get a client access token
var token = await nrc.postPromise("https://discordapp.com/api/v6/oauth2/token", {
    headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization
    },
    parameters: {
        grant_type: "authorization_code",
        code: request.query.code,
        redirect_uri: config.panel + "login/discord/",
        scope: "identify email"
    }
});
token = token.data;

if (!("access_token" in token)) {
    write("Failed to log in with Discord!");
    return;
}

// Get the account info
var ainfo = await nrc.getPromise("https://discordapp.com/api/v6/users/@me", {
    headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Bearer " + token.access_token
    }
});
ainfo = ainfo.data;

if (!("id" in ainfo)) {
    write("Failed to log in with Discord!");
    return;
}

// Log in with this ID
await login.login("discord:" + ainfo.id, {email: ainfo.email});

// Redirect to the panel
writeHead(302, {"location": "/panel/"});
?>
