/*
 * Copyright (c) 2020-2022 Yahweasel
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
    function renamable(el, cur, id, opts) {
        el.innerHTML = "";
        var span = document.createElement("span");
        span.innerText = cur || "(Anonymous)";
        el.appendChild(span);

        span.onclick = function() {
            el.removeChild(span);
            var inp = document.createElement("input");
            inp.type = "text";
            inp.value = cur;
            inp.onkeydown = function(ev) {
                var value = inp.value;
                if (ev.keyCode === 27) {
                    // Abort
                    renamable(el, cur, id);
                    return true;
                }
                if (ev.keyCode !== 13 || value.trim() === "")
                    return true;
                inp.disabled = true;

                fetch(opts.endpoint || "rename.jss", {
                    method: "POST",
                    headers: {"content-type": "application/json"},
                    body: JSON.stringify({i: id, n: value})

                }).then(function() {
                    renamable(el, value, id);

                });
            };
            el.appendChild(inp);
            inp.focus();
            inp.select();
        }
    }

    Array.prototype.slice.call(document.getElementsByClassName("renamable"), 0).forEach(function(el) {
        var id = el.dataset.id;
        if (!id) return;
        var opts = {};
        if (el.dataset.endpoint)
            opts.endpoint = el.dataset.endpoint;
        renamable(el, el.innerText, id, opts);
    });
})();
