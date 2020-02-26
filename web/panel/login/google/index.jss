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

return;
await session.init();

const config = require("../config.js");
const login = await include("../login.jss");

const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(config.google.clientId);

// Make sure they gave us a token
if (!request.body || !request.body.token)
    return;

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
?>
