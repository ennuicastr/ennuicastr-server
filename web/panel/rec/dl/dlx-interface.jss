<?JS!
/*
 * Copyright (c) 2020-2024 Yahweasel
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

const {rid, recInfo, safeName} = arguments[1];
?>

<script type="text/javascript" src="<?JS= config.client ?>ecloader.min.js"></script>
<script type="text/javascript" src="ennuicastr-download-processor.min.js?v=7"></script>

<div id="downloader-box" class="ecdl-main">Loading...</div>

<script type="text/javascript" src="ennuicastr-download-chooser.js"></script>

<script type="text/javascript">
EnnuicastrDownloadProcessor.dsLoad({prefix: "/"}).then(function() {
    LibAV = {base: "/assets/libav"};
    return ecLoadLibrary({
        name: "Audio processing",
        file: "/assets/libav/libav-4.8.6.0.1-ecdl.js"
    });
}).then(function() {
    return ecLoadLibrary({
        name: "Processing",
        file: "/assets/js/localforage.min.js"
    });
}).then(function() {
    LibSpecBleach = {base: "/assets/libs"};
    return ecLoadLibrary({
        name: "Audio processing",
        file: "/assets/libs/libspecbleach-0.1.7-js2.js"
    });
}).then(function() {
    return ecLoadLibrary({
        name: "Processing",
        file: "/assets/libs/yalap-1.0.1-zip.js"
    });
}).then(function() {

    // Get the metadata for this recording
    return fetch("?i=<?JS= rid.toString(36) ?>&f=info");
}).then(function(resp) {
    return resp.json();
}).then(function(ret) {
    dlChooser(
        <?JS= rid ?>, <?JS= JSON.stringify(safeName) ?>, ret,
        document.getElementById("downloader-box")
    );
}).catch(function(ex) {
    document.location.href = "?i=<?JS= rid.toString(36) ?>&nox=1";
});
</script>

<p>&nbsp;</p>
<p><a href="?i=<?JS= rid.toString(36) ?>&nox=1">Use simple downloader</a></p>
<p>&nbsp;</p>
