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

const config = require("../config.js");
if (!params.QUERY_STRING) {
    writeHead(302, {"location": config.site});
    return;
}

const db = require("../db.js").db;
const lobby = await db.getP("SELECT * FROM lobbies WHERE lid=@LID;", {"@LID": params.QUERY_STRING});
if (!lobby) {
    writeHead(302, {"location": config.site});
    return;
}
const lobbyNameHTML = lobby.name.replace(/\u0022/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
?>
<!doctype html>
<html>
    <head>
        <title><?JS= lobbyNameHTML ?> — Ennuicastr</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="lobby.css" rel="stylesheet" />
        <link rel="apple-touch-icon" sizes="180x180" href="/img/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/img/favicon-16x16.png" />
        <link rel="manifest" href="/img/site.webmanifest" />
    </head>
    <body>
        <script type="text/javascript">
            lobbyId = <?JS= JSON.stringify(lobby.lid) ?>;
            lobbyName = <?JS= JSON.stringify(lobby.name) ?>;
        </script>

        <div id="status-surround">
            <span id="status">
                Connecting...
            </span>
        </div>

        <script type="text/javascript" src="lobby.jss"></script>
    </body>
</html>
