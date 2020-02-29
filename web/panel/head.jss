<?JS!
const config = (arguments[1] || {});
const econfig = require("../config.js");

await include("../head.jss", config);
?>

<!--
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
-->

<?JS if (config.paypal) { ?>
<script type="text/javascript">
PayPalLoader = (function() {
    var l = {};
    var scr = document.createElement("script");
    scr.async = true;
    scr.defer = true;
    scr.src = "https://www.paypal.com/sdk/js?client-id=<?JS= econfig.paypal.clientId + (config.paypalArgs || "") ?>";
    l.loaded = false;
    scr.addEventListener("load", function() {
        l.loaded = true;
    });

    l.load = function() {
        return new Promise(function(resolve) {
            if (l.loaded) {
                resolve();
            } else {
                scr.addEventListener("load", resolve);
            }
        });
    };

    document.body.appendChild(scr);
    return l;
})();
</script>
<?JS } ?>

<section id="banner" class="small">
    <p><?JS
        if (config.title)
            write('<a href="/panel/">Ennuicastr</a> → ' + config.title);
        else
            write("Ennuicastr");
    ?>
    <a href="#" style="float: right; margin-right: 1em" id="theme-b"><i class="fas fa-sun"></i></a>
    </p>
</section>
