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

(function() {
    var status = document.getElementById("status");
    var sock, ping = null;
    var done = false;

    function fail(ex) {
        if (done)
            return;
        done = true;
        status.innerText = "Failed to connect!";
        if (ping) {
            clearInterval(ping);
            ping = null;
        }
    }

    function start() {
        sock = new WebSocket("wss://l.ecastr.com/ws");
        sock.addEventListener("open", connected);
    }
    start();

    function connected() {
        sock.addEventListener("message", message);
        sock.addEventListener("error", fail);
        sock.addEventListener("close", fail);

        setTimeout(function() {
            if (!done)
                status.innerText = "You've been invited to join the recording room " +
                    lobbyName + ", but there is not currently an active " +
                    "recording in that room. Please wait, and you will be " +
                    "redirected to the recording when it is created.";
        }, 200);

        // Send periodic pings
        ping = setInterval(function() {
            sock.send('{"c": "ping"}');
        }, 30000);

        // Send our "login" message
        sock.send(JSON.stringify({c: "listen", l: lobbyId}));
    }

    function message(msg) {
        msg = msg.data;
        try {
            msg = JSON.parse(msg);
        } catch (ex) {
            fail();
            return;
        }

        if (msg.c === "lobby-update") {
            done = true;
            status.innerText = "Redirecting...";
            document.location = msg.u;
        }
    }
})();
