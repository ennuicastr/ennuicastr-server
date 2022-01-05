#!/bin/sh
# Copyright (c) 2017-2022 Yahweasel
#
# Permission to use, copy, modify, and/or distribute this software for any
# purpose with or without fee is hereby granted, provided that the above
# copyright notice and this permission notice appear in all copies.
#
# THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
# WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
# MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
# SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
# WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
# OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
# CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

timeout() {
    /usr/bin/timeout -k 5 "$@"
}

DEF_TIMEOUT=21600
ulimit -v $(( 8 * 1024 * 1024 ))
echo 10 > /proc/self/oom_adj

SCRIPTBASE=`dirname "$0"`
SCRIPTBASE=`realpath "$SCRIPTBASE"`

# Use postproc.sh <base directory> <ID>

[ "$1" ]
RECBASE="$1"
shift

[ "$1" ]
ID="$1"
shift

cd "$RECBASE"

# Improve the captions
timeout $DEF_TIMEOUT "$SCRIPTBASE/caption-improver.js" \
    "$ID.ogg.captions" "$ID"
