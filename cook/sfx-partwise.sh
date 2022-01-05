#!/bin/sh
# Copyright (c) 2019-2022 Yahweasel
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

DEF_TIMEOUT=43200
ulimit -v $(( 8 * 1024 * 1024 ))
echo 10 > /proc/self/oom_adj

PATH="/opt/node/bin:$PATH"
export PATH

SCRIPTBASE=`dirname "$0"`
SCRIPTBASE=`realpath "$SCRIPTBASE"`

# Use raw-partwise.sh <ID>

[ "$2" ]
RECBASE="$1"
ID="$2"
STREAMS="$3"

cd "$RECBASE"

NICE="nice -n10 ionice -c3 chrt -i 0"

# If no streams were specified,
if [ ! "$STREAMS" ]
then
    # then just calculate how many we need
    timeout $DEF_TIMEOUT cat $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
        timeout $DEF_TIMEOUT "$SCRIPTBASE/oggmeta" |
        timeout $DEF_TIMEOUT "$SCRIPTBASE/sfx.js"
    exit 0
fi

# Output each requested component
for c in $STREAMS
do
    LFILTER="$(timeout $DEF_TIMEOUT cat $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
               timeout $DEF_TIMEOUT "$SCRIPTBASE/oggmeta" |
               timeout $DEF_TIMEOUT "$SCRIPTBASE/sfx.js" $((c-1)))"
    timeout $DEF_TIMEOUT $NICE ffmpeg -nostdin -filter_complex "$LFILTER" -map '[aud]' -f ogg -page_duration 20000 -c:a flac - < /dev/null
done
