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
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const id36 = require("../id36.js");

const cp = require("child_process");
const fs = require("fs");
const tmp = require("tmp-promise");

var tmpdir = null;

function fail(msg) {
    if (msg) sock.send(JSON.stringify(msg));
    sock.close();
    if (tmpdir)
        tmpdir.cleanup();
    if (tmpout)
        tmpout.end();
}

var tmpout = fs.createWriteStream("tmp.out");

try {
    // The first message must be the upload information
    var req = await new Promise(function(res, rej) {
        sock.once("message", (msg) => {
            try {
                msg = JSON.parse(Buffer.from(msg).toString("utf8"));
            } catch (ex) {
                rej(ex);
            }
            res(msg);
        });
    });

    // Make sure they have a session
    await session.init();
    var uid = await session.get("uid");
    if (!uid) return fail({error: "You are not logged in"});

    // Get the request into the correct format
    if (typeof req !== "object" ||
        req.c !== "upload" ||
        typeof req.n !== "string" ||
        typeof req.l !== "boolean" ||
        typeof req.e !== "string")
        return fail();
    var name = req.n.slice(0, config.limits.soundNameLength);
    if (name === "")
        name = "Anonymous";
    var level = req.l;
    var ext = req.e.replace(/[^A-Za-z0-9]/g, "_").slice(0, 5);

    // Now we await the actual file data
    var data = await new Promise(function(res, rej) {
        var data = Buffer.alloc(0);

        function message(chunk) {
            if (chunk.length < 1)
                rej();

            // 0: More data. 1: Done with data.
            if (chunk[0] === 1) {
                res(data);
            } else if (chunk[0] !== 0) {
                rej();
            }
            sock.once("message", message);
            chunk = chunk.subarray(1);

            data = Buffer.concat([data, chunk]);

            if (data.length > 32*1024*1024 /* FIXME: configurable size */)
                rej();
        }

        sock.once("message", message);
        sock.on("close", rej);
    });

    // Put the file somewhere
    tmpdir = await tmp.dir({unsafeCleanup: true});
    var inFile = tmpdir.path + "/in." + ext;
    fs.writeFileSync(inFile, data);

    // Get its duration using ffprobe
    var duration = await new Promise(function(res, rej) {
        var p = cp.spawn("ffprobe", ["-print_format", "json", "-show_streams", inFile], {
            stdio: ["ignore", "pipe", "ignore"]
        });

        var data = "";

        p.stdout.on("data", (chunk) => {
            data += chunk;
        });

        p.stdout.on("end", () => {
            data = JSON.parse(data);
            res(+data.streams[0].duration);
        });
    });
    if (duration < 1)
        duration = 1;

    // Put it in the DB
    var sid;
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            // Check that we won't go over the duration limit
            var curDuration = (await db.getP("SELECT SUM(duration) AS duration FROM sounds WHERE uid=@UID;", {
                "@UID": uid
            })).duration;
            if (curDuration + duration > 60*60*2 /* FIXME: configurable limit */) {
                await db.runP("ROLLBACK;");
                return fail({error: "You are not allowed more than 2 hours of sound files"});
            }

            // Then add it
            sid = id36.genID(32);
            await db.runP("INSERT INTO sounds " +
                          "( uid,  sid,  name,  duration) VALUES " +
                          "(@UID, @SID, @NAME, @DURATION);", {
                "@UID": uid,
                "@SID": sid,
                "@NAME": name,
                "@DURATION": duration
            });

            await db.runP("COMMIT;");
            break;

        } catch (ex) {
            await db.runP("ROLLBACK;");

        }
    }

    // Perform the conversions
    async function convert(step, steps, oext, fargs) {
        var args;
        if (level) {
            var reduction;
            if (duration > 10)
                reduction = 20;
            else
                reduction = 10;
            args = [
                "-stream_loop", "-1", "-i", inFile,
                "-i", inFile,
                "-filter_complex", "[0:a]atrim=0:10[aud]; [aud][1:a]concat=v=0:a=1,dynaudnorm,atrim=10,asetpts=PTS-STARTPTS,volume=-" + reduction + "dB[aud]",
                "-map", "[aud]"
            ];

        } else {
            args = ["-i", inFile];

        }

        args = args.concat([
            "-ar", "48000", "-ac", "2"
        ]).concat(fargs).concat([
            config.sounds + "/" + sid + "." + oext
        ]);

        tmpout.write(JSON.stringify(args) + "\n");

        await new Promise(function(res, rej) {
            var p = cp.spawn("ffmpeg", args, {stdio: "pipe"});

            p.stderr.on("data", (chunk) => {
                var time = /time=([0-9:]*)/.exec(chunk);
                if (!time) return;
                sock.send(JSON.stringify({c: "s", s: [step, steps], t: time[1]}));
            });

            p.on("exit", (code, signal) => {
                if (signal)
                    rej(signal);
                if (code)
                    rej(code);
                res(code);
            });
        });
    }

    try {
        await convert(1, 2, "webm", [
            "-f", "webm", "-c:a", "libopus", "-b:a", "128k"
        ]);
        await convert(2, 2, "m4a", [
            "-f", "ipod", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"
        ]);

    } catch (ex) {
        // FIXME: Delete the leftover bits
        return fail({error: "Unrecognized audio file"});

    }

    // Now it's ready
    log("sound-create", "", {uid, sid, name});
    tmpdir.cleanup();
    sock.send(JSON.stringify({c: "uploaded", sid, name}));
    sock.close();

} catch (ex) {
    sock.close();

}
