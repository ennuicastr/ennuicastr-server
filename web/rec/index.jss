<?JS
/*
 * Copyright (c) 2020-2023 Yahweasel
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

const ua = params.HTTP_USER_AGENT || "";
const isChrome = ua.indexOf("Chrome") >= 0;
const isSafari = ua.indexOf("Safari") >= 0 && !isChrome;
let warning = "";
if (isSafari) {
    const isIOS = ua.indexOf("iPhone") >= 0 || ua.indexOf("iPad") >= 0 || ua.indexOf("iOS") >= 0;

    // Please only use Safari on iOS
    if (isIOS) {
        const isFake = ua.indexOf("CriOS") >= 0 || ua.indexOf("FxiOS") >= 0;
        if (isFake)
            warning = "Non-Safari browsers on iOS do not support microphone capture. Please switch to Safari.";
    }
}
?>
<!doctype html>
<html>
    <head>
        <title>Ennuicastr</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <!--<link href="fa/css/all.min.css" rel="stylesheet" />
        <link href="ennuicastr2.css?v=h" rel="stylesheet" />-->
        <link href="bx/css/boxicons.min.css" rel="stylesheet" />
        <link href="ennuicastr3.css?v=6" rel="stylesheet" />
        <link href="ecastr.css" rel="stylesheet" />
        <link rel="apple-touch-icon" sizes="180x180" href="/img/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/img/favicon-16x16.png" />
        <link rel="manifest" href="/img/site.webmanifest" />
        <script type="text/javascript" src="ecloader.min.js?v=1"></script>
    </head>
    <body>
        <div id="log"><?JS
            if (warning) {
                ?><div style="background-color: #933; color: #fff; text-align: center; border: 2px solid #fff; border-radius: 0.5em; padding: 0.5em; margin: 1em;"><?JS= warning ?></div><?JS
            }
        ?></div>
        <div id="pre-ec" style="display: none">
            <span id="login-ec"></span> 
            <br/><br/>
            <a href="https://ecastr.com/privacy/" target="_blank">Privacy policy</a> —
            <a href="https://ecastr.com/" target="_blank">More information</a></div>
        </div>
        <script type="text/javascript">
            ecLoadLibrary({file: "protocol.js?v=n", name: "Ennuicastr"})
            .then(function() {
            return ecLoadLibrary({
                file: "ennuicastr.js?v=bs",
                name: "Ennuicastr"
            });
            });
        </script>
    </body>
</html>
