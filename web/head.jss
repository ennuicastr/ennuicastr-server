<?JS!
/*
 * Copyright (c) 2020, 2021 Yahweasel
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

// Configure the environment
const config = (arguments[1] || {});
if (!("menu" in config)) config.menu = "panel/menu.jss";
if (!("minimenu" in config)) config.minimenu = false;
const title = (function() {
    if (config.title)
        return config.title + " — Ennuicastr";
    else
        return "Ennuicastr";
})();

// Look for theme cookie
var theme = "";
if ("cookie" in request.headers) {
    var cookies = require("cookie").parse(request.headers.cookie);
    if ("ECTHEME" in cookies) {
        if (cookies.ECTHEME === "dark")
            theme = ' data-theme="dark"';
    }
}

?><!DOCTYPE HTML>
<!--
    Design template: Typify by TEMPLATED
    templated.co @templatedco
    Released for free under the Creative Commons Attribution 3.0 license (templated.co/license)
-->
<html<?JS= theme ?>>
    <head>
        <title><?JS= title ?></title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <!--[if lte IE 8]><script src="/assets/js/ie/html5shiv.js"></script><![endif]-->
        <link rel="stylesheet" href="/assets/css/main.css?v=9" />
        <!--[if lte IE 9]><link rel="stylesheet" href="/assets/css/ie9.css" /><![endif]-->

        <link rel="apple-touch-icon" sizes="180x180" href="/img/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/img/favicon-16x16.png" />
        <link rel="manifest" href="/img/site.webmanifest" />

        <script src="/assets/js/jquery.min.js"></script>
    </head>
    <body>

<?JS if (config.menu) { ?>
        <div id="menushow">
            <button onclick="toggleMenu();" aria-label="Menu"><i class="fas fa-bars"></i></button>
        </div>
        <script type="text/javascript"><!--
            function toggleMenu() {
                var m = $("#menu")[0];
                var ms = $("#menushow")[0];
                if (m.style.display === "none" || m.style.display === "") {
                    m.style.display = "block";
                    ms.style.display = "none";
                } else {
                    m.style.display = "none";
                    ms.style.display = "block";
                }
            }

            function windowResize() {
                var mn = $("#main")[0];
                var m = $("#menu")[0];
                var ms = $("#menushow")[0];
                if (window.innerWidth > 960) {
                    mn.style.marginLeft = m.offsetWidth + "px";
                    m.style.display = ms.style.display = "";
                } else {
                    mn.style.marginLeft = "";
                }
            }
            window.addEventListener("resize", windowResize);
            window.addEventListener("load", windowResize);
        //--></script>

        <div id="menu" role="navigation">
            <?JS await include(config.menu); ?>
        </div>

        <div id="main">
            <script type="text/javascript"><!--
                windowResize();
            --></script>
<?JS } else if (config.minimenu) { ?>
        <div id="minimenu" role="navigation">
            <?JS await include(config.minimenu); ?>
        </div>

        <div id="mainnm">
<?JS } else { ?>
        <div id="mainnm">
<?JS } ?>
