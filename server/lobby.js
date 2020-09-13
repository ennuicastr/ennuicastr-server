#!/usr/bin/env node
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

const fs = require("fs");
const http = require("http");
const net = require("net");
const ws = require("ws");

const config = require("../config.js");
const db = require("../db.js").db;

var hs;
var wss;

function start() {
    var hst = http.createServer();

    hst.on("error", (err) => {
        console.error(err);
        process.exit(1);
    });

    hst.on("listening", startWS);

    // Start the HTTP server
    try {
        fs.unlinkSync(config.lobbysock);
    } catch (ex) {}
    hst.listen(config.lobbysock);

    // Start the websocket server
    function startWS() {
        hs = hst;
        wss = new ws.Server({
            server: hs
        });

        wss.on("connection", (ws) => {
            // We must receive a login first
            ws.once("message", connection(ws));
        });
    }
}

function connection(ws) {
    return async function(msg) {
        msg = Buffer.from(msg); // Just in case

        try {
            msg = JSON.parse(msg.toString("utf8"));
        } catch (ex) {
            return ws.close();
        }

        // The first message has to be a listen request
        if (msg.c !== "listen" || typeof msg.l !== "string")
            return ws.close();
        var lid = msg.l;

        // The only future message we accept is ping/pong
        ws.on("message", function(msg) {
            msg = Buffer.from(msg);
            try {
                msg = JSON.parse(msg.toString("utf8"));
            } catch (ex) {
                return ws.close();
            }
            if (msg.c !== "ping")
                return ws.close();
            ws.send('{"c": "pong"}');
        });

        var cur;

        /* Get the current status for it, so we don't invoke the server for
         * irrelevant ID's */
        if (await updated())
            return ws.close();

        // We have to wait for a recording to start
        var sock = net.createConnection(config.sock);
        sock.write(JSON.stringify({c: "lobby-listen"}) + "\n");

        ws.on("close", () => {
            sock.end();
        });
        ws.on("error", () => {
            sock.end();
        });

        // Await updates from the buffer
        var buf = Buffer.alloc(0);
        sock.on("data", async function(chunk) {
            buf = Buffer.concat([buf, chunk]);
            var i;
            for (i = 0; i < buf.length && buf[i] !== 10; i++) {}
            if (i === buf.length) return;
            var msg = buf.slice(0, i);
            buf = buf.slice(i+1);

            try {
                msg = JSON.parse(msg.toString("utf8"));
            } catch (ex) {
                ws.close();
                return;
            }

            if (msg.c === "lobby-update" && msg.l === lid) {
                // Got an update!
                if (await updated())
                    return ws.close();
            }
        });
        if (await updated())
            return ws.close();

        async function updated() {
            cur = await db.getP("SELECT * FROM lobbies WHERE lid=@LID;", {"@LID": lid});
            if (!cur) {
                ws.send(JSON.stringify({c: "error", error: "That room does not exist!"}));
                return true;
            }
            if (cur.associated) {
                // It's already associated with a recording
                if (await sendRec(ws, cur.rid))
                    return true;
            }
            return false;
        }
    };
}

async function sendRec(ws, rid) {
    // Get the recording with this ID
    var rec = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
    if (!rec)
        return false;
    if (rec.status >= 0x30 /* finished */)
        return false;

    // Create a URL for this recording
    var features = 0;
    if (rec.continuous)
        features |= 1;
    if (rec.rtc)
        features |= 2;
    if (rec.format === "flac")
        features |= 0x10;
    var url = config.client +
        "?" + rec.rid.toString(36) +
        "-" + rec.key.toString(36) +
        "-p" + rec.port.toString(36) +
        "-f" + features.toString(36);

    ws.send(JSON.stringify({c: "lobby-update", u: url}));
    return true;
}

start();
